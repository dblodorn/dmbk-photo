"use client";

import { forwardRef } from "react";
import { GALLERY_SIZES } from "@/lib/photos/gallery-constants";
import Image from "@/components/ui/Image";
import type { GalleryPhoto } from "./gallery-api";
import { sourcesFor } from "./photo-sources";
import styles from "./gallery.module.css";

interface Props {
  photo: GalleryPhoto;
  /** Position in the gallery, used only for the accessible label. */
  position: number;
  total: number;
  onOpen: (id: string) => void;
  onFocus?: (id: string) => void;
  onBlur?: (id: string) => void;
  /** Set when the tile is absolutely placed by the virtualized layout. */
  style?: React.CSSProperties;
}

/**
 * The text alternative for a photo.
 *
 * An untitled photo gets a positional description rather than an empty string:
 * these tiles are the page's content, not decoration, so `alt=""` would hide
 * the gallery entirely from a screen reader. "Untitled" alone would also be
 * wrong — it reads as the photo's name rather than as its absence.
 */
function altTextFor(photo: GalleryPhoto, position: number, total: number) {
  return photo.title ?? `Untitled photograph, ${position} of ${total}`;
}

/**
 * One photo in the grid.
 *
 * A button rather than a div with a click handler, so it is focusable, is
 * announced as activatable, and responds to Enter and Space without any of
 * that being reimplemented here.
 *
 * Which variant fills the tile is the browser's decision, not this component's.
 * It is handed every variant the photo has, each with its real pixel width, and
 * a `sizes` hint describing how wide a tile is at each column count — so a tile
 * on a dense display reaches for a larger file and a tile on a phone does not.
 * Pinning the tile to the thumbnail, as it used to be, is what left the widest
 * breakpoint upscaling a 400px image across a ~590px box.
 */
const PhotoTile = forwardRef<HTMLButtonElement, Props>(function PhotoTile(
  { photo, position, total, onOpen, onFocus, onBlur, style },
  ref,
) {
  const alt = altTextFor(photo, position, total);

  return (
    <button
      ref={ref}
      type="button"
      className={styles.tile}
      style={style}
      onClick={() => onOpen(photo.id)}
      onFocus={() => onFocus?.(photo.id)}
      onBlur={() => onBlur?.(photo.id)}
      aria-label={`Open ${alt}`}
      data-photo-id={photo.id}
    >
      <Image
        sources={sourcesFor(photo)}
        sizes={GALLERY_SIZES}
        // Intrinsic dimensions, so the box is the right shape even in the
        // non-virtualized fallback, where no computed height is applied.
        width={photo.width}
        height={photo.height}
        alt={alt}
        className={styles.tileImage}
        imgClassName={styles.tileImg}
      />
    </button>
  );
});

export default PhotoTile;
