"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Card,
  FormControl,
  Loader,
  Select,
  Text,
  View,
} from "reshaped";
import { fetchQuery, graphql, useRelayEnvironment } from "react-relay";
import type { Environment } from "relay-runtime";
import { describeApiError } from "./api-errors";
import { TextLink } from "./links";
import { fromPhotoGlobalId, toPhotoGlobalId } from "@/lib/photos/photo-id";
import { useApiMutation } from "./use-api-mutation";
import type { PhotoGallerySetHiddenMutation } from "./__generated__/PhotoGallerySetHiddenMutation.graphql";
import type {
  PhotoGalleryQuery,
  PhotoStatus,
  Visibility,
} from "./__generated__/PhotoGalleryQuery.graphql";
import styles from "./photo-gallery.module.scss";

const PAGE_SIZE = 24;

type Visibility_ = Exclude<Visibility, "%future added value">;
type Status = Exclude<PhotoStatus, "%future added value">;

/** A library entry. `id` is the photo's UUID, which `/admin/photos/<id>` carries. */
interface GalleryPhoto {
  id: string;
  title: string | null;
  thumbUrl: string | null;
  hidden: boolean;
  status: Status;
}

interface KeywordCount {
  slug: string;
  label: string;
  count: number;
}

interface GalleryPage {
  photos: GalleryPhoto[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

/*
 * The library, read from the dmbk GraphQL API through the admin proxy (by
 * persisted id, with the session attached server-side).
 *
 * Every state is requested explicitly: the API's default is `[READY]`, and the
 * library exists to show pending and failed uploads too. The vocabulary rides
 * along on the first request only.
 */
const galleryQuery = graphql`
  query PhotoGalleryQuery(
    $keywords: [String!]
    $visibility: Visibility!
    $first: Int!
    $after: String
    $withKeywords: Boolean!
  ) {
    dmbkPhotos(
      keywords: $keywords
      visibility: $visibility
      states: [READY, PENDING, FAILED]
      first: $first
      after: $after
    ) {
      edges {
        node {
          id
          title
          thumbUrl
          hidden
          status
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
    dmbkPhotosKeywords @include(if: $withKeywords) {
      slug
      label
      count
    }
  }
`;

async function fetchGallery(
  environment: Environment,
  args: { keyword: string; visibility: Visibility_; cursor?: string | null; withKeywords?: boolean },
): Promise<{ page: GalleryPage; vocabulary: KeywordCount[] | null }> {
  const data = await fetchQuery<PhotoGalleryQuery>(
    environment,
    galleryQuery,
    {
      keywords: args.keyword ? [args.keyword] : null,
      visibility: args.visibility,
      first: PAGE_SIZE,
      after: args.cursor ?? null,
      withKeywords: args.withKeywords ?? false,
    },
    // The list is local state, not rendered from the store; always ask.
    { fetchPolicy: "network-only" },
  ).toPromise();
  if (!data) throw new Error("The API returned no data.");

  const { edges, pageInfo } = data.dmbkPhotos;
  return {
    page: {
      photos: edges.map(({ node }) => ({
        id: fromPhotoGlobalId(node.id),
        title: node.title ?? null,
        thumbUrl: node.thumbUrl ?? null,
        // Privileged fields: null only without an admin session, which the
        // widened `states` would already have been refused for.
        hidden: node.hidden ?? false,
        status: (node.status ?? "READY") as Status,
      })),
      nextCursor: pageInfo.hasNextPage ? (pageInfo.endCursor ?? null) : null,
      hasNextPage: pageInfo.hasNextPage,
    },
    vocabulary: data.dmbkPhotosKeywords ? [...data.dmbkPhotosKeywords] : null,
  };
}

/** What each state should read as in the grid. */
function stateLabel(photo: GalleryPhoto): string {
  if (photo.status !== "READY") return photo.status.toLowerCase();
  return photo.hidden ? "hidden" : "visible";
}

/** Hidden and failed need noticing at a glance; visible is the quiet default. */
function stateColor(photo: GalleryPhoto): "neutral" | "warning" | "critical" | "positive" {
  if (photo.status === "FAILED") return "critical";
  if (photo.status !== "READY") return "neutral";
  return photo.hidden ? "warning" : "positive";
}

const setHiddenMutation = graphql`
  mutation PhotoGallerySetHiddenMutation($input: DmbkPhotosSetPhotoHiddenInput!) {
    dmbkPhotosSetPhotoHidden(input: $input) {
      photo {
        id
        hidden
      }
    }
  }
`;

/**
 * The admin photo library.
 *
 * Reads and writes both go to the dmbk GraphQL API through the admin proxy.
 *
 * Owns its own state and navigates nowhere, so a modal could host it later.
 */
export default function PhotoGallery() {
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [vocabulary, setVocabulary] = useState<KeywordCount[]>([]);
  const [keyword, setKeyword] = useState("");
  const [visibility, setVisibility] = useState<Visibility_>("ANY");
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const environment = useRelayEnvironment();
  const [setPhotoHidden, togglingHidden] =
    useApiMutation<PhotoGallerySetHiddenMutation>(setHiddenMutation);

  /** Load the first page for the current filters, replacing what is shown. */
  const load = useCallback(
    async (nextKeyword: string, nextVisibility: Visibility_) => {
      setLoading(true);
      setError(null);
      try {
        const { page } = await fetchGallery(environment, {
          keyword: nextKeyword,
          visibility: nextVisibility,
        });
        setPhotos(page.photos);
        setCursor(page.nextCursor);
        setHasNextPage(page.hasNextPage);
      } catch (err) {
        setError(describeApiError(err, "Could not load the library."));
      } finally {
        setLoading(false);
      }
    },
    [environment],
  );

  useEffect(() => {
    let cancelled = false;
    void fetchGallery(environment, { keyword: "", visibility: "ANY", withKeywords: true })
      .then(({ page, vocabulary: k }) => {
        if (cancelled) return;
        setPhotos(page.photos);
        setCursor(page.nextCursor);
        setHasNextPage(page.hasNextPage);
        if (k) setVocabulary(k);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(describeApiError(err, "Could not load the library."));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [environment]);

  const changeKeyword = useCallback(
    (value: string) => {
      setKeyword(value);
      void load(value, visibility);
    },
    [load, visibility],
  );

  const changeVisibility = useCallback(
    (value: Visibility_) => {
      setVisibility(value);
      void load(keyword, value);
    },
    [keyword, load],
  );

  const clearFilters = useCallback(() => {
    setKeyword("");
    setVisibility("ANY");
    void load("", "ANY");
  }, [load]);

  /** Append the next page, preserving the active filters. */
  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setLoading(true);
    try {
      const { page } = await fetchGallery(environment, { keyword, visibility, cursor });
      setPhotos((prev) => [...prev, ...page.photos]);
      setCursor(page.nextCursor);
      setHasNextPage(page.hasNextPage);
    } catch (err) {
      setError(describeApiError(err, "Could not load more photos."));
    } finally {
      setLoading(false);
    }
  }, [cursor, environment, keyword, visibility]);

  const toggleHidden = useCallback(
    async (photo: GalleryPhoto) => {
      setError(null);
      try {
        const { dmbkPhotosSetPhotoHidden } = await setPhotoHidden({
          input: { id: toPhotoGlobalId(photo.id), hidden: !photo.hidden },
        });
        const hidden = dmbkPhotosSetPhotoHidden.photo.hidden ?? !photo.hidden;
        setPhotos((prev) =>
          prev
            .map((p) => (p.id === photo.id ? { ...p, hidden } : p))
            // Under a visibility filter the photo no longer matches what was
            // asked for, so it leaves. In the unfiltered view it stays put —
            // making the row you just clicked vanish reads as deletion, which
            // is the one thing hiding is meant not to be.
            .filter(
              (p) =>
                visibility === "ANY" ||
                (visibility === "HIDDEN" ? p.hidden : !p.hidden),
            ),
        );
      } catch (err) {
        setError(describeApiError(err, "Could not change visibility."));
      }
    },
    [setPhotoHidden, visibility],
  );

  const filtered = keyword !== "" || visibility !== "ANY";

  return (
    <View as="section" gap={6}>
      <View gap={1}>
        <Text as="h2" variant="featured-3">
          Photo library
        </Text>
        <Text color="neutral-faded">
          Every photo, newest first — hidden, pending and failed included.
        </Text>
      </View>

      {error && (
        <Alert color="critical" title="Something went wrong">
          {error}
        </Alert>
      )}

      <View direction="row" wrap gap={3} align="end">
        <View width={{ s: "100%", m: "16rem" }}>
          <FormControl id="gallery-keyword">
            <FormControl.Label>Keyword</FormControl.Label>
            <Select
              name="keyword"
              value={keyword}
              onChange={({ value }) => changeKeyword(value)}
            >
              <option value="">All keywords</option>
              {vocabulary.map((k) => (
                <option key={k.slug} value={k.slug}>
                  {k.label} ({k.count})
                </option>
              ))}
            </Select>
          </FormControl>
        </View>
        <View width={{ s: "100%", m: "12rem" }}>
          <FormControl id="gallery-visibility">
            <FormControl.Label>Visibility</FormControl.Label>
            <Select
              name="visibility"
              value={visibility}
              onChange={({ value }) => changeVisibility(value as Visibility_)}
            >
              <option value="ANY">All</option>
              <option value="VISIBLE">Visible</option>
              <option value="HIDDEN">Hidden</option>
            </Select>
          </FormControl>
        </View>
        {filtered && (
          <Button variant="ghost" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </View>

      {loading && photos.length === 0 ? (
        <View direction="row" gap={3} align="center">
          <Loader size="small" ariaLabel="Loading photos" />
          <Text color="neutral-faded">Loading photos…</Text>
        </View>
      ) : photos.length === 0 ? (
        <Text color="neutral-faded" attributes={{ "data-testid": "gallery-empty" }}>
          {filtered
            ? "No photos match those filters."
            : "No photos in the library yet."}
        </Text>
      ) : (
        <ul className={styles.grid} data-testid="gallery-grid">
          {photos.map((photo) => (
            <li key={photo.id} data-photo-id={photo.id}>
              <Card padding={0} className={styles.card}>
                <Link href={`/admin/photos/${photo.id}`} className={styles.thumbLink} tabIndex={-1} aria-hidden>
                  {photo.thumbUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element -- CDN
                       thumbnail, already sized by the library's derivatives */
                    <img
                      src={photo.thumbUrl}
                      alt=""
                      className={styles.thumb}
                    />
                  ) : (
                    // A pending or failed upload has no derivative yet. Say so
                    // rather than rendering a broken image.
                    <span className={styles.noThumb}>No image</span>
                  )}
                </Link>
                <View padding={3} gap={2}>
                  <TextLink href={`/admin/photos/${photo.id}`} variant="plain" color="inherit">
                    {photo.title ?? "Untitled"}
                  </TextLink>
                  <View direction="row" gap={2} align="center" justify="space-between">
                    <Badge
                      size="small"
                      color={stateColor(photo)}
                      attributes={{ "data-testid": "gallery-state" }}
                    >
                      {stateLabel(photo)}
                    </Badge>
                    {photo.status === "READY" && (
                      <Button
                        size="small"
                        variant="outline"
                        onClick={() => toggleHidden(photo)}
                        disabled={togglingHidden}
                      >
                        {photo.hidden ? "Unhide" : "Hide"}
                      </Button>
                    )}
                  </View>
                </View>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {hasNextPage && (
        <View direction="row">
          <Button variant="outline" onClick={loadMore} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </View>
      )}
      {!hasNextPage && photos.length > 0 && (
        <Text variant="caption-1" color="neutral-faded">
          End of library.
        </Text>
      )}
    </View>
  );
}
