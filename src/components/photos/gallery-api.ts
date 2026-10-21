/**
 * The public gallery's reads, against the dmbk GraphQL API.
 *
 * The documents, the connection-to-page adapter and the global-ID handling
 * live in `lib/photos/api.ts`, shared with the gallery page (`app/page.tsx`) so
 * the server-rendered first page and every later page come from the same
 * query. The endpoint is handed down from that server component as a prop.
 *
 * Deliberately NOT shared with the admin's reads. Those select `hidden`,
 * `status` and `failureReason` and travel through the admin proxy with a
 * session; these are anonymous and go to the API directly.
 */

export {
  fetchKeywords,
  fetchPhoto,
  fetchPhotoPage,
  type GalleryPhoto,
  type KeywordCount,
  type PhotoPage,
} from "@/lib/photos/api";
