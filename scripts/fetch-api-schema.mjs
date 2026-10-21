#!/usr/bin/env node
// Pull the dmbk GraphQL API's schema (graphql.dmbk.network) into
// schemas/dmbk-graphql-api.graphql, where the Relay compiler reads it.
//
// The API answers introspection publicly, so unlike the WordPress pull this
// needs no setting toggled. Run it when the API's schema changes; the admin's
// Relay operations are validated against this copy at every `pnpm relay`.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const endpoint =
  process.env.DMBK_GRAPHQL_API_URL || "https://graphql.dmbk.network/graphql";

const outFile = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "schemas",
  "dmbk-graphql-api.graphql",
);

const schema = execFileSync("npx", ["get-graphql-schema", endpoint], {
  encoding: "utf-8",
});

mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, schema);

console.log(`Schema from ${endpoint} written to ${outFile}`);
