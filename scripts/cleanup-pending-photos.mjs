#!/usr/bin/env node
// Remove abandoned and failed photo records, along with any bytes they left in
// Spaces.
//
// A reservation creates a `pending` record and a 15-minute presigned URL. If
// the client never finalizes, that record sits there forever with possibly
// orphaned bytes behind it. `ready` photos are never touched.
//
// Usage: node --env-file=.env.local scripts/cleanup-pending-photos.mjs [--dry-run]
import { MongoClient } from "mongodb";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

const dryRun = process.argv.includes("--dry-run");

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error(
    "MONGODB_URI is not set. Run with: node --env-file=.env.local scripts/cleanup-pending-photos.mjs",
  );
  process.exit(1);
}

const bucket = process.env.DO_SPACES_BUCKET;
let endpoint = process.env.DO_SPACES_ENDPOINT ?? "";
// With forcePathStyle the bucket belongs in the path, not the endpoint.
if (bucket && endpoint.includes(`${bucket}.`)) {
  endpoint = endpoint.replace(`${bucket}.`, "");
}

const spaces =
  bucket && endpoint
    ? new S3Client({
        endpoint,
        region: process.env.DO_SPACES_REGION,
        credentials: {
          accessKeyId: process.env.DO_SPACES_KEY,
          secretAccessKey: process.env.DO_SPACES_SECRET,
        },
        forcePathStyle: true,
      })
    : null;

// Records older than this with no successful finalize are abandoned. Comfortably
// past the 15-minute presigned URL lifetime.
const ABANDONED_AFTER_MS = 60 * 60 * 1000;

const client = new MongoClient(uri);

try {
  await client.connect();
  const dbName =
    new URL(uri).pathname.split("/").filter(Boolean)[0] ?? "dmbk-photos";
  const photos = client.db(dbName).collection("photos");

  const cutoff = new Date(Date.now() - ABANDONED_AFTER_MS).toISOString();
  const stale = await photos
    .find({
      $or: [
        { status: "pending", createdAt: { $lt: cutoff } },
        { status: "failed" },
      ],
    })
    .toArray();

  if (stale.length === 0) {
    console.log("Nothing to clean up.");
  }

  for (const doc of stale) {
    const keys = [
      doc.originalKey,
      doc.displayKey,
      doc.gridKey,
      doc.thumbKey,
    ].filter(Boolean);
    console.log(
      `${dryRun ? "[dry-run] " : ""}${doc.status} ${doc._id} (${keys.length} object(s))`,
    );
    if (dryRun) continue;

    if (spaces) {
      for (const Key of keys) {
        try {
          await spaces.send(new DeleteObjectCommand({ Bucket: bucket, Key }));
        } catch (error) {
          // An already-missing object is the expected case for an abandoned
          // upload that never completed its PUT.
          if (error?.$metadata?.httpStatusCode !== 404) {
            console.error(`  failed to delete ${Key}:`, error.message);
          }
        }
      }
    }
    await photos.deleteOne({ _id: doc._id });
  }

  if (!dryRun && stale.length) {
    console.log(`Removed ${stale.length} record(s).`);
  }
} finally {
  await client.close();
}
