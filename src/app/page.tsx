import { Text, View } from "reshaped";
import { fetchKeywords, fetchPhotoPage } from "@/lib/photos/api";
import { GALLERY_PAGE_SIZE } from "@/lib/photos/gallery-constants";
import { apiUrl } from "@/server/auth/session";
import PhotoGalleryShell from "@/components/photos/PhotoGalleryShell";

/** How long a read may be served from cache, in seconds. */
const STALENESS_WINDOW = 60;

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
 * from. The browser then talks to the API directly; the endpoint is passed
 * down so it needs no public env var.
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
  const cache = { revalidate: STALENESS_WINDOW };
  const [seed, vocabulary] = await Promise.all([
    fetchPhotoPage(endpoint, { keywords, limit: GALLERY_PAGE_SIZE }, cache),
    fetchKeywords(endpoint, cache),
  ]);

  return (
    <View minHeight="100dvh">
      <View
        as="header"
        direction="row"
        align="center"
        justify="space-between"
        gap={4}
        paddingInline={6}
        paddingBlock={5}
      >
        <Text as="h1" variant="featured-3" weight="bold">
          Photographs
        </Text>
        <a href="https://dmbk.io">
          <Text variant="body-2" color="neutral-faded">
            dmbk ↗
          </Text>
        </a>
      </View>

      <View as="main" paddingInline={6} paddingBottom={16}>
        <PhotoGalleryShell endpoint={endpoint} seed={seed} vocabulary={vocabulary} />
      </View>
    </View>
  );
}
