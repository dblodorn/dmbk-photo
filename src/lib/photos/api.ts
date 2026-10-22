/**
 * The public photo library, read from the dmbk GraphQL API.
 *
 * Server-only. Shared by the gallery page, `app/page.tsx` (first page and
 * vocabulary), and `/api/photos` (the browser's later pages, filters and deep
 * links), so both ask the same question in the same words and the cursor one
 * hands over is one the other can continue from. The browser never calls the
 * API itself: these requests carry this app's API key, which stays on the
 * server. Endpoint and key are parameters (`apiUrl()` / `apiKey()`).
 *
 * Hand-written documents and a bare `fetch` rather than Relay: these reads need
 * no session, and keeping Relay out of the public bundle is the boundary the
 * compiler config draws (it excludes `src/lib` and the site routes).
 *
 * Ids leave this module as UUIDs. The API speaks Relay global IDs, but gallery
 * URLs carry UUIDs and the listing's tie-break orders by them; see photo-id.ts.
 */

import { post, type PostOptions } from "@/lib/dmbk-api";
import { fromPhotoGlobalId, toPhotoGlobalId } from "./photo-id";

/** How long a gallery read may be served from Next's fetch cache, in seconds. */
export const STALENESS_WINDOW = 60;

/** A photo as the public gallery renders it. No privileged fields. */
export interface GalleryPhoto {
  /** The photo's UUID. */
  id: string;
  title: string | null;
  keywords: string[];
  width: number | null;
  height: number | null;
  createdAt: string;
  thumbUrl: string | null;
  /** Null for a photo finalized before this variant existed. */
  gridUrl: string | null;
  displayUrl: string | null;
}

/** One page of the listing, whether rendered by the server or fetched later. */
export interface PhotoPage {
  photos: GalleryPhoto[];
  /** Opaque. Pass back verbatim; never construct one. */
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface KeywordCount {
  slug: string;
  label: string;
  count: number;
}

/** Shared selection set. A fragment of a document, not a document itself. */
const PHOTO_FIELDS = `
  id
  title
  keywords
  width
  height
  createdAt
  thumbUrl
  gridUrl
  displayUrl
`;

/**
 * The public view, stated rather than defaulted. An anonymous request gets it
 * anyway, but pinning it keeps the gallery showing everyone the same set even
 * if a token were ever attached, and requesting exactly this is not privileged.
 */
const PHOTOS_QUERY = /* GraphQL */ `
  query GalleryPhotos($keywords: [String!], $after: String, $first: Int) {
    dmbkPhotos(keywords: $keywords, after: $after, first: $first, visibility: VISIBLE, states: [READY]) {
      edges { node { ${PHOTO_FIELDS} } }
      pageInfo { endCursor hasNextPage }
    }
  }
`;

type ApiPhoto = GalleryPhoto;

function toGalleryPhoto(photo: ApiPhoto): GalleryPhoto {
  return { ...photo, id: fromPhotoGlobalId(photo.id) };
}

export async function fetchPhotoPage(
  endpoint: string,
  args: { keywords?: readonly string[]; cursor?: string | null; limit?: number },
  options?: PostOptions,
): Promise<PhotoPage> {
  const data = await post<{
    dmbkPhotos: {
      edges: { node: ApiPhoto }[];
      pageInfo: { endCursor: string | null; hasNextPage: boolean };
    };
  }>(
    endpoint,
    PHOTOS_QUERY,
    {
      // Null, not an empty list, is what "no filter" means to the resolver.
      keywords: args.keywords?.length ? [...args.keywords] : null,
      after: args.cursor ?? null,
      first: args.limit ?? null,
    },
    options,
  );
  const { edges, pageInfo } = data.dmbkPhotos;
  return {
    photos: edges.map((edge) => toGalleryPhoto(edge.node)),
    // The end cursor of a last page leads nowhere; report it as absent.
    nextCursor: pageInfo.hasNextPage ? pageInfo.endCursor : null,
    hasNextPage: pageInfo.hasNextPage,
  };
}

const KEYWORDS_QUERY = /* GraphQL */ `
  query GalleryKeywords {
    dmbkPhotosKeywords { slug label count }
  }
`;

export async function fetchKeywords(
  endpoint: string,
  options?: PostOptions,
): Promise<KeywordCount[]> {
  const data = await post<{ dmbkPhotosKeywords: KeywordCount[] }>(endpoint, KEYWORDS_QUERY, {}, options);
  return data.dmbkPhotosKeywords;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PHOTO_QUERY = /* GraphQL */ `
  query GalleryPhoto($id: ID!) {
    node(id: $id) { ... on Photo { ${PHOTO_FIELDS} } }
  }
`;

/**
 * One photo by UUID, for a deep link naming a photo outside the loaded pages.
 *
 * Resolves to null — not an error — when the photo is hidden, not `ready`, or
 * does not exist. The three are indistinguishable by contract, which is what
 * stops a deep link from being a way to probe for hidden photos.
 */
export async function fetchPhoto(
  endpoint: string,
  uuid: string,
  options?: PostOptions,
): Promise<GalleryPhoto | null> {
  // A malformed id cannot name a photo; answer as for any unreadable one.
  if (!UUID_RE.test(uuid)) return null;
  const data = await post<{ node: ApiPhoto | Record<string, never> | null }>(
    endpoint,
    PHOTO_QUERY,
    { id: toPhotoGlobalId(uuid) },
    options,
  );
  // `... on Photo` yields an empty object for a node of another type.
  return data.node && "id" in data.node ? toGalleryPhoto(data.node as ApiPhoto) : null;
}
