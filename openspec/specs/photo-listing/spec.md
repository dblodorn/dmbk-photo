# photo-listing Specification

## Purpose

Defines the public read contract for the photo library: how photos are ordered and paged through with cursors, how keyword filtering narrows the results, what a photo looks like in a response including the URLs its images are served from, and how the keyword vocabulary is exposed for building filter controls.

Error codes below are named as tRPC codes, since that is the transport. `BAD_REQUEST` surfaces as HTTP 400, `UNAUTHORIZED` as 401, and `NOT_FOUND` as 404.

## Requirements

### Requirement: The listing returns only ready photos, newest first

The public listing SHALL return only photos that are in `ready` state and not hidden. Results SHALL be ordered by creation time descending, most recent first, with the photo identifier as a tie-breaker so that the order is total and stable across requests. Photos in `pending` or `failed` state SHALL never appear, and neither SHALL hidden photos.

#### Scenario: Newest photo appears first

- **WHEN** a caller requests the listing and three `ready` photos exist with different creation times
- **THEN** the results are ordered from most recently created to least

#### Scenario: Identical creation times are ordered deterministically

- **WHEN** two photos share the same creation time
- **THEN** they appear in a consistent relative order on every request, and neither is omitted nor duplicated

#### Scenario: Unfinished photos are excluded

- **WHEN** the library holds `ready`, `pending`, and `failed` photos
- **THEN** the listing contains only the `ready` ones

#### Scenario: Hidden photos are excluded

- **WHEN** the library holds visible and hidden `ready` photos
- **THEN** the listing contains only the visible ones

#### Scenario: Hiding takes effect on the listing

- **WHEN** a photo that appeared in the listing is hidden and the listing is requested again
- **THEN** that photo is absent

#### Scenario: Empty library

- **WHEN** a caller requests the listing and no visible `ready` photos exist
- **THEN** the result is an empty set and no next cursor, as a normal result rather than an error

### Requirement: The listing pages through results with an opaque cursor

The listing SHALL accept a page size and an optional cursor, and SHALL return the requested page together with a cursor for the next page. The cursor SHALL be opaque to callers — its internal structure is not part of this contract and callers SHALL only ever pass back a cursor the system issued. When no further results exist, the response SHALL report the absence of a next cursor rather than an empty-but-present one. Page size SHALL default to 24 and SHALL be capped at 100; a request for a larger page SHALL be served at the cap rather than rejected. A page size that is not a positive integer SHALL be rejected with `BAD_REQUEST`. A malformed or unparseable cursor SHALL be rejected with `BAD_REQUEST` rather than silently returning the first page.

#### Scenario: First page is returned with a next cursor

- **WHEN** 30 `ready` photos exist and a caller requests the listing with a page size of 10 and no cursor
- **THEN** the 10 newest photos are returned along with a next cursor

#### Scenario: Following the cursor advances without overlap

- **WHEN** a caller requests the next page using the cursor from the previous response
- **THEN** the following 10 photos are returned, none of which appeared on the previous page

#### Scenario: Last page reports no next cursor

- **WHEN** a caller pages to the final set of results
- **THEN** the remaining photos are returned and the response reports no next cursor

#### Scenario: Paging covers every photo exactly once

- **WHEN** a caller follows cursors from the first page to the last against an unchanging library
- **THEN** every `ready` photo is seen exactly once

#### Scenario: Oversized page request is capped

- **WHEN** a caller requests a page size of 500
- **THEN** the response contains at most 100 photos rather than an error

#### Scenario: Invalid page size

- **WHEN** a caller requests a page size of 0, a negative number, or a non-numeric value
- **THEN** the request is rejected with `BAD_REQUEST`

#### Scenario: Malformed cursor

- **WHEN** a caller supplies a cursor value the system did not issue
- **THEN** the request is rejected with `BAD_REQUEST` rather than returning the first page

#### Scenario: New photo added mid-paging does not shift a page

- **WHEN** a caller has fetched the first page and a newer photo is added before the second page is requested
- **THEN** the second page still continues after the last photo of the first page, without repeating a photo already returned

### Requirement: The listing filters by keyword with AND semantics

