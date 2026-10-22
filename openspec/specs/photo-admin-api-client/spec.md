# photo-admin-api-client Specification

## Purpose

Defines how the admin section reaches the dmbk GraphQL API for photo writes: through a same-origin proxy that attaches the administrator's session on the server, never exposes the session token to page scripts, and reports the API's refusals and failures in terms the admin screens can act on.

## Requirements

### Requirement: Admin photo writes go only through the dmbk GraphQL API

Every photo write the admin section performs — reserving an upload, finalizing it, updating a photo's title or keywords, hiding or unhiding it, and deleting it — SHALL be performed by the dmbk GraphQL API. This application SHALL NOT expose a photo write operation of its own, so that the rules governing a write live in one place.

#### Scenario: Editing a photo writes through the API

- **WHEN** an administrator saves a title change from the edit view
- **THEN** the change is made by the dmbk GraphQL API, and the photo reads back with the new title from every read surface

#### Scenario: No local write surface remains

- **WHEN** a caller, signed in or not, attempts to reserve, finalize, update, hide or delete a photo through this application's own API routes
- **THEN** no such operation exists, and nothing is created, changed or removed

### Requirement: The session token stays server-side

The admin's operations against the dmbk GraphQL API SHALL be sent to a route on this application's own origin, which SHALL forward them to the API carrying the session token from the HTTP-only admin session cookie. The token SHALL NOT be readable by page scripts, SHALL NOT appear in any response body or header returned to the browser, and the browser SHALL NOT call the API directly.

#### Scenario: Forwarded with the session

- **WHEN** a signed-in administrator's screen sends an operation to the proxy
- **THEN** the API receives it authorized as that administrator's session

#### Scenario: Token never reaches the page

- **WHEN** any admin screen performs an operation through the proxy
- **THEN** no response the browser receives contains the session token, and no page script can read it

### Requirement: The proxy refuses requests without a session and forwards nothing else

The proxy SHALL reject a request carrying no session cookie without contacting the API, answering in the same shape the API uses for an unauthenticated caller. It SHALL accept only GraphQL operations sent by POST from this application's own origin, and SHALL forward only the operation, its variables and the session token — no other cookie or header from the browser.

#### Scenario: No session cookie

- **WHEN** a request without the admin session cookie reaches the proxy
- **THEN** it is refused as unauthenticated and the API is not called

#### Scenario: Cross-origin request

- **WHEN** a page on another origin posts an operation to the proxy with the administrator's cookie attached
- **THEN** the request is refused and nothing is forwarded

#### Scenario: Other cookies are not forwarded

- **WHEN** the browser sends cookies besides the admin session cookie
- **THEN** the API receives none of them

### Requirement: API outcomes are reported in terms an administrator can act on

Each admin screen SHALL translate the API's error codes into messages naming what went wrong: an ended or refused session SHALL read as the session having ended, a photo that no longer exists as not found, invalid input with the API's own message, and a delete whose files could not be removed as exactly that. An unreachable API or an unexpected failure SHALL be reported as a failure to reach the photo service rather than as success, and SHALL leave the screen usable for another attempt.

#### Scenario: Session ended

- **WHEN** an administrator's session has ended and they attempt any write
- **THEN** the screen says the session ended and asks them to sign in again

#### Scenario: Invalid input

- **WHEN** the API rejects a write as invalid input, such as an over-long title
- **THEN** the screen reports the API's reason

#### Scenario: API unreachable

- **WHEN** the API cannot be reached while an administrator saves
- **THEN** the screen reports that the save failed, keeps what was typed, and allows another attempt

### Requirement: Admin photo reads go only through the dmbk GraphQL API

Every photo read the admin section performs — the library gallery's pages and keyword list, and the photo the edit view loads — SHALL be made through the dmbk GraphQL API via the same-origin proxy, carrying the administrator's session. This application SHALL NOT expose a photo read operation of its own, signed in or not.

#### Scenario: Gallery lists hidden and failed photos

- **WHEN** a signed-in administrator opens the library with visibility set to any
- **THEN** the list comes from the dmbk GraphQL API through the proxy and includes hidden, `pending` and `failed` photos with their visibility and state

#### Scenario: Edit view loads a hidden photo

- **WHEN** a signed-in administrator opens `/admin/photos/<uuid>` for a hidden photo
- **THEN** the edit view loads its current title and keywords from the dmbk GraphQL API

#### Scenario: No local read surface remains

- **WHEN** any caller requests this application's `/api/graphql` or `/api/trpc`
- **THEN** no such route exists
