/**
 * Layout numbers shared by the gallery's stylesheet and its layout math.
 *
 * The column count cannot live only in CSS. The masonry packs photos into
 * columns in JavaScript — a tile's height is derived from its intrinsic
 * dimensions and the column width — so the browser has to know how many
 * columns there are before it can place anything. That makes these values a
 * genuine duplicate of the media queries in
 * `components/photos/gallery.module.css`, and the duplication is deliberate
 * rather than an oversight: the stylesheet needs them for the fallback layout,
 * and this module is the single source for anything the layout math reads.
 * Change one, change the other.
 *
 * Dependency-free, for the same reason `constants.ts` is: this is imported by
 * client components, and anything pulled in here lands in the public bundle.
 */

/**
 * Viewport width in pixels at which each column count takes over, ascending.
 * Mirrors the media queries in `gallery.module.css`.
 */
export const GALLERY_BREAKPOINTS = [
  { minWidth: 0, columns: 2 },
  { minWidth: 765, columns: 3 },
  { minWidth: 1040, columns: 8 },
] as const;

/**
 * Columns assumed before the browser has measured anything — on the server,
 * and on the first client render. The narrowest band, so the server-rendered
 * fallback is never wider than the viewport it lands in.
 */
export const DEFAULT_COLUMN_COUNT: number = GALLERY_BREAKPOINTS[0].columns;

/** Gutter between tiles, in pixels. Must match the gaps in `gallery.module.css`. */
export const GALLERY_GAP = 16;

/**
 * Photos requested per page. Matches the listing's own default so the gallery
 * is not quietly asking for a different page size than the rest of the app.
 */
export const GALLERY_PAGE_SIZE = 24;

/**
 * How close to the end of the loaded photos the rendered window must come
 * before the next page is requested. Counted in photos, not pixels, so it
 * holds at any column count.
 */
export const LOAD_MORE_THRESHOLD = 8;

/**
 * Extra tiles rendered above and below the visible region, per column. Enough
 * that a fast scroll lands on rendered content rather than on a gap.
 */
export const OVERSCAN = 6;

/**
 * The `sizes` hint for a gallery tile, built from the bands above.
 *
 * Derived rather than written out, because it is a second expression of facts
 * that already live in `GALLERY_BREAKPOINTS` — and a hand-typed copy goes
 * stale silently the moment a breakpoint moves. (The comment in `PhotoTile`
 * claiming a column was "roughly 380px wide" is exactly what that looks like.)
 *
 * Descending by `min-width`, because the browser takes the first media
 * condition that matches. Each band's width is stated as `100vw / columns`,
 * which ignores the container's padding and the gaps between columns and so
 * runs slightly wide — harmless, since it only has to be close enough for the
 * browser to land on the right rung, and erring high costs bytes while erring
 * low costs the sharpness this exists to provide.
 */
export const GALLERY_SIZES: string = [...GALLERY_BREAKPOINTS]
  .sort((a, b) => b.minWidth - a.minWidth)
  .map((band) =>
    band.minWidth > 0
      ? `(min-width: ${band.minWidth}px) ${(100 / band.columns).toFixed(2)}vw`
      : `${(100 / band.columns).toFixed(2)}vw`,
  )
  .join(", ");

/** Resolve the column count for a viewport width. */
export function columnsForWidth(width: number): number {
  let columns = DEFAULT_COLUMN_COUNT;
  for (const band of GALLERY_BREAKPOINTS) {
    if (width >= band.minWidth) columns = band.columns;
  }
  return columns;
}
