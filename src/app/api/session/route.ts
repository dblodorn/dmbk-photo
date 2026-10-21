import {
  SessionServiceError,
  SignInRefusedError,
  isSecureRequest,
  readSessionCookie,
  revokeToken,
  sessionCookieHeader,
  signInWithGoogle,
  viewerForToken,
} from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * The admin session, as the admin UI sees it.
 *
 *   GET    → { viewer } — the signed-in admin, or null
 *   POST   { idToken } → sign in with a Google ID token
 *   DELETE → sign out
 *
 * The session token itself never reaches the browser's JavaScript: it is set
 * here as an HTTP-only cookie and only this app's server forwards it to the
 * API. See `src/server/auth/session.ts`.
 */

const json = (body: unknown, init: ResponseInit = {}) =>
  Response.json(body, { ...init, headers: { "cache-control": "no-store", ...init.headers } });

export async function GET(request: Request) {
  const token = readSessionCookie(request.headers);
  try {
    const viewer = await viewerForToken(token);
    // A cookie whose session has ended, or whose account is no longer an
    // admin, is cleared rather than re-checked on every request.
    if (token && !viewer?.isAdmin) {
      return json({ viewer: null }, { headers: { "set-cookie": sessionCookieHeader(null, isSecureRequest(request)) } });
    }
    return json({ viewer: viewer?.isAdmin ? viewer : null });
  } catch (error) {
    console.error("[auth] Session check failed:", error);
    return json({ viewer: null, error: "unavailable" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let idToken: unknown;
  try {
    ({ idToken } = (await request.json()) as { idToken?: unknown });
  } catch {
    idToken = undefined;
  }
  if (typeof idToken !== "string" || !idToken) {
    return json({ error: "bad_request" }, { status: 400 });
  }

  try {
    const { token, viewer } = await signInWithGoogle(idToken);

    // The API admits anyone on its sign-in list; this app is admin-only. A
    // signed-in non-admin gets no cookie, and their fresh session is revoked
    // so it doesn't linger unused.
    if (!viewer.isAdmin) {
      await revokeToken(token);
      return json({ error: "not_admin" }, { status: 403 });
    }

    return json(
      { viewer },
      { headers: { "set-cookie": sessionCookieHeader(token, isSecureRequest(request)) } },
    );
  } catch (error) {
    if (error instanceof SignInRefusedError) return json({ error: "refused" }, { status: 401 });
    console.error("[auth] Sign-in failed:", error);
    const status = error instanceof SessionServiceError ? 503 : 500;
    return json({ error: "unavailable" }, { status });
  }
}

export async function DELETE(request: Request) {
  await revokeToken(readSessionCookie(request.headers));
  return json({ ok: true }, { headers: { "set-cookie": sessionCookieHeader(null, isSecureRequest(request)) } });
}
