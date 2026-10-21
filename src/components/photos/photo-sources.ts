import {
  DISPLAY_MAX_EDGE,
  GRID_MAX_EDGE,
  THUMB_MAX_EDGE,
} from "@/lib/photos/constants";
import type { ImageSource } from "@/components/ui/Image";
import type { GalleryPhoto } from "./gallery-api";

/**
 * The adapter between a photo and the generic image primitive.
 *
 * This is where the variant ladder and the missing-variant rules live, so that
 * `components/ui/Image.tsx` stays a primitive that knows nothing about photos.
 */

/**
 * The width a variant is *actually* stored at.
 *
 * Derivatives are generated with `fit: "inside"` and `withoutEnlargement`, so a
 * variant's longest edge is `min(target, original's longest edge)` — the
 * "1000px" variant of an 800px original is 800px wide. A `srcset` whose `w`
 * descriptors report the nominal target instead would tell the browser an
 * 800px file is 1000px and let it pick a variant that cannot fill the space.
 *
 * Derived rather than stored: this is the same arithmetic sharp performs, and
 * the inputs are already on every public photo, so recording each derivative's
 * dimensions on the record would add fields to keep in sync without adding any
 * accuracy.
 */
export function variantWidth(
  photo: Pick<GalleryPhoto, "width" | "height">,
  maxEdge: number,
): number | null {
  const { width, height } = photo;
  if (!width || !height || width <= 0 || height <= 0) return null;

  const longest = Math.max(width, height);
  const edge = Math.min(maxEdge, longest);
  // Landscape: the longest edge *is* the width. Portrait: scale it down.
  return width >= height ? edge : Math.round((width * edge) / height);
}

/**
 * Every variant this photo actually has, as the image primitive wants them.
 *
 * A variant with no URL is left out rather than offered as a source that
 * cannot load — which is what lets a photo finalized before the grid variant
 * existed render from the two it does have.
 *
 * A rung whose real width matches one already offered is dropped too. That is
 * the normal case for an original smaller than a derivative target: an 800px
 * original yields a grid variant and a display variant that are both 800px,
 * and offering both asks the browser to choose between identical candidates
 * while giving it a second file it might download. Rungs are walked smallest
 * first, so the survivor is the smaller target's file.
 */
export function sourcesFor(photo: GalleryPhoto): ImageSource[] {
  const rungs: [string | null, number][] = [
    [photo.thumbUrl, THUMB_MAX_EDGE],
    [photo.gridUrl, GRID_MAX_EDGE],
    [photo.displayUrl, DISPLAY_MAX_EDGE],
  ];

  const sources: ImageSource[] = [];
  const seen = new Set<number>();
  for (const [url, maxEdge] of rungs) {
    if (!url) continue;
    // Without intrinsic dimensions the real width is unknowable, so the
    // nominal target is the best available estimate — still better than
    // offering no candidate at all.
    const width = variantWidth(photo, maxEdge) ?? maxEdge;
    if (seen.has(width)) continue;
    seen.add(width);
    sources.push({ url, width });
  }
  return sources;
}
