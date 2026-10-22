# photo-admin-auth Specification

## Purpose

Defines how the photo section distinguishes an administrator from an anonymous visitor through Google sign-in at the dmbk accounts API: which accounts may hold a session, how a session is carried, expires, and can be revoked, how auth behaves when the accounts API is unavailable, and which photo operations that session gates.

Error codes below are named as tRPC codes, since that is the transport. `UNAUTHORIZED` surfaces as HTTP 401, `NOT_FOUND` as 404, and `BAD_REQUEST` as 400.

## Requirements

### Requirement: Reads are public and writes require an admin session

Every photo read operation SHALL be available to anonymous callers with no account, no session, and no credentials of any kind. Every photo write operation — reserving an upload, finalizing an upload, updating a photo's title or keywords, and deleting a photo — SHALL require a valid admin session. A write request without a valid session SHALL be rejected with `UNAUTHORIZED` and SHALL NOT modify any stored data or object.

#### Scenario: Anonymous caller reads photos

- **WHEN** a caller with no session cookie requests the photo listing, a single photo, or the keyword vocabulary
- **THEN** the request succeeds and returns the requested data

#### Scenario: Anonymous caller attempts a write

- **WHEN** a caller with no session cookie attempts to reserve an upload, finalize an upload, update a photo, or delete a photo
- **THEN** the request is rejected with `UNAUTHORIZED`, no database document is created, updated, or removed, and no stored object is written or deleted

#### Scenario: Expired session attempts a write

- **WHEN** a caller presents a session whose expiry has passed and attempts any write operation
- **THEN** the request is rejected with `UNAUTHORIZED` and the operation does not take effect

#### Scenario: Forged session attempts a write

- **WHEN** a caller presents a session cookie that the accounts API did not issue, or whose value has been altered
- **THEN** the request is rejected with `UNAUTHORIZED` and the operation does not take effect

### Requirement: Only admin accounts can hold a session

Who may sign in and who is an administrator SHALL be decided by the dmbk accounts API, not by this application: the API verifies the Google ID token and reports whether the account is an admin. This application SHALL establish a session only for an account the API reports as an admin. When a sign-in succeeds at the API for an account that is not an admin, this application SHALL NOT establish a session, SHALL revoke the session the API issued, and SHALL report that the account is not permitted. Every write path SHALL re-ask the API whether the session is still an admin's on every request, without caching the answer, so that revoking a session or removing an account's admin status denies its outstanding sessions at the next request rather than letting them run to expiry.

#### Scenario: Admin account signs in

- **WHEN** a visitor completes Google sign-in with an account the accounts API reports as an admin
- **THEN** a session is established and admin writes become possible

#### Scenario: Non-admin account is refused

- **WHEN** a visitor completes Google sign-in with an account the accounts API admits but does not report as an admin
- **THEN** no session is established here, the API session it issued is revoked, and the sign-in surface reports that the account is not permitted

#### Scenario: Account the API refuses

- **WHEN** the accounts API refuses a Google ID token, because it is invalid, expired, issued for another client, or belongs to an account not allowed to sign in
- **THEN** no session is established and the sign-in surface reports that sign-in failed, without saying which check failed

#### Scenario: Admin status removed

- **WHEN** an account holding an unexpired session stops being an admin at the accounts API and then attempts a write
- **THEN** the write is rejected with `UNAUTHORIZED` rather than honored until the session expires

### Requirement: Sessions are carried in an HTTP-only cookie and are revocable

A successful sign-in SHALL establish a session carried in a cookie on this application's own domain that is HTTP-only, `SameSite=Lax`, and marked `Secure` whenever the deployment is served over HTTPS. The cookie SHALL hold the session token the accounts API issued; that token SHALL NOT be readable by client-side scripts or returned to them in any response. The session SHALL have a bounded lifetime and SHALL cease to authorize writes once it elapses. Session state SHALL be held by the accounts API so that an individual session can be revoked before its expiry, and a revoked session SHALL stop authorizing writes immediately rather than at expiry.

#### Scenario: Session cookie is set on successful sign-in

- **WHEN** an admin's sign-in succeeds
- **THEN** the response sets an HTTP-only, `SameSite=Lax` session cookie with a bounded expiry, and the response body does not contain the token

#### Scenario: Session cookie is not script-readable

- **WHEN** a page in the browser attempts to read the session cookie from client-side JavaScript
- **THEN** the cookie is not exposed to that script

#### Scenario: Session survives across requests

- **WHEN** a caller holding a valid session makes a subsequent write request
- **THEN** the request is authorized without signing in again

#### Scenario: Revoked session stops working immediately

- **WHEN** a session is revoked at the accounts API and the holder attempts a write before that session would have expired
- **THEN** the write is rejected with `UNAUTHORIZED`

#### Scenario: Stale cookie is cleared

- **WHEN** a caller presents a cookie whose session has ended, been revoked, or no longer belongs to an admin, and requests the session state
- **THEN** the response reports no session and clears the cookie

### Requirement: Session state can be inspected and ended

The system SHALL expose the current session state to the caller, reporting whether a valid admin session exists and, when it does, the account's email and display name. It SHALL never report any other account's session and SHALL never disclose who else is an admin. The system SHALL also expose a sign-out operation that revokes the session at the accounts API and clears its cookie, after which subsequent write requests from that caller are unauthorized. Signing out SHALL succeed even when no session is present, and SHALL clear the cookie even when the accounts API cannot be reached.

#### Scenario: Session is reported while signed in

- **WHEN** a caller holding a valid session requests the session state
- **THEN** the response reports an authenticated session and the account's email

#### Scenario: Session is reported while signed out

