/**
 * Shortest-column packing for the gallery's masonry.
 *
 * Pure, and deliberately so — the layout is a function of
 * `(photos, columnCount, columnWidth)` and nothing else, so the same inputs
 * always produce the same placement and the result can be recomputed at will.
 *
 * The property everything else depends on: packing walks photos in listing
 * order and only ever extends the bottom of a column, so appending a page
 * continues from where the last one finished and **never moves a photo that is
 * already placed**. A visitor mid-scroll sees nothing shift when the next page
 * lands. {@link appendToLayout} is what preserves that across pages.
 */

import { GALLERY_GAP } from "@/lib/photos/gallery-constants";

/** Just enough of a photo to place it. */
export interface Placeable {
  id: string;
  width: number | null;
  height: number | null;
}

export interface PlacedPhoto<T extends Placeable> {
  photo: T;
  /** Index in the flat, listing-ordered photo array. */
  index: number;
  /** Rendered tile height in pixels, gap excluded. */
  height: number;
  /** Offset from the top of the grid. What the scroll anchor restores to. */
  top: number;
}

export interface MasonryLayout<T extends Placeable> {
  /** One entry per column, each in top-to-bottom order. */
  columns: PlacedPhoto<T>[][];
  /** Running height of each column, gaps included. */
  columnHeights: number[];
  columnCount: number;
  columnWidth: number;
  /** Tallest column — the height the grid must reserve. */
  totalHeight: number;
  /** How many photos have been placed, so appends know where to resume. */
  placedCount: number;
}

/**
 * Fallback aspect ratio for a photo missing its intrinsic dimensions.
 *
 * Every `ready` photo is supposed to carry them, but a null here would become
 * `NaN` height and a collapsed tile, so this degrades to a plain square rather
 * than to a broken layout.
 */
const FALLBACK_RATIO = 1;

function tileHeight(photo: Placeable, columnWidth: number): number {
  const ratio =
    photo.width && photo.height && photo.width > 0
      ? photo.height / photo.width
      : FALLBACK_RATIO;
  return Math.round(columnWidth * ratio);
}

function shortestColumn(heights: number[]): number {
  let best = 0;
  for (let i = 1; i < heights.length; i += 1) {
    if (heights[i] < heights[best]) best = i;
  }
  return best;
}

function emptyLayout<T extends Placeable>(
  columnCount: number,
  columnWidth: number,
): MasonryLayout<T> {
  return {
    columns: Array.from({ length: columnCount }, () => []),
    columnHeights: Array.from({ length: columnCount }, () => 0),
    columnCount,
    columnWidth,
    totalHeight: 0,
    placedCount: 0,
  };
}

/**
 * Place `photos` into `columnCount` columns, each time choosing the column
 * that is currently shortest. Ties go to the leftmost column, which is what
 * keeps the result deterministic.
 */
export function packColumns<T extends Placeable>(
  photos: readonly T[],
  columnCount: number,
  columnWidth: number,
  gap: number = GALLERY_GAP,
): MasonryLayout<T> {
  return appendToLayout(
    emptyLayout<T>(columnCount, columnWidth),
    photos,
    gap,
  );
}

/**
 * Continue an existing layout with photos appended to the end of the list.
 *
 * `photos` is the **whole** flat array, not just the new tail; everything
 * already placed is skipped by index. Callers therefore never have to track
 * which photos a layout has seen, and a re-render with an unchanged array is a
 * no-op rather than a duplicate placement.
 */
export function appendToLayout<T extends Placeable>(
  layout: MasonryLayout<T>,
  photos: readonly T[],
  gap: number = GALLERY_GAP,
): MasonryLayout<T> {
  if (photos.length <= layout.placedCount) return layout;

  const columns = layout.columns.map((column) => column.slice());
  const columnHeights = layout.columnHeights.slice();

  for (let index = layout.placedCount; index < photos.length; index += 1) {
    const photo = photos[index];
    const column = shortestColumn(columnHeights);
    const height = tileHeight(photo, layout.columnWidth);

    // A column's running height is exactly the offset the next tile starts
    // at, because the gap below each tile is folded into it.
    columns[column].push({ photo, index, height, top: columnHeights[column] });
    columnHeights[column] += height + gap;
  }

  return {
    ...layout,
    columns,
    columnHeights,
    totalHeight: Math.max(0, ...columnHeights),
    placedCount: photos.length,
  };
}

/**
 * Column width available inside a container of `containerWidth`.
 *
 * `columnCount - 1` gaps sit between the columns; there is no gap outside the
 * outermost ones, since the container's own padding handles that.
 */
export function columnWidthFor(
  containerWidth: number,
  columnCount: number,
  gap: number = GALLERY_GAP,
): number {
  const available = containerWidth - gap * (columnCount - 1);
  return Math.max(1, Math.floor(available / columnCount));
}
