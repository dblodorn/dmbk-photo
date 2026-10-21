#!/usr/bin/env node
// Backfill the `hidden` flag onto photos written before it existed.
//
// The public listing matches `hidden: false` exactly so the index can seek. A
// lenient `{ $ne: true }` would need no migration but cannot use an index,
// turning the hottest query in the system into a scan — hence a real backfill.
//
// Idempotent: only documents missing the field are touched, so re-running is
// harmless. Records without `hidden` are treated as visible, which is what they
// were before hiding existed.
//
// Usage: node --env-file=.env.local scripts/backfill-hidden.mjs [--dry-run]
import { MongoClient } from "mongodb";

const dryRun = process.argv.includes("--dry-run");

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error(
    "MONGODB_URI is not set. Run with: node --env-file=.env.local scripts/backfill-hidden.mjs",
  );
  process.exit(1);
}

const SCHEMA_VERSION = 2;
const client = new MongoClient(uri);

try {
  await client.connect();
  const dbName =
    new URL(uri).pathname.split("/").filter(Boolean)[0] ?? "dmbk-photos";
  const photos = client.db(dbName).collection("photos");

  const total = await photos.countDocuments();
  const missing = await photos.countDocuments({ hidden: { $exists: false } });

  console.log(`${dbName}: ${total} photo(s), ${missing} missing \`hidden\``);

  if (missing === 0) {
    console.log("Nothing to backfill.");
  } else if (dryRun) {
    console.log(`[dry-run] would set hidden=false on ${missing} photo(s)`);
  } else {
    const res = await photos.updateMany(
      { hidden: { $exists: false } },
      { $set: { hidden: false, schemaVersion: SCHEMA_VERSION } },
    );
    console.log(`Backfilled ${res.modifiedCount} photo(s).`);
  }

  const remaining = await photos.countDocuments({ hidden: { $exists: false } });
  console.log(
    remaining === 0
      ? "Every photo now carries `hidden`."
      : `WARNING: ${remaining} photo(s) still missing the field.`,
  );
} finally {
  await client.close();
}
