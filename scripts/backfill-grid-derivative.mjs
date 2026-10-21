#!/usr/bin/env node
// Generate the 1000px grid derivative for photos finalized before it existed.
//
// The gallery offers the browser every variant a photo has, so a photo without
// this one is not broken — it simply falls back to the 400px thumbnail and
// renders soft on a wide, high-density display, which is the whole reason the
// variant was added. This brings the existing library up to date.
//
// Idempotent by query: it only ever selects photos that lack the variant, so
// re-running processes whatever is left and rewrites nothing.
//
// Usage: node --env-file=.env.local scripts/backfill-grid-derivative.mjs [--dry-run]
import { MongoClient } from "mongodb";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";

const dryRun = process.argv.includes("--dry-run");

/** Must match GRID_MAX_EDGE in src/lib/photos/constants.ts. */
const GRID_MAX_EDGE = 1000;

/** Must match PHOTO_SCHEMA_VERSION in src/server/api/db.ts. */
const PHOTO_SCHEMA_VERSION = 3;

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error(
    "MONGODB_URI is not set. Run with: node --env-file=.env.local scripts/backfill-grid-derivative.mjs",
  );
  process.exit(1);
}

const bucket = process.env.DO_SPACES_BUCKET;
let endpoint = process.env.DO_SPACES_ENDPOINT ?? "";
// With forcePathStyle the bucket belongs in the path, not the endpoint.
if (bucket && endpoint.includes(`${bucket}.`)) {
  endpoint = endpoint.replace(`${bucket}.`, "");
}

if (!bucket || !endpoint) {
  console.error(
    "DO_SPACES_BUCKET and DO_SPACES_ENDPOINT are required — this script reads originals and writes derivatives.",
  );
  process.exit(1);
}

const spaces = new S3Client({
  endpoint,
  region: process.env.DO_SPACES_REGION,
  credentials: {
    accessKeyId: process.env.DO_SPACES_KEY,
    secretAccessKey: process.env.DO_SPACES_SECRET,
  },
  forcePathStyle: true,
});

/** The grid key the dmbk GraphQL API writes (its src/lib/spaces/keys.ts). */
const gridKeyFor = (id) => `photos/${id}/grid.webp`;

/**
 * Mirrors the grid variant the dmbk GraphQL API builds at finalize (its
 * src/lib/photos/images.ts) — including `.rotate()`,
 * which applies EXIF orientation before the edges are measured. Without it a
 * quarter-turned original would produce a derivative at odds with the
 * dimensions already recorded on the photo, and the gallery would reserve the
 * wrong box for it.
 */
async function makeGrid(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({
      width: GRID_MAX_EDGE,
      height: GRID_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp()
    .toBuffer();
}

/**
 * A readable one-line reason.
 *
 * The S3 client reports a missing object as `UnknownError` with an empty
 * message on a HEAD-shaped failure, which tells an operator nothing about
 * which of the two stores is at fault — so fall back to the error's name and
 * carry the HTTP status when there is one.
 */
function describe(error) {
  const status = error?.$metadata?.httpStatusCode;
  const base = error?.message || error?.name || String(error);
  if (status === 404) return `original not found in the Space (404)`;
  return status ? `${base} (HTTP ${status})` : base;
}

const client = new MongoClient(uri);
const failures = [];

try {
  await client.connect();
  const dbName =
    new URL(uri).pathname.split("/").filter(Boolean)[0] ?? "dmbk-photos";
  const photos = client.db(dbName).collection("photos");

  // `$exists: false` as well as null: records written before the field was
  // added carry no key at all, and an equality match on null covers both in
  // MongoDB — stated explicitly so the intent survives a reader's doubt.
  const pending = await photos
    .find({
      status: "ready",
      $or: [{ gridKey: null }, { gridKey: { $exists: false } }],
    })
    .toArray();

  if (pending.length === 0) {
    console.log("Every ready photo already has a grid variant.");
  } else {
    console.log(
      `${dryRun ? "[dry-run] " : ""}${pending.length} photo(s) to process.`,
    );
  }

  let done = 0;
  for (const doc of pending) {
    const key = gridKeyFor(doc._id);

    if (dryRun) {
      console.log(`[dry-run] ${doc._id} -> ${key}`);
      continue;
    }

    try {
      if (!doc.originalKey) {
        throw new Error("record has no originalKey");
      }

      const object = await spaces.send(
        new GetObjectCommand({ Bucket: bucket, Key: doc.originalKey }),
      );
      const original = Buffer.from(await object.Body.transformToByteArray());

      const body = await makeGrid(original);
      const { width, height } = await sharp(body).metadata();

      await spaces.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: "image/webp",
          ACL: "public-read",
        }),
      );

      await photos.updateOne(
        { _id: doc._id },
        {
          $set: {
            gridKey: key,
            schemaVersion: PHOTO_SCHEMA_VERSION,
            updatedAt: new Date().toISOString(),
          },
        },
      );

      done += 1;
      console.log(
        `  ${doc._id} -> ${key} (${width}x${height}, ${(body.length / 1024).toFixed(0)}KB)`,
      );
    } catch (error) {
      // Deliberately not marked `failed`. The photo still has its original and
      // its other derivatives, so it renders exactly as it did before this
      // script ran — a missing optional variant is not a broken photo, and
      // demoting it would take a working photo out of the public gallery.
      const message = describe(error);
      failures.push({ id: doc._id, message });
      console.error(`  ${doc._id}: ${message}`);
    }
  }

  if (!dryRun && done) {
    console.log(`Backfilled ${done} photo(s).`);
  }
} finally {
  await client.close();
}

if (failures.length) {
  console.error(`\n${failures.length} photo(s) could not be processed:`);
  for (const { id, message } of failures) {
    console.error(`  ${id}: ${message}`);
  }
  console.error("Each was left untouched. Re-run to retry only these.");
  process.exit(1);
}
