# photo-library Specification

## Purpose

Defines what a photo record holds and how an administrator curates it: the title, the keyword tags and the vocabulary they accumulate into, how keywords are normalized so the same idea never splits into two tags, and what updating or deleting a photo does to both its metadata and its stored bytes.

Error codes below are named as tRPC codes, since that is the transport. `BAD_REQUEST` surfaces as HTTP 400, `UNAUTHORIZED` as 401, and `NOT_FOUND` as 404.

## Requirements

### Requirement: A photo record carries curation and storage metadata

Every photo SHALL have a stable identifier that is unique across the library and does not change for the life of the record. A photo record SHALL carry an optional title, a set of keyword slugs, its lifecycle state, whether it is hidden, the storage keys for its original and its derivatives, its intrinsic pixel width and height, its byte size, its content type, and the time it was created. The identifier SHALL be the value by which callers address a photo in every read and write operation. A photo SHALL NOT be hidden unless it has been explicitly hidden — a newly finalized photo is visible.

#### Scenario: Identifier is stable across updates

- **WHEN** a photo's title and keywords are updated
- **THEN** the photo's identifier is unchanged and still resolves to the same photo

#### Scenario: Identifiers are unique

- **WHEN** two photos are created
- **THEN** they carry different identifiers

#### Scenario: Record exposes its metadata

- **WHEN** a `ready` photo is read
- **THEN** the response carries its identifier, title, keywords, intrinsic width and height, and creation time

#### Scenario: A new photo is visible

- **WHEN** a photo is finalized
- **THEN** it is not hidden, and appears in public reads without any further action

#### Scenario: Existing photos predate the flag

- **WHEN** a photo stored before hiding existed is read
- **THEN** it is treated as visible rather than as being in an unknown state

### Requirement: A photo has an optional title within a length limit

A photo's title SHALL be optional; a photo with no title is valid and MUST be readable and listable. When supplied, a title SHALL be trimmed of leading and trailing whitespace and SHALL be at most 200 characters after trimming. A title longer than that SHALL be rejected with `BAD_REQUEST` rather than silently truncated. A title that is empty or whitespace-only after trimming SHALL be stored as no title at all.

#### Scenario: Photo without a title

- **WHEN** a photo is created with no title
- **THEN** it is stored, is listable, and reports no title

#### Scenario: Title is trimmed

- **WHEN** a photo is given the title `"  Harbor at dusk  "`
- **THEN** the stored title is `"Harbor at dusk"`

#### Scenario: Whitespace-only title clears the title

- **WHEN** a photo is given a title consisting only of spaces
- **THEN** the photo is stored with no title rather than a blank one

#### Scenario: Overlong title is rejected

- **WHEN** a photo is given a title longer than 200 characters after trimming
- **THEN** the request is rejected with `BAD_REQUEST` and the photo's existing title is unchanged

### Requirement: Keywords are normalized to slugs before storage

Every keyword supplied on a photo SHALL be normalized before it is stored: trimmed, lowercased, with internal whitespace and separator runs collapsed to a single hyphen, and with characters outside letters, digits, and hyphens removed. Two keyword inputs that normalize to the same slug SHALL be stored as one keyword on the photo, not two. A keyword that normalizes to an empty string SHALL be discarded rather than stored. A normalized slug SHALL be at most 60 characters. The system SHALL retain the first display label seen for a slug so the vocabulary can present a human-readable name.

#### Scenario: Casing and spacing are normalized

- **WHEN** a photo is tagged with `"Black and White"`
- **THEN** the stored keyword slug is `black-and-white`

#### Scenario: Duplicate keywords collapse

- **WHEN** a photo is tagged with `["Portrait", "portrait", " PORTRAIT "]`
- **THEN** the photo carries the single keyword `portrait`

#### Scenario: Empty keyword is discarded

- **WHEN** a photo is tagged with `["", "   ", "film"]`
- **THEN** the photo carries only `film`

#### Scenario: Punctuation is stripped

- **WHEN** a photo is tagged with `"35mm!"`
- **THEN** the stored keyword slug is `35mm`

#### Scenario: Overlong keyword is rejected

- **WHEN** a photo is tagged with a keyword that normalizes to more than 60 characters
- **THEN** the request is rejected with `BAD_REQUEST` and the photo's existing keywords are unchanged

### Requirement: The keyword vocabulary is derived from use

The system SHALL maintain a vocabulary of every keyword slug in use, each with a display label and a count of the publicly visible photos carrying it — those that are `ready` and not hidden. The vocabulary SHALL be updated as a consequence of photo writes rather than curated separately: tagging a photo with a previously unseen slug SHALL add it to the vocabulary, and the counts SHALL reflect only publicly visible photos. A slug that falls to zero visible photos SHALL either be removed from the vocabulary or reported with a count of zero, and SHALL NOT be reported with a stale non-zero count. Hiding and unhiding a photo SHALL adjust the counts of its keywords the same way finalizing and deleting do.

#### Scenario: New keyword enters the vocabulary

- **WHEN** a photo is finalized carrying a keyword slug no other photo uses
- **THEN** that slug appears in the vocabulary with a count of 1

#### Scenario: Count reflects only ready photos

- **WHEN** three photos carry the keyword `film` and one of them is still `pending`
- **THEN** the vocabulary reports `film` with a count of 2

#### Scenario: Count falls when a photo is hidden

- **WHEN** one of two visible photos carrying `harbor` is hidden
- **THEN** the vocabulary reports `harbor` with a count of 1

