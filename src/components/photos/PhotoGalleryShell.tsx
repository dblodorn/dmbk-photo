"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, View } from "reshaped";
import {
  fetchPhoto,
  type KeywordCount,
  type PhotoPage,
} from "./gallery-api";
import { CloseIcon } from "./icons";
import KeywordPanel from "./KeywordPanel";
import PhotoGrid from "./PhotoGrid";
import PhotoSlideshow from "./PhotoSlideshow";
import { usePhotoPages } from "./usePhotoPages";

interface Props {
  /** The dmbk GraphQL API, resolved on the server so no public env var is needed. */
  endpoint: string;
  /** The server-rendered first page, from the same query later pages use. */
  seed: PhotoPage;
  vocabulary: KeywordCount[];
}

/** Query parameter names. Short, because they end up in shared links. */
const KEYWORDS_PARAM = "k";
const PHOTO_PARAM = "p";

function parseKeywords(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);
}

/**
 * The gallery's client half: URL state, filtering, and the slideshow.
 *
 * The URL is the single source of truth for both the active filter and the
 * open photo. Holding them in component state *as well* would give two places
 * to disagree — the classic symptom being a back button that changes the
 * address bar without changing the page.
 */
export default function PhotoGalleryShell({ endpoint, seed, vocabulary }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const keywordsParam = searchParams.get(KEYWORDS_PARAM);
  const openPhotoId = searchParams.get(PHOTO_PARAM);

  const keywords = useMemo(
    () => parseKeywords(keywordsParam),
    [keywordsParam],
  );

  const {
    photos,
    hasNextPage,
    loading,
    reloading,
    error,
    loadMore,
    retry,
    mergePhoto,
  } = usePhotoPages(endpoint, keywords, seed);

  const [panelOpen, setPanelOpen] = useState(false);

  /** Build a URL from the parts that should survive this navigation. */
  const urlFor = useCallback(
    (nextKeywords: readonly string[], nextPhotoId: string | null) => {
      const params = new URLSearchParams();
      if (nextKeywords.length) {
        params.set(KEYWORDS_PARAM, nextKeywords.join(","));
      }
      if (nextPhotoId) params.set(PHOTO_PARAM, nextPhotoId);
      const query = params.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [pathname],
  );

  /**
   * Filter changes `replace`; opening a photo `push`es.
   *
   * A visitor toggling five keywords should not have to press back five times
   * to leave the page, so filtering rewrites the current entry. Opening a
   * photo does add an entry — that is exactly what makes the back button close
   * the slideshow instead of leaving.
   */
  const setKeywords = useCallback(
    (next: readonly string[]) => {
      // Changing the filter closes the slideshow: the open photo may not be in
      // the new result, and leaving it up would show a photo outside the
      // filter the visitor just chose.
      router.replace(urlFor(next, null), { scroll: false });
    },
    [router, urlFor],
  );

  const toggleKeyword = useCallback(
    (slug: string) => {
      setKeywords(
        keywords.includes(slug)
          ? keywords.filter((existing) => existing !== slug)
          : [...keywords, slug],
      );
    },
    [keywords, setKeywords],
  );

  const clearKeywords = useCallback(() => setKeywords([]), [setKeywords]);

  const openPhoto = useCallback(
    (id: string) => {
      router.push(urlFor(keywords, id), { scroll: false });
    },
    [router, urlFor, keywords],
  );

  const closePhoto = useCallback(() => {
    router.replace(urlFor(keywords, null), { scroll: false });
  }, [router, urlFor, keywords]);

  const openIndex = openPhotoId
    ? photos.findIndex((photo) => photo.id === openPhotoId)
    : -1;

  /**
   * Resolve a deep link naming a photo outside the loaded pages.
   *
   * Fetched on its own and merged into the list at its position under the
   * listing's order, so prev/next work immediately instead of after the
   * visitor has paged down to it. A photo that is hidden, not `ready`, or
   * absent resolves to null and simply leaves the slideshow closed — the three
   * stay indistinguishable, which is what stops a deep link being a way to
   * probe for hidden photos. A malformed id is a GraphQL error rather than a
   * null, and is treated the same way for the same reason.
   */
  const resolving = useRef<string | null>(null);
  useEffect(() => {
    if (!openPhotoId || openIndex !== -1 || reloading) return;
    if (resolving.current === openPhotoId) return;
    resolving.current = openPhotoId;

    const controller = new AbortController();
    void fetchPhoto(endpoint, openPhotoId, { signal: controller.signal })
      .then((photo) => {
        if (controller.signal.aborted) return;
        if (photo) mergePhoto(photo);
        else closePhoto();
      })
      .catch(() => {
        if (!controller.signal.aborted) closePhoto();
      });

    return () => controller.abort();
  }, [endpoint, openPhotoId, openIndex, reloading, mergePhoto, closePhoto]);

  /**
   * On close, put the photo the visitor was last looking at back under their
   * eye and give it focus — they may have navigated several photos along, so
   * the tile they originally opened is the wrong target.
   */
  const lastViewedId = useRef<string | null>(null);
  useEffect(() => {
    if (openIndex !== -1) {
      lastViewedId.current = photos[openIndex].id;
      return;
    }
    const id = lastViewedId.current;
    if (!id) return;
    lastViewedId.current = null;

    // Done directly rather than inside a requestAnimationFrame. By the time
    // this effect runs, the commit that removed the overlay has also rendered
    // the grid, so the tile is already in the DOM and there is nothing to wait
    // for — and a deferred frame would never run at all while the tab is in
    // the background, silently dropping focus on the floor.
    const tile = document.querySelector<HTMLElement>(
      `[data-photo-id="${CSS.escape(id)}"]`,
    );
    tile?.scrollIntoView({
      block: "nearest",
      behavior: "instant" as ScrollBehavior,
    });
    tile?.focus({ preventScroll: true });
  }, [openIndex, photos]);

  const selectedLabels = useMemo(
    () =>
      keywords.map(
        (slug) =>
          vocabulary.find((entry) => entry.slug === slug)?.label ?? slug,
      ),
    [keywords, vocabulary],
  );

  return (
    <>
      <View direction="row" wrap align="center" gap={2} paddingBottom={6}>
        <Button
          variant="outline"
          onClick={() => setPanelOpen(true)}
          attributes={{ "aria-expanded": panelOpen }}
        >
          Filter
          {keywords.length > 0 && ` (${keywords.length})`}
        </Button>

        {/* The active filter stays visible with the drawer closed, so a
            filtered gallery is never silently filtered. */}
        {keywords.length > 0 && (
          <View
            as="ul"
            direction="row"
            wrap
            align="center"
            gap={2}
            attributes={{ style: { listStyle: "none", margin: 0, padding: 0 } }}
          >
            {keywords.map((slug, i) => (
              <View as="li" key={slug}>
                <Button
                  size="small"
                  color="primary"
                  endIcon={CloseIcon}
                  onClick={() => toggleKeyword(slug)}
                  attributes={{ "aria-label": `Remove keyword ${selectedLabels[i]}` }}
                >
                  {selectedLabels[i]}
                </Button>
              </View>
            ))}
            <View as="li">
              <Button size="small" variant="ghost" onClick={clearKeywords}>
                Clear all
              </Button>
            </View>
          </View>
        )}
      </View>

      <PhotoGrid
        photos={photos}
        hasNextPage={hasNextPage}
        loading={loading}
        reloading={reloading}
        error={error}
        onLoadMore={loadMore}
        onRetry={retry}
        onOpen={openPhoto}
        filtered={keywords.length > 0}
      />

      <KeywordPanel
        open={panelOpen}
        vocabulary={vocabulary}
        selected={keywords}
        onToggle={toggleKeyword}
        onClear={clearKeywords}
        onClose={() => setPanelOpen(false)}
      />

      {openIndex !== -1 && (
        <PhotoSlideshow
          photos={photos}
          index={openIndex}
          onIndexChange={(next) =>
            router.replace(urlFor(keywords, photos[next].id), { scroll: false })
          }
          onClose={closePhoto}
          hasNextPage={hasNextPage}
          loading={loading}
          onLoadMore={loadMore}
        />
      )}
    </>
  );
}
