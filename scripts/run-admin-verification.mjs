#!/usr/bin/env node
// Runner for the headless admin UI verification.
//
// Every photo write is made by the dmbk GraphQL API, so the run needs one: a
// local `dmbk-graphql-api` (`npm run dev` in that repo, on
// http://localhost:4000/graphql by default) using the same Atlas data and
// Space. The runner mints two sessions for that API's `.invalid` test admin —
// one planted in the browser, one for the script's own setup and teardown, so
// the sign-out check at the end cannot revoke the session cleanup needs — then
// starts a production server on port 3000 pointed at the local API, drives the
// real admin pages in Chromium, and stops it. The test admin is removed at the
// end.
//
// Port 3000 specifically: the Space's CORS rules permit browser PUT from
// http://localhost:3000, and the upload flow sends bytes straight to storage.
// On any other port the presigned PUT is blocked and uploads never finalize.
//
// Requires `pnpm build` first, a free port 3000 (stop anything else on it,
// including on 127.0.0.1), and in the API repo: `npm run test:mutations --
// --setup` once, then `npm run dev`.
//
// It deletes only the photos it created; anything already in the library is
// left untouched. Its setup and before/after accounting read the photo
// library's database directly, which this app's own credentials no longer
// reach, so the runner uses the API checkout's `MONGODB_URI` for that.
//
// Usage: pnpm verify:admin
//   VERIFY_API_URL   the local API (default http://localhost:4000/graphql)
//   VERIFY_API_REPO  its checkout (default ../dmbk-graphql-api)
//   VERIFY_MONGODB_URI  overrides the connection taken from that checkout's .env
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = 3000;
const BASE = `http://localhost:${PORT}`;
const API_URL = process.env.VERIFY_API_URL ?? "http://localhost:4000/graphql";
const API_REPO = path.resolve(process.env.VERIFY_API_REPO ?? "../dmbk-graphql-api");

const apiHelp = `Start the API first: in ${API_REPO}, run \`npm run test:mutations -- --setup\` once, then \`npm run dev\`.`;

// Pre-flight: refuse to start without the API rather than failing every check.
try {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "{ __typename }" }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`answered ${res.status}`);
} catch (error) {
  console.error(`The dmbk GraphQL API is not answering at ${API_URL} (${error.message}).\n${apiHelp}`);
  process.exit(1);
}

/** A fresh session for the API's test admin, from the API repo's own harness. */
function mintAdminToken() {
  const out = execFileSync("npm", ["run", "-s", "test:mutations", "--", "--admin-token"], {
    cwd: API_REPO,
    env: { ...process.env, API_URL },
    encoding: "utf8",
  });
  const token = out.trim().split("\n").pop();
  if (!token) throw new Error(`No token printed. ${apiHelp}`);
  return token;
}

/** The API checkout's own connection string, which can reach dmbk-photos. Never printed. */
function photosMongoUri() {
  if (process.env.VERIFY_MONGODB_URI) return process.env.VERIFY_MONGODB_URI;
  let envFile;
  try {
    envFile = readFileSync(path.join(API_REPO, ".env"), "utf8");
  } catch {
    throw new Error(`No .env in ${API_REPO}; set VERIFY_MONGODB_URI instead.`);
  }
  const line = envFile.split("\n").find((l) => l.startsWith("MONGODB_URI="));
  const uri = line?.slice("MONGODB_URI=".length).trim().replace(/^["']|["']$/g, "");
  if (!uri) throw new Error(`No MONGODB_URI in ${API_REPO}/.env; set VERIFY_MONGODB_URI instead.`);
  return uri;
}
const MONGODB_URI = photosMongoUri();

console.log("Minting test admin sessions on the API…");
const SESSION_TOKEN = mintAdminToken();
const API_TOKEN = mintAdminToken();

const fixtures = mkdtempSync(path.join(tmpdir(), "admin-verify-"));
console.log(`Fixtures: ${fixtures}`);

const tsx = ["--yes", "tsx@4", "--env-file=.env.local"];

console.log("Generating fixtures…");
execFileSync("npx", [...tsx, "scripts/make-verify-fixtures.mts", fixtures], { stdio: "inherit" });

console.log(`Starting server on ${PORT} against ${API_URL}…`);
const server = spawn("npx", ["next", "start", "--port", String(PORT)], {
  env: { ...process.env, DMBK_GRAPHQL_API_URL: API_URL },
  stdio: "ignore",
});

const stop = () => {
  if (!server.killed) server.kill();
};
process.on("exit", stop);
process.on("SIGINT", () => {
  stop();
  process.exit(130);
});

// Wait for readiness rather than sleeping a fixed amount.
let ready = false;
for (let i = 0; i < 30; i++) {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(1000) });
    if (res.ok) {
      ready = true;
      break;
    }
  } catch {
    /* not up yet */
  }
  await new Promise((r) => setTimeout(r, 1000));
}

if (!ready) {
  stop();
  console.error(
    `Server never became ready on ${PORT}. Is something else using the port (pnpm dev)?`,
  );
  process.exit(1);
}

let code = 0;
try {
  execFileSync("npx", [...tsx, "scripts/verify-admin-ui.mts"], {
    stdio: "inherit",
    env: {
      ...process.env,
      VERIFY_BASE_URL: BASE,
      VERIFY_FIXTURES: fixtures,
      VERIFY_API_URL: API_URL,
      VERIFY_SESSION_TOKEN: SESSION_TOKEN,
      VERIFY_API_TOKEN: API_TOKEN,
      VERIFY_MONGODB_URI: MONGODB_URI,
    },
  });
} catch {
  code = 1;
}

stop();

// The test admin and any sessions it still holds.
try {
  execFileSync("npm", ["run", "-s", "test:mutations", "--", "--cleanup"], {
    cwd: API_REPO,
    stdio: "inherit",
  });
} catch {
  console.error(`Could not remove the API's test admin; run \`npm run test:mutations -- --cleanup\` in ${API_REPO}.`);
}

process.exit(code);
