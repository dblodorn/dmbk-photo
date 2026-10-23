import { View } from "reshaped";
import { STALENESS_WINDOW, fetchKeywords, fetchPhotoPage } from "@/lib/photos/api";
import { GALLERY_PAGE_SIZE } from "@/lib/photos/gallery-constants";
import { apiKey, apiUrl } from "@/server/auth/session";
import PhotoGalleryShell from "@/components/photos/PhotoGalleryShell";

/*
 * Reads go through Next's fetch cache with a bounded staleness window rather
 * than an API round trip per request. The cache is keyed by the request body,
 * so the keyword filter is part of the key and a cached result never answers a
 * *different* question. The route is dynamic (it reads `searchParams`); the
 * fetch cache keeps the API read cached anyway. New photos therefore appear
 * within a minute of being made ready, with no deploy.
 */

function parseKeywords(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : (value ?? "");
  return raw
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);
}

/**
 * The public gallery, at the root of photo.dmbk.io.
 *
 * The first page and the vocabulary are read from the dmbk GraphQL API with
 * the same query the browser sends for later pages (`lib/photos/api.ts`), so
 * the cursor handed to the client below is one its first request can continue
 * from. The browser continues through `/api/photos`, never the API itself,
 * because these reads carry this app's API key.
 *
 * The keyword filter is read here rather than only in the browser so that a
 * shared filtered link arrives already filtered — server-rendered, not fetched
 * again after hydration.
 */
export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const keywords = parseKeywords(params.k);

  const endpoint = apiUrl();
  const cache = { revalidate: STALENESS_WINDOW, apiKey: apiKey() };
  const [seed, vocabulary] = await Promise.all([
    fetchPhotoPage(endpoint, { keywords, limit: GALLERY_PAGE_SIZE }, cache),
    fetchKeywords(endpoint, cache),
  ]);

  return (
    <View minHeight="100dvh">
      <View as="main" paddingInline={6} paddingTop={6} paddingBottom={16}>
        <PhotoGalleryShell seed={seed} vocabulary={vocabulary} />
      </View>
    </View>
  );
}