The listing SHALL accept zero or more keyword slugs as a filter. With no keyword supplied, all `ready` photos are eligible. With one or more keywords supplied, only photos carrying **every** supplied keyword SHALL be returned. Supplied keywords SHALL be normalized the same way stored keywords are, so filter input differing only in casing or spacing matches. Filtering SHALL compose with pagination: cursors SHALL remain valid within a fixed filter, and ordering SHALL be unchanged by filtering. A keyword that matches no photos SHALL yield an empty result set successfully, not an error.

#### Scenario: Single keyword filter

- **WHEN** a caller filters the listing by `film`
- **THEN** only `ready` photos carrying `film` are returned, still newest first

#### Scenario: Multiple keywords require all

- **WHEN** a caller filters by both `film` and `harbor`
- **THEN** only photos carrying both keywords are returned, and a photo carrying just one of them is excluded

#### Scenario: Filter input is normalized

- **WHEN** a caller filters by `"Black and White"`
- **THEN** photos carrying the slug `black-and-white` are returned

#### Scenario: Unknown keyword yields no results

- **WHEN** a caller filters by a keyword no photo carries
- **THEN** the result is an empty set and no next cursor, as a normal result rather than an error

#### Scenario: Filtering pages correctly

- **WHEN** a caller pages through a filtered listing using the returned cursors
- **THEN** every matching photo is seen exactly once and no non-matching photo appears

#### Scenario: No filter returns everything

- **WHEN** a caller requests the listing with no keyword filter
- **THEN** all `ready` photos are eligible, including those with no keywords at all

### Requirement: A listed photo carries the data needed to render it

Each photo in a response SHALL carry its identifier, its title when it has one, its keyword slugs, its intrinsic pixel width and height, its creation time, and the URLs for its thumbnail, grid, and display variants. Intrinsic dimensions SHALL be present on every `ready` photo so a client can reserve layout space before the image loads. The URLs SHALL be absolute and directly loadable in a browser without credentials, and SHALL be served from the storage CDN rather than proxied through the application. The URL of the stored original SHALL NOT be exposed in public responses.

A variant a photo does not have SHALL be reported as absent rather than as a URL that does not resolve, so a client can tell a missing variant from a broken one.

#### Scenario: Photo carries render data

- **WHEN** a caller reads a `ready` photo from the listing
- **THEN** the entry includes its identifier, keywords, intrinsic width and height, creation time, and thumbnail, grid, and display URLs

#### Scenario: Untitled photo

- **WHEN** a listed photo has no title
- **THEN** the entry is returned with its title absent or null rather than the entry being omitted from results

#### Scenario: Variant URLs load anonymously

- **WHEN** a browser with no session requests a photo's thumbnail, grid, or display URL
- **THEN** the image loads successfully

#### Scenario: A variant that does not exist

- **WHEN** a caller reads a `ready` photo that was finalized before the grid variant existed
- **THEN** its grid URL is absent or null, its other variant URLs are present, and the photo is listed normally

#### Scenario: Original is not exposed

- **WHEN** a caller reads any public photo response
- **THEN** no URL or key for the stored original appears in it

### Requirement: A single photo can be read by identifier

The system SHALL return a single `ready`, non-hidden photo by its identifier, with the same fields it carries in the listing. An identifier matching no photo, or matching a photo that is not `ready`, or matching a hidden photo, SHALL return `NOT_FOUND` — a hidden photo SHALL be indistinguishable from a nonexistent one to a caller without an admin session, so that hiding cannot be defeated by addressing a photo directly. A malformed identifier SHALL be rejected with `BAD_REQUEST` or `NOT_FOUND` and SHALL NOT surface as an unhandled server error.

#### Scenario: Existing photo is returned

- **WHEN** a caller requests a `ready`, non-hidden photo by its identifier
- **THEN** the photo is returned with the same fields it carries in the listing

#### Scenario: Unknown identifier

- **WHEN** a caller requests an identifier matching no photo
- **THEN** the request is rejected with `NOT_FOUND`

#### Scenario: Hidden photo read directly

- **WHEN** a caller with no admin session requests a hidden photo by its exact identifier
- **THEN** the request is rejected with `NOT_FOUND`, the same as for an identifier that matches nothing

#### Scenario: Malformed identifier

- **WHEN** a caller requests a photo using an identifier that is not a well-formed identifier
- **THEN** the request is rejected with `BAD_REQUEST` or `NOT_FOUND`, and never surfaces as an unhandled server error

### Requirement: The keyword vocabulary is publicly readable