#### Scenario: Count rises when a photo is unhidden

- **WHEN** a hidden photo carrying `harbor` is unhidden
- **THEN** the vocabulary count for `harbor` increases by one

#### Scenario: Count falls when a keyword is removed

- **WHEN** the only visible photo carrying `film` has that keyword removed
- **THEN** `film` is no longer reported with a count of 1, but is either absent from the vocabulary or reported with a count of 0

#### Scenario: Count falls when a photo is deleted

- **WHEN** one of two visible photos carrying `harbor` is deleted
- **THEN** the vocabulary reports `harbor` with a count of 1

#### Scenario: Keywords of a hidden photo are not advertised

- **WHEN** the only photo carrying `dusk` is hidden
- **THEN** `dusk` is not reported with a non-zero count, so the vocabulary never offers a keyword that would return nothing

### Requirement: An administrator can update a photo's title and keywords

An authenticated administrator SHALL be able to update an existing photo's title, its keywords, or both. An update SHALL replace the supplied fields wholesale — the supplied keyword set becomes the photo's complete keyword set, not an addition to it — and SHALL leave fields that were not supplied untouched. Supplying an empty keyword set SHALL clear the photo's keywords. Updating a photo SHALL NOT alter its stored image bytes, its dimensions, or its identifier. Updating a photo that does not exist SHALL return `NOT_FOUND`.

#### Scenario: Title is updated alone

- **WHEN** an administrator updates only the title of a photo that has keywords
- **THEN** the title changes and the photo's keywords are unchanged

#### Scenario: Keywords are replaced wholesale

- **WHEN** a photo carrying `["film", "harbor"]` is updated with the keyword set `["dusk"]`
- **THEN** the photo carries only `dusk`, and `film` and `harbor` are no longer on it

#### Scenario: Keywords are cleared

- **WHEN** a photo carrying keywords is updated with an empty keyword set
- **THEN** the photo carries no keywords

#### Scenario: Update does not disturb the image

- **WHEN** a photo's title is updated
- **THEN** its stored original and derivatives are untouched and its recorded dimensions are unchanged

#### Scenario: Updating a missing photo

- **WHEN** an administrator updates a photo identifier that matches no record
- **THEN** the request is rejected with `NOT_FOUND`

### Requirement: Deleting a photo removes both its record and its stored bytes

An authenticated administrator SHALL be able to delete a photo. Deletion SHALL remove the photo's record and SHALL remove its original and every derivative from object storage, and SHALL update the keyword vocabulary counts accordingly. After deletion, reading that photo SHALL return `NOT_FOUND` and it SHALL be absent from listings. If removing the stored objects fails, the failure SHALL be logged server-side and SHALL NOT leave the record readable and listed as though nothing happened. Deleting a photo that does not exist SHALL return `NOT_FOUND`.

A photo that is missing one of its derivatives — because it was finalized before that variant existed — SHALL still delete cleanly, removing the objects it does have.

#### Scenario: Photo is deleted

- **WHEN** an administrator deletes a `ready` photo
- **THEN** subsequent reads of that identifier return `NOT_FOUND` and it is absent from listings

#### Scenario: Stored objects are removed

- **WHEN** a photo with an original and three derivatives is deleted
- **THEN** all four stored objects are removed from object storage

#### Scenario: A photo missing a derivative deletes cleanly

- **WHEN** a photo that has no grid variant is deleted
- **THEN** its original and the derivatives it does have are removed, and the deletion succeeds

#### Scenario: Deleting a missing photo

- **WHEN** an administrator deletes a photo identifier that matches no record
- **THEN** the request is rejected with `NOT_FOUND`

#### Scenario: Deletion leaves the rest of the library intact

- **WHEN** one photo among several is deleted
- **THEN** every other photo remains readable and listed, with its keywords intact

### Requirement: An administrator can hide and unhide a photo

An authenticated administrator SHALL be able to hide a photo and to unhide it again. Hiding SHALL remove the photo from every public read while leaving the record and its stored objects untouched — the original, the derivatives, the title, the keywords, the dimensions, and the identifier all survive. Unhiding SHALL restore the photo to public reads exactly as it was, with no re-upload and no loss of metadata. Hiding SHALL be distinct from deleting: a hidden photo can always be recovered, a deleted one cannot. Hiding a photo that does not exist SHALL return `NOT_FOUND`.

#### Scenario: Hiding removes a photo from public view

- **WHEN** an administrator hides a `ready` photo
- **THEN** it no longer appears in the public listing and reading it publicly by identifier reports it as not found

#### Scenario: Hiding preserves everything

- **WHEN** a photo with a title, keywords, and derivatives is hidden
- **THEN** its stored original and derivatives remain, and its title, keywords, and dimensions are unchanged

#### Scenario: Unhiding restores the photo

- **WHEN** a hidden photo is unhidden
- **THEN** it appears in the public listing again with the same title, keywords, and images it had before

#### Scenario: An administrator still sees hidden photos

- **WHEN** an administrator lists photos including hidden ones
- **THEN** the hidden photo is present and identifiable as hidden

#### Scenario: Hiding is idempotent

- **WHEN** an administrator hides a photo that is already hidden
- **THEN** the photo remains hidden and nothing else about it changes

#### Scenario: Hiding a missing photo

- **WHEN** an administrator hides a photo identifier that matches no record
- **THEN** the request is rejected with `NOT_FOUND`
