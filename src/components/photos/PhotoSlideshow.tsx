"use client";

import { useCallback, useEffect, useRef } from "react";
import { Button, Text } from "reshaped";
import Image from "@/components/ui/Image";
import type { GalleryPhoto } from "./gallery-api";
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "./icons";
import styles from "./gallery.module.css";

interface Props {
  photos: GalleryPhoto[];
  /** Index into `photos` of the photo on screen. */
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Whether another page exists behind the end of `photos`. */
  hasNextPage: boolean;
  loading: boolean;
  onLoadMore: () => void;
}

/** Minimum horizontal travel, in pixels, before a touch counts as a swipe. */
const SWIPE_THRESHOLD = 50;

/**
 * The gallery's fullscreen view.
 *
 * Its own overlay rather than Reshaped's Modal: the stage is the whole
 * viewport, the arrow keys page through a list that can grow while it is
 * open, and Escape and the back button both have to route through the URL
 * (see PhotoGalleryShell) — so it keeps its own keyboard handling and focus
 * trap, and takes its controls and colours from the theme.
 */
export default function PhotoSlideshow({
  photos,
  index,
  onIndexChange,
  onClose,
  hasNextPage,
  loading,
  onLoadMore,
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  /**
   * Set when the visitor tried to advance past the end while another page was
   * still loading, so the move can be completed once it arrives rather than
   * silently dropped.
   */
  const pendingAdvance = useRef(false);

  const photo = photos[index];
  const atLast = index >= photos.length - 1;

  /**
   * The index as of the last navigation, advanced synchronously.
   *
   * The displayed index lives in the URL, so it only catches up once the
   * router has committed. Deriving the next photo from the `index` prop would
   * therefore make two keypresses inside one commit both compute the *same*
   * target — which is what holding down an arrow key does, and it would stall
   * on the second photo. Stepping this ref forward immediately lets rapid
   * presses compose; the effect below re-syncs it whenever the index changes
   * from anywhere else.
   */
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const goBack = useCallback(() => {
    // Holds at the first photo rather than wrapping: with a list that grows
    // from one end, wrapping to "the last photo so far" is an arbitrary place
    // to land.
    const from = indexRef.current;
    if (from > 0) {
      indexRef.current = from - 1;
      onIndexChange(from - 1);
    }
  }, [onIndexChange]);

  const goForward = useCallback(() => {
    const from = indexRef.current;
    if (from < photos.length - 1) {
      indexRef.current = from + 1;
      onIndexChange(from + 1);
      return;
    }
    // At the end of what is loaded: pull the next page and continue into it.
    // With no further page, hold here — the spec's "remains on a photo".
    if (hasNextPage) {
      pendingAdvance.current = true;
      onLoadMore();
    }
  }, [photos.length, hasNextPage, onIndexChange, onLoadMore]);

  // Complete a deferred advance once the page it was waiting on has landed.
  useEffect(() => {
    if (!pendingAdvance.current || loading) return;
    if (index < photos.length - 1) {
      pendingAdvance.current = false;
      onIndexChange(index + 1);
    } else if (!hasNextPage) {
      pendingAdvance.current = false;
    }
  }, [photos.length, loading, index, hasNextPage, onIndexChange]);

  // Keyboard: arrows navigate, Escape closes, Tab is confined to the overlay.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          goBack();
          break;
        case "ArrowRight":
          event.preventDefault();
          goForward();
          break;
        case "Escape":
          event.preventDefault();
          onClose();
          break;
        case "Tab": {
          const overlay = overlayRef.current;
          if (!overlay) return;
          const focusable = Array.from(
            overlay.querySelectorAll<HTMLElement>("button:not([disabled])"),
          );
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
          break;
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goBack, goForward, onClose]);

  // Focus enters the overlay on open. The shell restores focus to the tile on
  // close, since by then the visitor may be on a different photo than the one
  // they opened.
  useEffect(() => {
    overlayRef.current
      ?.querySelector<HTMLElement>(`button.${styles.close}`)
      ?.focus();
  }, []);

  /**
   * Lock the page behind.
   *
   * Pinning `body` to its current offset rather than only hiding overflow:
   * `overflow: hidden` alone lets iOS Safari scroll the page underneath, and
   * the visitor returns to the gallery somewhere they never chose.
   */
  useEffect(() => {
    const { scrollY } = window;
    const { style } = document.body;
    const previous = {
      position: style.position,
      top: style.top,
      width: style.width,
      overflow: style.overflow,
    };

    style.position = "fixed";
    style.top = `-${scrollY}px`;
    style.width = "100%";
    style.overflow = "hidden";

    return () => {
      style.position = previous.position;
      style.top = previous.top;
      style.width = previous.width;
      style.overflow = previous.overflow;
      window.scrollTo({ top: scrollY, behavior: "instant" as ScrollBehavior });
    };
  }, []);

  /**
   * Preload the neighbours' display variants.
   *
   * Without this, every step is a blank frame while a 1600px image downloads.
   */
  useEffect(() => {
    for (const neighbour of [photos[index - 1], photos[index + 1]]) {
      if (!neighbour?.displayUrl) continue;
      // `window.Image` rather than a bare `Image`: the component of that name
      // is imported above, and the browser's own constructor is what this
      // prefetch wants.
      const image = new window.Image();
      image.src = neighbour.displayUrl;
    }
  }, [photos, index]);

  const touchStartX = useRef<number | null>(null);
  const onTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0].clientX;
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const travelled = event.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(travelled) < SWIPE_THRESHOLD) return;
    // Swiping left moves forward, matching the direction the content moves.
    if (travelled < 0) goForward();
    else goBack();
  };

  if (!photo) return null;

  const canGoForward = !atLast || hasNextPage;

  return (
    <div
      ref={overlayRef}
      className={styles.slideshow}
      role="dialog"
      aria-modal="true"
      aria-label={photo.title ?? "Photograph"}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className={styles.stage}>
        <Image
          // Keyed by id so React swaps the element rather than mutating the
          // src on one node, which would show the previous photo stretched to
          // the new one's box until it decodes.
          key={photo.id}
          // One source, deliberately: fullscreen is what the display variant
          // is for, and offering the grid variant here would let a browser
          // fill the viewport with the smaller file.
          sources={[
            { url: photo.displayUrl ?? photo.thumbUrl ?? "", width: 1 },
          ]}
          width={photo.width}
          height={photo.height}
          alt={photo.title ?? "Untitled photograph"}
          // The visitor asked for this photo; there is nothing to defer.
          priority
          className={styles.slideImage}
          imgClassName={styles.slideImg}
        />
      </div>

      <div className={styles.bar}>
        <Text variant="body-2">{photo.title ?? ""}</Text>
        <Text variant="caption-1" color="neutral-faded">
          {index + 1} / {photos.length}
          {hasNextPage ? "+" : ""}
        </Text>
      </div>

      <Button
        className={`${styles.nav} ${styles.prev}`}
        variant="ghost"
        size="large"
        icon={ChevronLeftIcon}
        onClick={goBack}
        disabled={index === 0}
        attributes={{ "aria-label": "Previous photograph" }}
      />

      <Button
        className={`${styles.nav} ${styles.next}`}
        variant="ghost"
        size="large"
        icon={ChevronRightIcon}
        onClick={goForward}
        disabled={!canGoForward}
        attributes={{ "aria-label": "Next photograph" }}
      />

      <Button
        className={`${styles.nav} ${styles.close}`}
        variant="ghost"
        size="large"
        icon={CloseIcon}
        onClick={onClose}
        attributes={{ "aria-label": "Close" }}
      />
    </div>
  );
}
