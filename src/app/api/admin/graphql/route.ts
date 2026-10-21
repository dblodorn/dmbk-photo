import persistedOperations from "@/server/admin-graphql/persisted-operations.json";
import { SessionServiceError, callApi, readSessionCookie } from "@/server/auth/session";

// The session plumbing it shares with /api/session uses Node APIs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Finalizing a 50 MB original on the API's droplet is the slow call.
export const maxDuration = 60;

const UPSTREAM_TIMEOUT_MS = 55_000;

/*
 * The admin's way to the dmbk GraphQL API (graphql.dmbk.network).
 *
 *   POST { id, variables } → the API's response to that operation
 *
 * The API wants the session token as a bearer; the token lives in the
 * HTTP-only admin cookie, where page scripts cannot read it. So the admin's
 * Relay environment posts here, same-origin, and this attaches the token on
 * the way out — the browser never holds it and never calls the API itself.
 *
 * Only operations the Relay compiler persisted from the admin's own source
 * are forwarded, by id. The token is an admin credential: forwarding arbitrary
 * query text would let anything that can make a same-origin request run any
 * admin operation the API has. With the allowlist, this route can do exactly
 * what the admin's screens do and nothing more.
 *
 * Nothing but the operation, its variables and the token is forwarded — no
 * other cookie, no other header.
 */

const OPERATIONS: Record<string, string> = persistedOperations;

const refuse = (status: number, code: string, message: string) =>
  Response.json(
    { data: null, errors: [{ message, extensions: { code } }] },
    { status, headers: { "cache-control": "no-store" } },
  );

/**
 * Whether the request came from a page on this origin. Browsers send
 * `Sec-Fetch-Site` on every fetch; `Origin` is the fallback for those that do
 * not. A request carrying neither is refused, so the check cannot be skipped
 * by omitting headers.
 */
function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return refuse(403, "FORBIDDEN", "Cross-origin requests are not accepted.");
  }

  // Refused here rather than forwarded anonymously: the API would refuse it
  // too, and there is no reason to spend the round trip.
  const token = readSessionCookie(request.headers);
  if (!token) {
    return refuse(401, "UNAUTHENTICATED", "Not signed in.");
  }

  let body: { id?: unknown; variables?: unknown };
  try {
    body = await request.json();
  } catch {
    return refuse(400, "BAD_REQUEST", "Expected a JSON body.");
  }

  // hasOwn, so an id like "constructor" cannot reach the prototype.
  const id = typeof body.id === "string" ? body.id : null;
  const query = id && Object.hasOwn(OPERATIONS, id) ? OPERATIONS[id] : undefined;
  if (!query) {
    return refuse(400, "PERSISTED_QUERY_NOT_FOUND", "Unknown operation.");
  }
  const variables =
    body.variables && typeof body.variables === "object" ? (body.variables as Record<string, unknown>) : {};

  try {
    const result = await callApi(query, variables, token, { timeoutMs: UPSTREAM_TIMEOUT_MS });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (!(error instanceof SessionServiceError)) throw error;
    console.error("[admin-graphql]", error);
    return refuse(502, "API_UNAVAILABLE", "The photo service could not be reached.");
  }
}