- **WHEN** a caller with no session requests the session state
- **THEN** the response reports no authenticated session, as a normal result rather than an error

#### Scenario: Sign-out ends the session

- **WHEN** a signed-in caller signs out and then attempts a write operation
- **THEN** the session is revoked, its cookie cleared, and the write is rejected with `UNAUTHORIZED`

#### Scenario: Sign-out without a session

- **WHEN** a caller with no session signs out
- **THEN** the request succeeds without error

### Requirement: Admin auth fails closed when the accounts service is unavailable

When the accounts API cannot be reached or answers with something unusable, the system SHALL treat every request as having no admin session: every write SHALL be rejected with `UNAUTHORIZED` and every read SHALL be served as public. The session-state operation SHALL report the condition as unavailable rather than as signed out, so the sign-in surface can say so. When the Google client ID is not configured, the sign-in surface SHALL say that sign-in is not configured rather than rendering nothing. Failures SHALL be logged server-side with enough detail to identify the cause, and errors returned to callers SHALL NOT disclose configuration. A missing photo-related configuration SHALL fail at the point of use, so that unrelated routes in the application continue to serve.

#### Scenario: Accounts API is unreachable

- **WHEN** the accounts API cannot be reached and a caller holding a session cookie attempts a write
- **THEN** the write is rejected with `UNAUTHORIZED` and the cause is logged server-side

#### Scenario: Google client ID is unconfigured

- **WHEN** the deployment has no Google client ID and a visitor opens `/admin`
- **THEN** the sign-in surface states that sign-in is not configured, and no admin function is reachable

#### Scenario: Missing configuration does not break the gallery

- **WHEN** auth configuration is absent, or the accounts API is down
- **THEN** the public gallery continues to render normally

### Requirement: The admin section presents Google sign-in when there is no session

Visiting `/admin` without a valid admin session SHALL present a sign-in surface offering Google sign-in, rather than an error, a blank page, or a redirect away from the site. Signing in from this surface SHALL go through the accounts API under the same rules as any other sign-in. A failed or refused sign-in SHALL be reported on the surface and SHALL leave it usable for another attempt.

#### Scenario: Anonymous visitor opens the admin root

- **WHEN** a visitor with no session navigates to `/admin`
- **THEN** a sign-in surface is shown offering Google sign-in, and no admin function is reachable

#### Scenario: Google sign-in cannot load

- **WHEN** Google's sign-in script is blocked or fails to load
- **THEN** the surface says so plainly instead of appearing broken or silently doing nothing

#### Scenario: Non-admin account signs in

- **WHEN** a visitor completes Google sign-in with an account that is not an admin
- **THEN** no session is established, the sign-in surface reports that the account is not permitted, and no admin route becomes reachable

### Requirement: Every route beneath /admin requires a session

Every route beneath `/admin` SHALL require a valid admin session. A request for such a route without a session SHALL present the sign-in surface instead of the route's own content, and SHALL NOT disclose data the route would have shown. This SHALL hold for a link followed directly and for a URL typed or pasted into the address bar, not only for in-app navigation.

#### Scenario: Deep link without a session

- **WHEN** a visitor with no session opens `/admin/upload` or `/admin/photos/<id>` directly
- **THEN** the sign-in surface is presented and none of that route's content is shown

#### Scenario: Session expires while the page is open

- **WHEN** an administrator's session ends and they then attempt an admin action
- **THEN** the action is refused and the sign-in surface becomes reachable again, rather than the failure appearing as an unexplained error

#### Scenario: Signed-in visitor opens an admin route

- **WHEN** an administrator with a valid session opens an admin route
- **THEN** that route's own content is shown without a further sign-in step

### Requirement: A signed-in visitor is taken onward from the admin root

`/admin` SHALL serve as the entry point rather than a destination: once a valid session exists, a visitor arriving at `/admin` SHALL be taken to the upload screen instead of being left on a sign-in surface with nothing to do. This SHALL apply both to arriving with an existing session and to completing a sign-in.

#### Scenario: Sign-in completes

- **WHEN** an admin account completes sign-in at `/admin`
- **THEN** the visitor is taken to the upload screen without a further click

#### Scenario: Returning with a live session

- **WHEN** an administrator with an unexpired session navigates to `/admin`
- **THEN** they are taken to the upload screen rather than asked to sign in again

### Requirement: An administrator can sign out from the admin section

The admin section SHALL offer a sign-out control from any of its routes. Signing out SHALL end the session, and the section SHALL then present the sign-in surface again. After signing out, admin routes SHALL be unreachable until a new sign-in.

#### Scenario: Signing out

- **WHEN** an administrator signs out from an admin route
- **THEN** the session ends and the sign-in surface is presented

#### Scenario: Admin routes after signing out

- **WHEN** a visitor who has just signed out opens an admin route
- **THEN** the sign-in surface is presented rather than that route's content

### Requirement: Gating the admin section does not gate the gallery

Requiring a session for `/admin` SHALL NOT make the public gallery require one. The gallery and its reads SHALL remain available with no account, no session, and no sign-in prompt, whether or not an admin session happens to exist, and whether or not the accounts API is reachable.

#### Scenario: Anonymous visitor browses the gallery

- **WHEN** a visitor with no account and no session opens the gallery, filters it, and opens photos
- **THEN** every view renders normally with no sign-in prompt

#### Scenario: Public photo reads stay anonymous

- **WHEN** a visitor with no session requests the public photo listing, a single photo, or the keyword vocabulary
- **THEN** the request succeeds exactly as it does for any other anonymous caller

#### Scenario: Signed-in administrator browses public pages

- **WHEN** an administrator holding a session views a public page
- **THEN** the page renders the same content an anonymous visitor sees
