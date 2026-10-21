"use client";

import { useEffect, useRef } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { GALLERY_GAP, OVERSCAN } from "@/lib/photos/gallery-constants";
import type { GalleryPhoto } from "./gallery-api";
import type { PlacedPhoto } from "./masonry-layout";
import PhotoTile from "./PhotoTile";
import styles from "./gallery.module.css";

interface Props {
  items: PlacedPhoto<GalleryPhoto>[];
  width: number;
  total: number;
  /** Distance from the top of the document to the grid. */
  scrollMargin: number;
  focusedId: string | null;
  onOpen: (id: string) => void;
  onFocusPhoto: (id: string) => void;
  onBlurPhoto: (id: string) => void;
  /** Highest flat index this column has rendered, reported on every change. */
  onRenderedIndex: (index: number) => void;
}

/**
 * One column of the masonry, virtualized independently.
 *
 * This is why masonry works on a linear virtualizer at all: a *column* is a
 * plain vertical list, even though the grid as a whole is not. Each column
 * gets its own virtualizer over its own items, and all of them observe the
 * same window scroll.
 *
 * Sizes are exact, never measured. Every `ready` photo carries intrinsic
 * dimensions, so a tile's height is known before its image loads —
 * `estimateSize` returns the real height, and `measureElement` is deliberately
 * not wired up. That removes the measure-then-correct pass that is the usual
 * source of masonry scroll jitter.
 */
export default function MasonryColumn({
  items,
  width,
  total,
  scrollMargin,
  focusedId,
  onOpen,
  onFocusPhoto,
  onBlurPhoto,
  onRenderedIndex,
}: Props) {
  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: (i) => items[i].height + GALLERY_GAP,
    overscan: OVERSCAN,
    scrollMargin,
    getItemKey: (i) => items[i].photo.id,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Report how far down the flat list this column has rendered, so the grid
  // can decide when to ask for another page.
  const lastReported = useRef(-1);
  useEffect(() => {
    if (virtualItems.length === 0) return;
    const highest = items[virtualItems[virtualItems.length - 1].index].index;
    if (highest !== lastReported.current) {
      lastReported.current = highest;
      onRenderedIndex(highest);
    }
  }, [virtualItems, items, onRenderedIndex]);

  /**
   * The focused tile, when it has been windowed out.
   *
   * Releasing the element that currently holds focus drops focus to `<body>`,
   * which silently strands a keyboard visitor mid-gallery. Rendering it
   * regardless of the window costs one extra tile and makes that impossible.
   */
  const focusedItem =
    focusedId && !virtualItems.some((v) => v.key === focusedId)
      ? items.find((item) => item.photo.id === focusedId)
      : undefined;

  return (
    <div
      className={styles.column}
      style={{ width, height: virtualizer.getTotalSize() }}
    >
      {virtualItems.map((virtualItem) => {
        const item = items[virtualItem.index];
        return (
          <PhotoTile
            key={item.photo.id}
            photo={item.photo}
            position={item.index + 1}
            total={total}
            onOpen={onOpen}
            onFocus={onFocusPhoto}
            onBlur={onBlurPhoto}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width,
              height: item.height,
              transform: `translateY(${
                virtualItem.start - virtualizer.options.scrollMargin
              }px)`,
            }}
          />
        );
      })}

      {focusedItem && (
        <PhotoTile
          key={focusedItem.photo.id}
          photo={focusedItem.photo}
          position={focusedItem.index + 1}
          total={total}
          onOpen={onOpen}
          onFocus={onFocusPhoto}
          onBlur={onBlurPhoto}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width,
            height: focusedItem.height,
            transform: `translateY(${focusedItem.top}px)`,
          }}
        />
      )}
    </div>
  );
}
