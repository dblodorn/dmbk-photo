"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import {
  DEFAULT_COLUMN_COUNT,
  GALLERY_BREAKPOINTS,
  columnsForWidth,
} from "@/lib/photos/gallery-constants";

/**
 * The column count for the current viewport.
 *
 * Resolved with `matchMedia` rather than a resize listener plus width
 * arithmetic: a media query fires only when a breakpoint is actually crossed,
 * so resizing *within* a band — which is most of any resize — costs nothing,
 * and `min-width` matches the semantics of the media queries in
 * `gallery.module.css`.
 *
 * Returns {@link DEFAULT_COLUMN_COUNT} until mounted. The server has no
 * viewport, and rendering a guessed count there and a measured one here is a
 * hydration mismatch; the grid renders its non-virtualized fallback until this
 * settles, so both sides agree on the first pass.
 */
export function useColumnCount(): number {
  const [columns, setColumns] = useState(DEFAULT_COLUMN_COUNT);

  useEffect(() => {
    // One query per band above the base. Each fires on the way in and on the
    // way out, so re-reading the whole set on any change is both correct and
    // cheaper than tracking which one moved.
    const queries = GALLERY_BREAKPOINTS.filter(
      (band) => band.minWidth > 0,
    ).map((band) => window.matchMedia(`(min-width: ${band.minWidth}px)`));

    const sync = () => setColumns(columnsForWidth(window.innerWidth));

    sync();
    queries.forEach((query) => query.addEventListener("change", sync));
    return () =>
      queries.forEach((query) => query.removeEventListener("change", sync));
  }, []);

  return columns;
}

/**
 * The content width of `ref`, tracked across resizes.
 *
 * Separate from the column count because the two change independently: a
 * window can be resized within a band, changing the column width while the
 * count holds. Returns 0 until measured, which the grid reads as "not ready to
 * virtualize yet".
 */
export function useContainerWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // `contentRect` already excludes padding, so this is the space the
        // columns actually have.
        setWidth(entry.contentRect.width);
      }
    });

    observer.observe(element);
    setWidth(element.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

/**
 * Whether the component has mounted in a browser.
 *
 * The flip that swaps the server-rendered fallback for the virtualized
 * layout. Server and first client render both see `false`, so the markup
 * matches and hydration is clean; the effect then runs and the real layout
 * takes over.
 */
export function useHasMounted(): boolean {
  // `useSyncExternalStore` rather than a state-setting effect: the server
  // snapshot is false and the client snapshot is true, so React resolves the
  // difference during hydration itself instead of through an extra render
  // pass triggered from an effect.
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

/** Mount state never changes after hydration, so there is nothing to watch. */
const subscribeToNothing = () => () => {};
