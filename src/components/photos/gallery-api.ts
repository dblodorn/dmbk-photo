/**
 * The public gallery's reads from the browser, through this app's own
 * `/api/photos` route.
 *
 * The browser never calls the dmbk GraphQL API itself: those requests carry
 * this app's API key, which stays on the server. The route runs the same
 * documents as the gallery page (`lib/photos/api.ts`), so the server-rendered
 * first page and every later page come from the same query and the cursor one
 * hands over is one the other can continue from.
 *
 * Deliberately NOT shared with the admin's reads. Those select `hidden`,
 * `status` and `failureReason` and travel through the admin proxy with a
 * session; these are anonymous.
 */

import type { GalleryPhoto, PhotoPage } from "@/lib/photos/api";

export type { GalleryPhoto, KeywordCount, PhotoPage } from "@/lib/photos/api";

/** Long enough for a cold droplet behind the route, short enough to fail rather than hang. */
const TIMEOUT_MS = 15_000;

async function get<T>(params: URLSearchParams, signal?: AbortSignal): Promise<T> {
  // One signal for both the caller's abort and the timeout, without relying on
  // `AbortSignal.any`, which older Safari lacks.
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, TIMEOUT_MS);
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });

  try {
    const res = await fetch(`/api/photos?${params}`, { signal: controller.signal });
    const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok || !body) throw new Error(body?.error ?? `The gallery answered ${res.status}.`);
    return body;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

/** The page after `cursor` (or the first page) for a keyword filter. The page size is the route's. */
export function fetchPhotoPage(
  args: { keywords?: readonly string[]; cursor?: string | null },
  options: { signal?: AbortSignal } = {},
): Promise<PhotoPage> {
  const params = new URLSearchParams();
  if (args.keywords?.length) params.set("k", args.keywords.join(","));
  if (args.cursor) params.set("after", args.cursor);
  return get<PhotoPage>(params, options.signal);
}

/**
 * One photo by UUID, for a deep link naming a photo outside the loaded pages.
 * Null when it is hidden, not `ready`, malformed or absent; the cases are
 * indistinguishable by contract.
 */
export async function fetchPhoto(
  uuid: string,
  options: { signal?: AbortSignal } = {},
): Promise<GalleryPhoto | null> {
  const { photo } = await get<{ photo: GalleryPhoto | null }>(new URLSearchParams({ id: uuid }), options.signal);
  return photo;
}
