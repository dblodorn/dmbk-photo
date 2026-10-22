/*
 * Admin sessions, held by the dmbk GraphQL API (graphql.dmbk.network).
 *
 * The API owns accounts: it verifies the Google ID token, decides who may sign
 * in and who is an admin (its ALLOWED_EMAILS / ADMIN_EMAILS), and issues a
 * revocable session token. This app never sees a password, a Google secret or
 * an allowlist of its own.
 *
 * What it does keep is the token, in an HTTP-only cookie on this app's own
 * domain, so page scripts can never read it. The admin's GraphQL
 * calls carry that cookie same-origin, and each request here asks the API who
 * the token belongs to. Writes reach the API through /api/admin/graphql, which
 * attaches the token server-side. Nothing about the answer is
 * cached, so revoking a session, or removing an address from the API's lists,
 * takes effect at the next request.
 */

/** The admin, as the API reports them. */
export interface AdminViewer {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
}

export const SESSION_COOKIE = "dmbk_admin_session";

/**
 * Matches the API's session lifetime (better-auth's default, seven days). The
 * API stays the authority: a cookie that outlives its session is anonymous.
 */
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

/** Raised when the API cannot be reached or answers with something unusable. */
export class SessionServiceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SessionServiceError";
  }
}

/** Raised when the API refuses a sign-in. Deliberately carries no reason. */
export class SignInRefusedError extends Error {
  constructor() {
    super("Sign-in failed.");
    this.name = "SignInRefusedError";
  }
}

export function apiUrl(): string {
  return process.env.DMBK_GRAPHQL_API_URL || "https://graphql.dmbk.network/graphql";
}

let warnedNoKey = false;

/**
 * This app's key for the API (`DMBK_GRAPHQL_API_KEY`), sent as `x-api-key` on
 * every call from this server. Without one the API treats a request as its
 * public playground: anonymous, read-only and rate-limited. In production a
 * missing key is a deploy mistake, so it throws rather than quietly degrading;
 * in development it warns once and calls without one.
 */
export function apiKey(): string | undefined {
  const key = process.env.DMBK_GRAPHQL_API_KEY;
  if (key) return key;
  if (process.env.NODE_ENV === "production") throw new Error("DMBK_GRAPHQL_API_KEY is not set.");
  if (!warnedNoKey) {
    warnedNoKey = true;
    console.warn("[dmbk-api] DMBK_GRAPHQL_API_KEY is not set; calling the API without a key.");
  }
  return undefined;
}

export interface GqlResponse<T> {
  data?: T | null;
  errors?: { message: string; extensions?: { code?: string } }[];
}

/** Session lookups are quick; the admin proxy passes longer for finalize. */
const DEFAULT_TIMEOUT_MS = 10_000;

export async function callApi<T>(
  query: string,
  variables: Record<string, unknown> = {},
  token?: string,
  { timeoutMs = DEFAULT_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<GqlResponse<T>> {
  const key = apiKey();
  let res: Response;
  try {
    res = await fetch(apiUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(key ? { "x-api-key": key } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new SessionServiceError("The accounts API could not be reached.", { cause: error });
  }

  try {
    return (await res.json()) as GqlResponse<T>;
  } catch (error) {
    throw new SessionServiceError(`The accounts API answered ${res.status} with no JSON.`, { cause: error });
  }
}

const VIEWER_FIELDS = "id email name isAdmin";

/** Read one cookie from a Cookie header, without pulling in a parser. */
export function readSessionCookie(headers: Headers): string | null {
  const header = headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === SESSION_COOKIE) {
      const value = part.slice(idx + 1).trim();
      try {
        return decodeURIComponent(value) || null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Who a session token belongs to, or null. A missing, expired, revoked or
 * forged token is null — never an error — so a stale cookie simply reads as
 * signed out. Only an unreachable API throws.
 */
export async function viewerForToken(token: string | null): Promise<AdminViewer | null> {
  if (!token) return null;
  const { data } = await callApi<{ viewer: AdminViewer | null }>(`{ viewer { ${VIEWER_FIELDS} } }`, {}, token);
  return data?.viewer ?? null;
}

/** Trade a Google ID token for an API session. */
export async function signInWithGoogle(idToken: string): Promise<{ token: string; viewer: AdminViewer }> {
  const { data, errors } = await callApi<{ signInWithGoogle: { token: string; viewer: AdminViewer } }>(
    `mutation ($input: SignInWithGoogleInput!) { signInWithGoogle(input: $input) { token viewer { ${VIEWER_FIELDS} } } }`,
    { input: { idToken } },
  );
  const result = data?.signInWithGoogle;
  if (result) return result;

  if (errors?.some((e) => e.extensions?.code === "UNAUTHENTICATED")) throw new SignInRefusedError();
  throw new SessionServiceError(`signInWithGoogle failed: ${errors?.map((e) => e.message).join("; ") ?? "no data"}`);
}

/** Revoke a session at the API. Best effort: the cookie is cleared regardless. */
export async function revokeToken(token: string | null): Promise<void> {
  if (!token) return;
  try {
    await callApi("mutation { signOut }", {}, token);
  } catch (error) {
    console.error("[auth] Failed to revoke the session at the API:", error);
  }
}

/** `Set-Cookie` for a new session, or for clearing one (`token: null`). */
export function sessionCookieHeader(token: string | null, secure: boolean): string {
  const attrs = [
    `${SESSION_COOKIE}=${token ? encodeURIComponent(token) : ""}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${token ? SESSION_MAX_AGE : 0}`,
  ];
  if (secure) attrs.push("Secure");
  return attrs.join("; ");
}

/** Whether the request reached us over HTTPS, directly or through Vercel's proxy. */
export function isSecureRequest(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  return new URL(request.url).protocol === "https:";
}
