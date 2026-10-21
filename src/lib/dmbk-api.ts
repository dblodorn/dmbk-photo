/**
 * One GraphQL operation against the dmbk GraphQL API, as a plain `fetch`.
 *
 * For the anonymous reads outside the admin: the public gallery (server and
 * browser) and `/sound`'s build-time fallback. The admin uses Relay through
 * its proxy instead. The endpoint is always a parameter; on the server it is
 * `apiUrl()` from `server/auth/session.ts`.
 */

/** Long enough for a cold droplet, short enough that a page fails rather than hangs. */
const TIMEOUT_MS = 10_000;

export interface PostOptions {
  signal?: AbortSignal;
  /** Next's fetch cache on the server. Ignored in the browser. */
  revalidate?: number;
}

/**
 * POST one operation. GraphQL reports failures in the body with a 200, so the
 * status alone does not say whether this worked; any error is thrown.
 */
export async function post<T>(
  endpoint: string,
  query: string,
  variables: Record<string, unknown> = {},
  options: PostOptions = {},
): Promise<T> {
  // One signal for both the caller's abort and the timeout, without relying on
  // `AbortSignal.any`, which older Safari lacks.
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, TIMEOUT_MS);
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener("abort", abort, { once: true });

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
      ...(options.revalidate !== undefined && { next: { revalidate: options.revalidate } }),
    });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }

  let payload: { data?: T | null; errors?: { message: string }[] };
  try {
    payload = await res.json();
  } catch {
    throw new Error(`The API answered ${res.status} without JSON.`);
  }
  if (payload.errors?.length) throw new Error(payload.errors[0].message);
  if (!payload.data) throw new Error("The API returned no data.");
  return payload.data;
}