The system SHALL expose the keyword vocabulary publicly as a list of slugs, each with its display label and its count of publicly visible photos — those that are `ready` and not hidden. The list SHALL be ordered by count descending with slug ascending as a tie-breaker, so the ordering is deterministic. Keywords carried only by photos that are not `ready`, or that are hidden, SHALL NOT appear with a non-zero count. The vocabulary SHALL be readable with no session.

#### Scenario: Vocabulary is returned with counts

- **WHEN** a caller requests the keyword vocabulary
- **THEN** each keyword in use is returned with its display label and its count of publicly visible photos

#### Scenario: Vocabulary ordering is deterministic

- **WHEN** two keywords have the same count
- **THEN** they are ordered by slug ascending, and the order is the same on every request

#### Scenario: Vocabulary is anonymous

- **WHEN** a caller with no session requests the vocabulary
- **THEN** the request succeeds

#### Scenario: Hidden photos do not inflate counts

- **WHEN** a keyword is carried by two `ready` photos and one of them is hidden
- **THEN** the vocabulary reports that keyword with a count of 1

#### Scenario: Empty vocabulary

- **WHEN** no publicly visible photo carries any keyword
- **THEN** the result is an empty list, as a normal result rather than an error

### Requirement: Reads may be cached, bounded by a short staleness window

Public reads SHALL be safe to cache rather than being required to reach the dmbk GraphQL API on every request, and any caching SHALL be bounded so that a photo write — finalizing, updating, or deleting a photo — becomes visible to subsequent public reads within a short window rather than being served stale indefinitely. A cached result SHALL be keyed by the full set of read parameters, so that a result computed for one keyword filter, page size, or cursor is never served in answer to a different one. Caching SHALL NOT be applied to any operation requiring a session.

#### Scenario: Write becomes visible

- **WHEN** a photo's title is updated and a caller reads that photo after the staleness window
- **THEN** the updated title is returned

#### Scenario: Filters do not share a cache entry

- **WHEN** one caller requests the listing filtered by `film` and another requests it filtered by `harbor`
- **THEN** each receives results matching its own filter

#### Scenario: Cursors do not share a cache entry

- **WHEN** two callers request the same filter at different cursors
- **THEN** each receives the page its own cursor addresses

#### Scenario: Authenticated operations are not cached

- **WHEN** an administrator performs a write or an admin read
- **THEN** its result is not served from, nor stored in, any shared cache

### Requirement: Visibility is a filter dimension for permitted callers

The listing SHALL accept a visibility filter selecting visible photos, hidden photos, or both. Using it SHALL require an admin session: a caller without one SHALL always receive the public result — `ready` and not hidden — regardless of what visibility they ask for, and SHALL NOT be able to widen their own view by supplying the filter. The filter SHALL compose with keyword filtering and with pagination.

#### Scenario: Administrator lists hidden photos

- **WHEN** an administrator requests the listing filtered to hidden photos
- **THEN** only hidden photos are returned

#### Scenario: Administrator lists everything

- **WHEN** an administrator requests the listing filtered to both visible and hidden
- **THEN** both appear in one result set, each identifiable by its visibility

#### Scenario: Anonymous caller cannot widen the view

- **WHEN** a caller with no session requests the listing asking for hidden photos
- **THEN** the result contains only visible `ready` photos, exactly as though no visibility filter had been supplied

#### Scenario: Visibility composes with keywords

- **WHEN** an administrator filters by the keyword `film` and by hidden
- **THEN** only hidden photos carrying `film` are returned

#### Scenario: Visibility composes with paging

- **WHEN** an administrator pages through a visibility-filtered listing using the returned cursors
- **THEN** every matching photo is seen exactly once and no non-matching photo appears

### Requirement: Public reads are served by the dmbk GraphQL API

Every public read of the photo library this application performs — the listing, the keyword vocabulary, and a single photo — SHALL be made through the dmbk GraphQL API. This application SHALL NOT read the photo library from the database itself, so that visibility, keyword and cursor rules live in one place.

#### Scenario: Gallery page renders from the API

- **WHEN** a visitor requests the gallery
- **THEN** the photos and vocabulary on the page are the ones the dmbk GraphQL API returns for an anonymous caller

#### Scenario: No database read for photos

- **WHEN** this application serves any page or route
- **THEN** it opens no connection to the photo library's database to do so
