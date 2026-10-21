/**
 * Photo limits the admin upload form checks before reserving an upload.
 *
 * The dmbk GraphQL API enforces the same types and 50 MB limit (its
 * `src/lib/photos/upload.ts`); these are the browser's copy, so a doomed file
 * is refused before it burns a reservation. Keep the two identical.
 *
 * Deliberately dependency-free, since the admin's client bundle imports it.
 *
 * Nothing here may import anything with a server-only dependency.
 */

/** Content types accepted for an original upload. */
export const SUPPORTED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

export type SupportedContentType = (typeof SUPPORTED_CONTENT_TYPES)[number];

export function isSupportedContentType(
  value: string,
): value is SupportedContentType {
  return (SUPPORTED_CONTENT_TYPES as readonly string[]).includes(value);
}

/** Largest original accepted, in bytes. */
export const MAX_ORIGINAL_BYTES = 50 * 1024 * 1024;

/**
 * Most files accepted in one batch.
 *
 * A product decision rather than a technical ceiling: each file is still an
 * independent reserve-PUT-finalize, so the server neither knows nor cares that
 * a batch exists. Ten keeps the progress list legible on one screen and keeps a
 * stalled batch quick to abandon.
 */
export const MAX_BATCH_FILES = 10;

/** Longest edge of each generated derivative, in pixels. */
export const THUMB_MAX_EDGE = 400;
/**
 * The rung between the thumbnail and the display variant.
 *
 * Sized for the gallery's worst case: eight columns across a wide viewport on
 * a 2x display. A column there is roughly 295 CSS pixels, which the device
 * pixel ratio turns into a ~590 pixel request — more than the thumbnail holds,
 * which is what left the grid visibly upscaled. 1000 covers that with headroom
 * to very wide viewports while staying well under the display variant, so the
 * slideshow's file is never pulled into a tile.
 */
export const GRID_MAX_EDGE = 1000;
export const DISPLAY_MAX_EDGE = 1600;
