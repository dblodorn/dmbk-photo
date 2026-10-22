import { STALENESS_WINDOW, fetchPhoto, fetchPhotoPage } from "@/lib/photos/api";
import { GALLERY_PAGE_SIZE } from "@/lib/photos/gallery-constants";
import { apiKey, apiUrl } from "@/server/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * The gallery's reads from the browser, answered from the dmbk GraphQL API.
 *
 *   GET ?k=<slug,slug>&after=<cursor>   → PhotoPage   (the next page)
 *   GET ?id=<uuid>                      → { photo }   (a deep link; null if not public)
 *
 * The API wants this app's key, which must not reach a browser, so the
 * browser asks here and this asks the API. It runs only the gallery's own
 * public queries (`lib/photos/api.ts`), with the page size fixed, so the key
 * can't be used for anything the gallery doesn't already show. Reads share the
 * page's fetch cache window.
 */

const MAX_KEYWORDS = 20;
const MAX_PARAM_LENGTH = 512;

const fail = (status: number, error: string) =>
  Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const options = { revalidate: STALENESS_WINDOW, apiKey: apiKey() };

  const id = params.get("id");
  const after = params.get("after");
  const keywords = (params.get("k") ?? "")
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);
  if (
    (id?.length ?? 0) > MAX_PARAM_LENGTH ||
    (after?.length ?? 0) > MAX_PARAM_LENGTH ||
    keywords.length > MAX_KEYWORDS ||
    keywords.some((slug) => slug.length > MAX_PARAM_LENGTH)
  ) {
    return fail(400, "Bad request.");
  }

  try {
    if (id !== null) {
      return Response.json({ photo: await fetchPhoto(apiUrl(), id, options) });
    }
    return Response.json(
      await fetchPhotoPage(apiUrl(), { keywords, cursor: after, limit: GALLERY_PAGE_SIZE }, options),
    );
  } catch (error) {
    console.error("[api/photos]", error);
    return fail(502, "The photo service could not be reached.");
  }
}
