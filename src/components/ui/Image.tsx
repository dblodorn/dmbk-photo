"use client";

import { useCallback, useRef, useState } from "react";
import styles from "./image.module.css";

/** One stored variant of an image, at its **real** pixel width. */
export interface ImageSource {
  url: string;
  /**
   * The variant's actual width in pixels — not the size it was requested at.
   * A 1000px-target variant generated from an 800px original is 800 wide, and
   * a `w` descriptor claiming otherwise makes the browser choose badly. The
   * caller is responsible for reporting the truth here.
   */
  width: number;
}

interface Props {
  /** One or more variants. Sorted and deduplicated by width internally. */
  sources: ImageSource[];
  /**
   * How much layout width the image occupies at each viewport size, in the
   * form the `sizes` attribute takes. Without it the browser assumes `100vw`
   * and over-fetches for anything rendered in a column.
   */
  sizes?: string;
  /** Intrinsic dimensions, used to hold the box open before loading. */
  width?: number | null;
  height?: number | null;
  alt: string;
  /**
   * Opt out of deferred loading for an image known to be visible immediately.
   * Everything else waits until it approaches the viewport.
   */
  priority?: boolean;
  className?: string;
  /** Applied to the `<img>` itself, for `object-fit` and the like. */
  imgClassName?: string;
}

type LoadState = "pending" | "loaded" | "failed";

/**
 * A raster image that reserves its space, picks its own resolution, defers
 * what is off screen, and shows a placeholder until it has something to show.
 *
 * Knows nothing about where its sources came from. Callers hand it URLs,
 * widths, and alt text — a photo-library adapter, a CMS adapter, and a
 * hard-coded asset all look identical from in here, which is what makes it
 * adoptable on a new surface without touching this file.
 */
export default function Image({
  sources,
  sizes,
  width,
  height,
  alt,
  priority = false,
  className,
  imgClassName,
}: Props) {
  /**
   * Widest first for `src`, ascending for `srcset`, duplicates dropped.
   *
   * Duplicates are not hypothetical: derivatives are generated without
   * enlargement, so a small original produces two variants at the same width,
   * and offering the same width twice just asks the browser to choose between
   * identical candidates.
   */
  const candidates = dedupeByWidth(sources);
  const fallback = candidates[candidates.length - 1];

  const srcSet =
    candidates.length > 1
      ? candidates.map((s) => `${s.url} ${s.width}w`).join(", ")
      : undefined;

  /**
   * Load state, keyed by the source it describes.
   *
   * Keying matters because a source change must re-arm the placeholder; a bare
   * boolean would leave a new image reading as already loaded.
   */
  const [state, setState] = useState<{ src: string; value: LoadState }>({
    src: fallback?.url ?? "",
    value: "pending",
  });

  const settled = useRef<string | null>(null);

  /**
   * Seed the state from the element itself, before paint.
   *
   * A naive `useState(false)` plus `onLoad` flashes a placeholder over an
   * image the browser already holds — which in a virtualized gallery happens
   * every time a tile is windowed out and back in. `complete` is true for a
   * cached image the moment the element attaches, so checking it here settles
   * those synchronously and the placeholder never appears.
   */
  const measure = useCallback((img: HTMLImageElement | null) => {
    if (!img) return;
    if (settled.current === img.currentSrc) return;
    if (img.complete) {
      settled.current = img.currentSrc;
      // naturalWidth is 0 for an image that finished by failing.
      setState({
        src: img.getAttribute("src") ?? "",
        value: img.naturalWidth > 0 ? "loaded" : "failed",
      });
    }
  }, []);

  if (!fallback) return null;

  const current =
    state.src === fallback.url ? state.value : ("pending" as LoadState);

  const ratio =
    width && height && width > 0 && height > 0 ? `${width} / ${height}` : undefined;

  return (
    <span
      className={[styles.image, className].filter(Boolean).join(" ")}
      // Holds the box open before any bytes arrive. Where a caller has already
      // fixed the height — as the gallery's masonry does — that wins, and this
      // simply fills it.
      style={{ aspectRatio: ratio }}
    >
      {/* Not `next/image`. The photos pipeline generates its own fixed ladder
          of derivatives and serves them from a CDN this app controls, so a
          second layer of resizing would re-encode work already done — and the
          `sources` contract has to stay usable by callers that are not Next
          routes at all. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={measure}
        src={fallback.url}
        srcSet={srcSet}
        sizes={srcSet ? sizes : undefined}
        alt={alt}
        // Intrinsic dimensions on the element too, so the browser reserves the
        // right box even where the wrapper's ratio is overridden.
        width={width ?? undefined}
        height={height ?? undefined}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
        className={[
          styles.img,
          current === "pending" ? styles.pending : null,
          imgClassName,
        ]
          .filter(Boolean)
          .join(" ")}
        onLoad={() => setState({ src: fallback.url, value: "loaded" })}
        onError={() => setState({ src: fallback.url, value: "failed" })}
      />

      {current !== "loaded" && (
        <span
          // Not content. A screen reader should hear the image's alt text,
          // never the placeholder. A failed image keeps its box and its fill
          // but stops animating: an animation that never resolves
          // misrepresents what is happening.
          aria-hidden="true"
          className={[styles.skeleton, current === "pending" ? styles.animated : null]
            .filter(Boolean)
            .join(" ")}
        />
      )}
    </span>
  );
}

/** Ascending by width, one entry per width, empty URLs dropped. */
function dedupeByWidth(sources: readonly ImageSource[]): ImageSource[] {
  const byWidth = new Map<number, ImageSource>();
  for (const source of sources) {
    if (!source.url || !(source.width > 0)) continue;
    if (!byWidth.has(source.width)) byWidth.set(source.width, source);
  }
  return [...byWidth.values()].sort((a, b) => a.width - b.width);
}
