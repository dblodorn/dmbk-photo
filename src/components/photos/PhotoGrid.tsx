"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  GALLERY_GAP,
  LOAD_MORE_THRESHOLD,
} from "@/lib/photos/gallery-constants";
import type { GalleryPhoto } from "./gallery-api";
import { columnWidthFor, packColumns } from "./masonry-layout";
import MasonryColumn from "./MasonryColumn";
import PhotoTile from "./PhotoTile";
import { Button, Text, View } from "reshaped";
import styles from "./gallery.module.css";
import {
  useColumnCount,
  useContainerWidth,
  useHasMounted,
} from "./useGalleryMetrics";

interface Props {
  photos: GalleryPhoto[];
  hasNextPage: boolean;
  loading: boolean;
  reloading: boolean;
  error: string | null;
  onLoadMore: () => void;
  onRetry: () => void;
  onOpen: (id: string) => void;
  /** True when a keyword filter is active, which changes the empty copy. */
  filtered: boolean;
}

/** What the scroll anchor remembers about the top of the viewport. */
interface ScrollAnchor {
  id: string;
  /** Where that photo sat relative to the viewport top, in pixels. */
  viewportTop: number;
}

export default function PhotoGrid({
  photos,
  hasNextPage,
  loading,
  reloading,
  error,
  onLoadMore,
  onRetry,
  onOpen,
  filtered,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mounted = useHasMounted();
  const columnCount = useColumnCount();
  const containerWidth = useContainerWidth(containerRef);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const columnWidth = useMemo(
    () =>
      containerWidth > 0 ? columnWidthFor(containerWidth, columnCount) : 0,
    [containerWidth, columnCount],
  );

  /**
   * Distance from the top of the document to the grid.
   *
   * The window virtualizers need it to map document scroll onto their own
   * coordinate space. Re-read whenever the layout inputs change, since
   * anything above the grid may have changed height.
   */
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    setScrollMargin(
      containerRef.current.getBoundingClientRect().top + window.scrollY,
    );
  }, [columnCount, columnWidth, mounted]);

  /**
   * The packed layout — a pure function of the photos and the geometry.
   *
   * Repacked from scratch whenever any of those change, which is cheaper than
   * it sounds and, more importantly, correct: shortest-column packing walks
   * the list in order, so packing `[a,b,c,d]` places `a,b,c` exactly where
   * packing `[a,b,c]` did. The layout is **prefix-stable**, and appending a
   * page therefore cannot move a photo that is already on screen — without
   * needing to carry the previous layout forward in a ref.
   */
  const layout = useMemo(
    () => packColumns<GalleryPhoto>(photos, columnCount, columnWidth || 1),
    [photos, columnCount, columnWidth],
  );

  /**
   * The photo nearest the top of the viewport, tracked continuously.
   *
   * Captured on scroll rather than at the moment of a repack, because by the
   * time a column-count change has re-rendered, the old placement is already
   * gone. Anchoring on a *photo* rather than a scroll offset or ratio is what
   * survives the document height changing underneath.
   */
  const anchorRef = useRef<ScrollAnchor | null>(null);
  useEffect(() => {
    if (!mounted) return;

    let frame = 0;
    const capture = () => {
      frame = 0;
      const container = containerRef.current;
      if (!container) return;

      let best: ScrollAnchor | null = null;
      for (const tile of container.querySelectorAll<HTMLElement>(
        "[data-photo-id]",
      )) {
        const top = tile.getBoundingClientRect().top;
        if (best === null || Math.abs(top) < Math.abs(best.viewportTop)) {
          best = { id: tile.dataset.photoId ?? "", viewportTop: top };
        }
      }
      if (best) anchorRef.current = best;
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(capture);
    };

    capture();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [mounted]);

  /** Restore the anchor after a repack caused by a column-count change. */
  const previousColumnCount = useRef(columnCount);
  useLayoutEffect(() => {
    if (previousColumnCount.current === columnCount) return;
    previousColumnCount.current = columnCount;

    const anchor = anchorRef.current;
    if (!anchor) return;

    for (const column of layout.columns) {
      const placed = column.find((item) => item.photo.id === anchor.id);
      if (!placed) continue;
      window.scrollTo({
        top: scrollMargin + placed.top - anchor.viewportTop,
        behavior: "instant" as ScrollBehavior,
      });
      return;
    }
  }, [columnCount, layout, scrollMargin]);

  /**
   * Ask for another page once the rendered window comes within
   * `LOAD_MORE_THRESHOLD` photos of the end of what is loaded.
   *
   * Driven by what the virtualizers actually rendered rather than by a
   * sentinel element, because a fast scroll can jump clean over a region that
   * was never rendered — and a sentinel in that region would never intersect.
   */
  const highestRendered = useRef(-1);
  const [renderedTick, setRenderedTick] = useState(0);
  const onRenderedIndex = useCallback((index: number) => {
    if (index > highestRendered.current) {
      highestRendered.current = index;
      setRenderedTick((tick) => tick + 1);
    }
  }, []);

  useEffect(() => {
    if (!hasNextPage || loading || reloading || error) return;
    if (highestRendered.current >= photos.length - LOAD_MORE_THRESHOLD) {
      onLoadMore();
    }
  }, [
    renderedTick,
    photos.length,
    hasNextPage,
    loading,
    reloading,
    error,
    onLoadMore,
  ]);

  // A filter change replaces the list; the old high-water mark would otherwise
  // keep the trigger permanently satisfied and page the new filter straight
  // to its end.
  useEffect(() => {
    if (reloading) highestRendered.current = -1;
  }, [reloading]);

  const handleFocus = useCallback((id: string) => setFocusedId(id), []);
  const handleBlur = useCallback(
    (id: string) => setFocusedId((current) => (current === id ? null : current)),
    [],
  );

  /**
   * Keep a tile that has just taken focus on screen.
   *
   * Overscan means a tile reached by Tab is usually already rendered just
   * outside the viewport; `nearest` nudges it in without the jump that
   * centring would cause.
   */
  useEffect(() => {
    if (!focusedId) return;
    const tile = containerRef.current?.querySelector<HTMLElement>(
      `[data-photo-id="${CSS.escape(focusedId)}"]`,
    );
    tile?.scrollIntoView({ block: "nearest", behavior: "instant" as ScrollBehavior });
  }, [focusedId]);

  if (photos.length === 0 && !reloading) {
    return (
      <View paddingBlock={6}>
        <Text variant="body-2" color="neutral-faded">
          {filtered
            ? "No photographs match those keywords."
            : "No photographs yet."}
        </Text>
      </View>
    );
  }

  /**
   * Before mount, and until the container has been measured, render a plain
   * CSS multi-column masonry.
   *
   * The server has no viewport, so it cannot compute the virtualized layout;
   * rendering a guess there and a measurement here would be a hydration
   * mismatch. The client renders this same fallback on its first pass, so both
   * sides agree, and the effect that sets `mounted` then swaps it out.
   *
   * It also means the gallery's first page is readable with JavaScript off.
   */
  const virtualize = mounted && columnWidth > 0;

  return (
    <>
      <div
        ref={containerRef}
        className={
          virtualize ? `${styles.grid} ${styles.virtual}` : styles.grid
        }
        style={
          virtualize
            ? { height: layout.totalHeight, gap: GALLERY_GAP }
            : undefined
        }
      >
        {virtualize ? (
          layout.columns.map((items, column) => (
            <MasonryColumn
              key={column}
              items={items}
              width={columnWidth}
              total={photos.length}
              scrollMargin={scrollMargin}
              focusedId={focusedId}
              onOpen={onOpen}
              onFocusPhoto={handleFocus}
              onBlurPhoto={handleBlur}
              onRenderedIndex={onRenderedIndex}
            />
          ))
        ) : (
          photos.map((photo, index) => (
            <PhotoTile
              key={photo.id}
              photo={photo}
              position={index + 1}
              total={photos.length}
              onOpen={onOpen}
            />
          ))
        )}
      </div>

      <View
        direction="row"
        gap={3}
        align="center"
        paddingBlock={6}
        attributes={{ "aria-live": "polite" }}
      >
        {error ? (
          <>
            <Text variant="body-2">{error}</Text>
            <Button size="small" variant="outline" onClick={onRetry}>
              Try again
            </Button>
          </>
        ) : loading || reloading ? (
          <Text variant="body-2" color="neutral-faded">
            Loading…
          </Text>
        ) : null}
        {/* Reaching the end is shown by the loading state simply stopping —
            the gallery just ends, with no trailing notice. */}
      </View>
    </>
  );
}
