"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchPhotoPage,
  type GalleryPhoto,
  type PhotoPage,
} from "./gallery-api";

export interface PhotoPagesState {
  photos: GalleryPhoto[];
  hasNextPage: boolean;
  /** True while any page — first or subsequent — is in flight. */
  loading: boolean;
  /** True only for the reset that follows a filter change. */
  reloading: boolean;
  error: string | null;
  loadMore: () => void;
  retry: () => void;
  /** Splice a deep-linked photo into the ordered list. See below. */
  mergePhoto: (photo: GalleryPhoto) => void;
}

/**
 * The listing's total order: `createdAt` descending, id descending as the
 * tie-breaker. The same order `listPhotos` sorts by, which is what lets a
 * photo fetched on its own be placed correctly among paged ones.
 */
function isBefore(a: GalleryPhoto, b: GalleryPhoto): boolean {
  if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt;
  return a.id > b.id;
}

/**
 * Owns the gallery's paging.
 *
 * Both the grid and the slideshow call the same `loadMore`, so the in-flight
 * guard here is the only thing standing between them and two simultaneous
 * requests for the same page at the boundary. The guard is a ref rather than
 * state deliberately: it has to be readable and writable synchronously within
 * one event, which a state update — batched and applied on the next render —
 * cannot do.
 *
 * `seed` is the server-rendered first page, from the same query this hook
 * runs through `/api/photos` (`lib/photos/api.ts`). It is used only for the filter it was rendered for; changing
 * the filter discards it and fetches a fresh first page.
 */
export function usePhotoPages(
  keywords: readonly string[],
  seed: PhotoPage,
): PhotoPagesState {
  const [photos, setPhotos] = useState<GalleryPhoto[]>(seed.photos);
  const [cursor, setCursor] = useState<string | null>(seed.nextCursor);
  const [hasNextPage, setHasNextPage] = useState(seed.hasNextPage);
  const [loading, setLoading] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inFlight = useRef(false);
  // Cursor and filter are mirrored into refs so `loadMore` can stay a stable
  // callback. If it changed identity on every page, the effect in the grid
  // that calls it would re-run on every page and re-trigger itself.
  const cursorRef = useRef(seed.nextCursor);
  const hasNextRef = useRef(seed.hasNextPage);
  const keywordsRef = useRef(keywords);

  /** Serialized filter, so the effect below fires on content not identity. */
  const filterKey = keywords.join(",");
  const seededFor = useRef(filterKey);

  const runLoadMore = useCallback(async () => {
    if (inFlight.current || !hasNextRef.current || !cursorRef.current) return;

    inFlight.current = true;
    setLoading(true);
    setError(null);

    const requestedFor = keywordsRef.current.join(",");
    try {
      const page = await fetchPhotoPage({
        keywords: keywordsRef.current,
        cursor: cursorRef.current,
      });

      // The filter may have changed while this was in flight. Appending now
      // would mix two filters' results into one list.
      if (keywordsRef.current.join(",") !== requestedFor) return;

      cursorRef.current = page.nextCursor;
      hasNextRef.current = page.hasNextPage;
      setCursor(page.nextCursor);
      setHasNextPage(page.hasNextPage);
      // Appending rather than replacing is what makes pages accumulate into
      // one continuous gallery.
      setPhotos((current) => current.concat(page.photos));
    } catch (err) {
      // The already-loaded photos stay exactly as they are; only the error
      // banner appears, and `retry` re-runs from the same cursor.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(() => {
    void runLoadMore();
  }, [runLoadMore]);

  const retry = useCallback(() => {
    setError(null);
    void runLoadMore();
  }, [runLoadMore]);

  /**
   * Reset to a fresh first page when the filter changes.
   *
   * Skipped on the first run for the filter the seed was rendered for —
   * otherwise the page would immediately re-fetch over GraphQL what the server
   * just rendered.
   */
  useEffect(() => {
    keywordsRef.current = keywords;

    if (seededFor.current === filterKey) return;
    seededFor.current = filterKey;

    const controller = new AbortController();
    inFlight.current = true;
    setReloading(true);
    setError(null);

    void (async () => {
      try {
        const page = await fetchPhotoPage({ keywords }, { signal: controller.signal });
        if (controller.signal.aborted) return;

        cursorRef.current = page.nextCursor;
        hasNextRef.current = page.hasNextPage;
        setPhotos(page.photos);
        setCursor(page.nextCursor);
        setHasNextPage(page.hasNextPage);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!controller.signal.aborted) {
          inFlight.current = false;
          setReloading(false);
        }
      }
    })();

    return () => {
      controller.abort();
      inFlight.current = false;
    };
    // `keywords` is covered by `filterKey`, which compares by content; using
    // the array itself would re-run on every render that rebuilds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  /**
   * Place a photo fetched on its own — a deep link naming a photo beyond the
   * loaded pages — at its correct position in the order, so the slideshow's
   * prev/next work immediately rather than after paging down to it.
   */
  const mergePhoto = useCallback((photo: GalleryPhoto) => {
    setPhotos((current) => {
      if (current.some((existing) => existing.id === photo.id)) return current;
      const at = current.findIndex((existing) => isBefore(photo, existing));
      if (at === -1) return current.concat(photo);
      return current.slice(0, at).concat(photo, current.slice(at));
    });
  }, []);

  return {
    photos,
    hasNextPage: hasNextPage && cursor !== null,
    loading,
    reloading,
    error,
    loadMore,
    retry,
    mergePhoto,
  };
}
