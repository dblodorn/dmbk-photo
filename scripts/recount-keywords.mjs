#!/usr/bin/env node
// Recompute keyword vocabulary counts from the photos themselves.
//
// A count reflects publicly visible photos: ready and not hidden.
//
// Counts are maintained incrementally with $inc on every write, so a partially
// failed write can leave them drifted. They are advisory — used to order filter
// controls, never for correctness — and this script is the repair.
//
// Usage: node --env-file=.env.local scripts/recount-keywords.mjs
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error(
    "MONGODB_URI is not set. Run with: node --env-file=.env.local scripts/recount-keywords.mjs",
  );
  process.exit(1);
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const dbName =
    new URL(uri).pathname.split("/").filter(Boolean)[0] ?? "dmbk-photos";
  const db = client.db(dbName);

  // Truth: how many *publicly visible* photos carry each slug. `ready` alone is
  // not enough — a hidden photo must not advertise keywords that return
  // nothing. A record predating the `hidden` field counts as visible.
  const actual = await db
    .collection("photos")
    .aggregate([
      { $match: { status: "ready", hidden: { $ne: true } } },
      { $unwind: "$keywords" },
      { $group: { _id: "$keywords", count: { $sum: 1 } } },
    ])
    .toArray();

  const actualBySlug = new Map(actual.map((r) => [r._id, r.count]));
  const stored = await db.collection("keywords").find({}).toArray();

  let corrected = 0;
  for (const doc of stored) {
    const truth = actualBySlug.get(doc._id) ?? 0;
    if (doc.count !== truth) {
      console.log(`  ${doc._id}: ${doc.count} → ${truth}`);
      corrected++;
      if (truth === 0) {
        await db.collection("keywords").deleteOne({ _id: doc._id });
      } else {
        await db
          .collection("keywords")
          .updateOne({ _id: doc._id }, { $set: { count: truth } });
      }
    }
  }

  // Slugs carried by photos but missing from the vocabulary entirely.
  for (const [slug, count] of actualBySlug) {
    if (!stored.some((d) => d._id === slug)) {
      console.log(`  ${slug}: missing → ${count}`);
      corrected++;
      await db
        .collection("keywords")
        .insertOne({ _id: slug, label: slug, count });
    }
  }

  console.log(
    corrected === 0
      ? "Keyword counts are already correct."
      : `Corrected ${corrected} keyword count(s).`,
  );
} finally {
  await client.close();
}
