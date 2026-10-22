# photo-gallery-ui Specification

## Purpose
Defines the public photo gallery: where it is served, how photos are laid out as a masonry that preserves each image's aspect ratio, how the view stays responsive as the library grows past what a page can hold, how a visitor narrows the gallery by keyword, how a photo opens to fullscreen, and which parts of that state are addressable in the URL so a view can be shared and the back button behaves.

## Requirements

### Requirement: The gallery is served at the root of photo.dmbk.io

The app SHALL serve the public photo gallery at `/` on `photo.dmbk.io`. It SHALL be reachable by anyone who requests that address, with no session and no credentials. The gallery's former address, `/photos`, SHALL redirect permanently to `/`, keeping its query string, so a link shared before the gallery moved here opens the same view.

#### Scenario: The gallery loads anonymously

- **WHEN** a visitor with no session requests `/`
- **THEN** the gallery is served

#### Scenario: Former path forwards

- **WHEN** a visitor requests `/photos?k=film&p=<id>`
- **THEN** they are redirected permanently to `/?k=film&p=<id>`, and the gallery opens filtered to `film` with that photo open

### Requirement: The gallery shows only publicly visible photos

The gallery SHALL display exactly the set of photos the public read contract exposes — those that are `ready` and not hidden — and SHALL NOT display a photo in any other state. Hiding a photo SHALL remove it from the gallery, and unhiding SHALL restore it, without any further action. An empty library SHALL be presented as an empty gallery rather than as an error or an indefinite loading state.

#### Scenario: Only ready, visible photos appear

- **WHEN** the library holds `ready`, `pending`, `failed`, and hidden photos
- **THEN** the gallery shows only the `ready`, non-hidden ones

#### Scenario: Hiding removes a photo from the gallery

- **WHEN** a photo shown in the gallery is hidden and the gallery is loaded again
- **THEN** that photo is absent

#### Scenario: Empty library

- **WHEN** no publicly visible photo exists
- **THEN** the gallery presents an empty state rather than an error or a spinner that never resolves

#### Scenario: Newest photos come first

- **WHEN** the gallery loads
- **THEN** photos are presented newest first, in the same order the public listing defines

### Requirement: Photos are laid out as a masonry whose column count follows the viewport

Photos SHALL be laid out in vertical columns of varying tile height, each tile preserving its photo's intrinsic aspect ratio, and SHALL be distributed so that column heights stay approximately balanced rather than filling one column before starting the next. The number of columns SHALL be 2 below 765px of viewport width, 3 from 765px, and 8 from 1040px.

Because every publicly visible photo carries its intrinsic pixel dimensions, a tile's height SHALL be determined before its image data loads, so the layout SHALL NOT shift as images arrive. When the viewport crosses a breakpoint, the layout SHALL be recomputed for the new column count without discarding photos already loaded.

#### Scenario: Two columns on a narrow viewport

- **WHEN** a visitor views the gallery at a viewport narrower than 765px
- **THEN** photos are laid out in 2 columns

#### Scenario: Three columns at medium width

- **WHEN** a visitor views the gallery at a viewport between 765px and 1040px
- **THEN** photos are laid out in 3 columns

#### Scenario: Eight columns at large width

- **WHEN** a visitor views the gallery at a viewport of 1040px or wider
- **THEN** photos are laid out in 8 columns

#### Scenario: Aspect ratio is preserved

- **WHEN** the gallery shows a portrait photo and a landscape photo
- **THEN** each tile's height relative to its width matches its photo's intrinsic dimensions, and neither image is stretched or cropped

#### Scenario: Layout does not shift as images load

- **WHEN** the gallery renders before any image data has arrived
- **THEN** each tile already occupies its final height, and no tile moves once its image loads

#### Scenario: Columns stay balanced

- **WHEN** the gallery lays out photos of varying heights
- **THEN** the columns end at approximately the same height rather than one column being filled before the next is started

#### Scenario: Crossing a breakpoint relays out

- **WHEN** a visitor resizes the viewport across a breakpoint
- **THEN** the gallery is laid out with the new column count, and photos already loaded remain loaded

### Requirement: Rendering is virtualized so the page stays responsive as the library grows

The gallery SHALL render only the tiles near the visible region plus a margin beyond it, rather than every loaded photo, so that the amount of rendered content is bounded by the viewport rather than by the number of photos loaded. Tiles scrolled far out of view SHALL be released, and SHALL be restored in their original positions when scrolled back to. The scrollable area SHALL reflect the full height of all loaded photos, so the scrollbar represents the whole loaded set and not just the rendered window.

Virtualization SHALL NOT be observable as missing content: scrolling at any speed SHALL arrive at photos rather than at gaps, and a photo's position SHALL NOT change because it was released and restored.

#### Scenario: Rendered tiles are bounded by the viewport

- **WHEN** several hundred photos have been loaded
- **THEN** the number of rendered tiles is proportional to the viewport rather than to the number loaded

#### Scenario: Offscreen tiles are released and restored

- **WHEN** a visitor scrolls far past a photo and then scrolls back to it
- **THEN** that photo is shown again in the same position it occupied before

#### Scenario: Scroll extent covers the whole loaded set

- **WHEN** photos have been loaded beyond the visible region
- **THEN** the scrollable height accounts for all of them, so the scrollbar reflects the full loaded set

#### Scenario: Fast scrolling does not reveal gaps

- **WHEN** a visitor scrolls rapidly through the gallery
- **THEN** photos are presented throughout rather than blank regions where tiles have not been rendered

### Requirement: Photos load a page at a time as the visitor scrolls

The gallery SHALL load photos in pages using the cursor-paginated public listing, beginning with a first page and requesting the next page as the visitor approaches the end of what has been loaded. Pages SHALL accumulate into one continuous gallery rather than replacing one another. Each photo SHALL appear exactly once across all loaded pages against an unchanging library. Requests SHALL NOT be issued for a page already loaded or in flight.

When the listing reports no further page, the gallery SHALL stop requesting and SHALL clear its loading state rather than showing one indefinitely. It SHALL NOT display an end-of-gallery notice — the gallery simply ends. A failed page request SHALL leave already-loaded photos in place, SHALL be surfaced to the visitor, and SHALL be retryable without reloading the page.

#### Scenario: Scrolling loads the next page

- **WHEN** a visitor scrolls toward the end of the loaded photos and a further page exists
- **THEN** the next page is requested and its photos are appended to the gallery

#### Scenario: Pages accumulate

- **WHEN** three pages have been loaded
- **THEN** all photos from all three are present in one continuous gallery

#### Scenario: No photo is loaded twice

- **WHEN** a visitor scrolls from the first page to the last against an unchanging library
- **THEN** every matching photo appears exactly once

#### Scenario: Duplicate requests are not issued

- **WHEN** a visitor scrolls back and forth across the point that triggers loading
- **THEN** a page already loaded or already in flight is not requested again

#### Scenario: End of the library

- **WHEN** the visitor reaches the end and the listing reports no further page
- **THEN** no further request is made and the loading state ends, the gallery simply ending rather than showing a perpetual loading state or a trailing end-of-gallery notice

#### Scenario: A page request fails

- **WHEN** a request for the next page fails
- **THEN** the photos already loaded remain visible, the failure is surfaced, and the visitor can retry without reloading the page

### Requirement: A keyword panel opens over the gallery and filters it

The gallery SHALL offer a keyword panel that is closed by default at every viewport width and is opened by an always-available control. When open, the panel SHALL overlay the gallery rather than displacing it, so that opening or closing it SHALL NOT change the gallery's column count or the visitor's scroll position. The panel SHALL be dismissible by its own control, by the Escape key, and by activating the area outside it.

The panel SHALL list the public keyword vocabulary, each keyword with its display label and its count of publicly visible photos, in the order the vocabulary defines. Selecting keywords SHALL narrow the gallery to photos carrying **every** selected keyword. Selections SHALL be individually removable, and the panel SHALL offer a way to clear all of them at once. Which keywords are selected SHALL be visible in the panel and SHALL remain so while it is closed.

Changing the selection SHALL reset the gallery to the first page of the new filter, discarding photos loaded under the previous one, and paging SHALL continue within that filter. A selection matching no photos SHALL produce an empty gallery presented as a normal result rather than an error.

#### Scenario: Panel starts closed and opens on demand

- **WHEN** a visitor loads the gallery
- **THEN** the keyword panel is closed, and a control to open it is available

#### Scenario: Opening the panel does not disturb the gallery

- **WHEN** a visitor scrolls partway down the gallery and opens the keyword panel
- **THEN** the panel overlays the gallery, and the gallery's column count and scroll position are unchanged

#### Scenario: Panel is dismissible

- **WHEN** a visitor presses Escape, activates the close control, or activates the area outside the open panel
- **THEN** the panel closes

#### Scenario: Keywords are listed with counts

- **WHEN** a visitor opens the keyword panel
- **THEN** each keyword in the public vocabulary is listed with its display label and its count of publicly visible photos

#### Scenario: Selecting one keyword narrows the gallery

- **WHEN** a visitor selects `film`
- **THEN** the gallery shows only publicly visible photos carrying `film`

#### Scenario: Multiple keywords require all of them

- **WHEN** a visitor selects both `film` and `harbor`
- **THEN** the gallery shows only photos carrying both, and a photo carrying just one is excluded

#### Scenario: Selection is reflected while the panel is closed

- **WHEN** a visitor selects keywords and closes the panel
- **THEN** the gallery indicates that a filter is active and which keywords it is filtering by

#### Scenario: Clearing the selection

- **WHEN** a visitor clears all selected keywords
- **THEN** the gallery shows all publicly visible photos again

#### Scenario: Changing the filter restarts paging

- **WHEN** a visitor has loaded several pages and then changes the keyword selection
- **THEN** the gallery shows the first page of the new filter, and further scrolling pages through that filter

#### Scenario: A filter matching nothing

- **WHEN** a visitor selects a combination of keywords no photo carries
- **THEN** the gallery presents an empty result as a normal state rather than an error

### Requirement: A photo opens to a fullscreen slideshow

Activating a photo in the gallery SHALL open it fullscreen, showing the display variant rather than the thumbnail, sized to fit the viewport without cropping. The slideshow SHALL advance to the next and previous photo in the gallery's current order, by on-screen controls, by the left and right arrow keys, and by horizontal swipe on a touch device. It SHALL close on Escape and on its close control, returning the visitor to the gallery at the scroll position they left, with the photo they were viewing in view.

The slideshow SHALL operate over the gallery's currently loaded and filtered set. Advancing past the last loaded photo while a further page exists SHALL load that page and continue, so the slideshow is not capped at the photos loaded when it was opened. While the slideshow is open, the page behind it SHALL NOT scroll.

#### Scenario: Activating a photo opens it fullscreen

- **WHEN** a visitor activates a photo in the gallery
- **THEN** that photo is shown fullscreen at its display variant, fitted to the viewport without cropping

#### Scenario: Advancing with controls and keys

- **WHEN** a visitor activates the next control or presses the right arrow key
- **THEN** the following photo in the gallery's current order is shown, and the previous control and left arrow key move back

#### Scenario: Swipe navigation on touch

- **WHEN** a visitor swipes horizontally on a touch device
- **THEN** the slideshow moves to the adjacent photo in the swipe's direction

#### Scenario: Closing returns to the gallery in place

- **WHEN** a visitor closes the slideshow
- **THEN** the gallery is shown at the scroll position it had, with the photo that was open in view

#### Scenario: The slideshow respects the active filter

- **WHEN** a visitor has filtered the gallery by keyword and opens a photo
- **THEN** advancing moves only between photos matching that filter

#### Scenario: Advancing past the loaded set loads more

- **WHEN** a visitor advances past the last loaded photo and a further page exists
- **THEN** that page is loaded and the slideshow continues into it

#### Scenario: The last photo with no further page

- **WHEN** a visitor advances from the last photo and no further page exists
- **THEN** the slideshow remains on a photo rather than showing a blank or broken frame

#### Scenario: The page behind does not scroll

- **WHEN** the slideshow is open and the visitor scrolls
- **THEN** the gallery behind it does not scroll

### Requirement: The active filter and the open photo are addressable in the URL

The gallery's keyword selection and its open photo SHALL both be reflected in the URL's query string, so that a filtered view and an individual photo are shareable and survive reload. Loading a URL that names keywords SHALL open the gallery already filtered by them; loading one that names a photo SHALL open the gallery with that photo open in the slideshow.

Selecting or clearing keywords, and opening or closing the slideshow, SHALL update the URL. Opening a photo SHALL add a history entry, so the back button closes the slideshow and returns to the gallery rather than leaving the page. A URL naming a keyword that does not exist, or a photo that is not publicly visible, SHALL be handled as a normal empty or unopened result rather than an error page.

#### Scenario: Filtering updates the URL

- **WHEN** a visitor selects the keywords `film` and `harbor`
- **THEN** the URL reflects both keywords

#### Scenario: A filtered URL loads filtered

- **WHEN** a visitor opens a URL naming the keywords `film` and `harbor`
- **THEN** the gallery loads showing only photos carrying both, and the keyword panel shows them as selected

#### Scenario: Opening a photo updates the URL

- **WHEN** a visitor opens a photo in the slideshow
- **THEN** the URL identifies that photo

#### Scenario: A photo URL opens the slideshow

- **WHEN** a visitor opens a URL naming a publicly visible photo
- **THEN** the gallery loads with that photo open in the slideshow

#### Scenario: Back closes the slideshow

- **WHEN** a visitor opens a photo and then presses the browser's back button
- **THEN** the slideshow closes and the gallery remains, rather than the visitor leaving the page

#### Scenario: Reload preserves the view

- **WHEN** a visitor filters by keyword, opens a photo, and reloads the page
- **THEN** the same filter is applied and the same photo is open

#### Scenario: A URL naming an unknown keyword

- **WHEN** a visitor opens a URL naming a keyword no photo carries
- **THEN** the gallery presents an empty result as a normal state rather than an error page

#### Scenario: A URL naming a photo that is not visible

- **WHEN** a visitor opens a URL naming a photo that is hidden, not `ready`, or nonexistent
- **THEN** the gallery loads with no photo open, rather than an error page or an empty slideshow

### Requirement: The gallery is usable by keyboard and assistive technology

Every interactive element of the gallery SHALL be reachable and operable by keyboard: the keyword panel control, each keyword in the panel, each photo tile, and every slideshow control. Each photo SHALL carry a text alternative derived from its title, and an untitled photo SHALL carry an alternative that does not misrepresent it as untitled content. Opening the keyword panel or the slideshow SHALL move focus into it and confine focus to it while open, and closing SHALL return focus to the element that opened it.

Virtualization SHALL NOT trap or lose keyboard focus: moving focus through tiles SHALL scroll the gallery so the focused tile is visible.

#### Scenario: Keyword panel is keyboard operable

- **WHEN** a visitor navigates by keyboard
- **THEN** the panel control can be reached and activated, and each keyword can be reached and selected

#### Scenario: Photos are keyboard activatable

- **WHEN** a visitor moves focus to a photo tile and activates it
- **THEN** the slideshow opens on that photo

#### Scenario: Focus is confined and returned

- **WHEN** a visitor opens the slideshow and then closes it
- **THEN** focus stays within the slideshow while it is open and returns to the tile that opened it once closed

#### Scenario: Photos carry text alternatives

- **WHEN** a photo with a title and a photo without one are presented
- **THEN** each carries a text alternative, the titled one derived from its title

#### Scenario: Focus scrolls the gallery

- **WHEN** a visitor moves focus to a tile outside the visible region
- **THEN** the gallery scrolls so that the focused tile is visible

### Requirement: A tile requests an image resolution matched to the space it occupies

A gallery tile SHALL offer the browser every image variant the photo has, together with the layout width a tile occupies at each of the gallery's column counts, so the browser selects a variant according to the tile's rendered size and the display's pixel ratio. A tile SHALL NOT be pinned to a single variant regardless of how wide it renders.

The variant selected SHALL be at least as wide as the tile renders in device pixels whenever a variant that large exists, so a tile on a high-density display is not filled by an upscaled image. Where no variant is that large — because the photo's own original was not — the largest available SHALL be used rather than the image failing to render.

A photo that is missing a variant SHALL render from the variants it has.

#### Scenario: A wide tile on a dense display

- **WHEN** the gallery renders at its 8-column layout on a display with a device pixel ratio of 2, such that a tile occupies more device pixels than the thumbnail variant contains
- **THEN** the tile is filled by a larger variant rather than by an upscaled thumbnail

#### Scenario: A narrow tile is not over-served

- **WHEN** the gallery renders at its 2-column layout on a narrow, low-density viewport
- **THEN** the tile is filled by the smallest variant that covers its rendered size rather than by the largest available

#### Scenario: The photo has no variant large enough

- **WHEN** a tile renders wider than the largest variant a photo has, because the original itself was small
- **THEN** the largest available variant is used and the tile renders normally

#### Scenario: A photo missing a variant

- **WHEN** a photo in the gallery has no grid variant
- **THEN** its tile renders from the variants it does have, in the same position and at the same size as any other tile

#### Scenario: The slideshow is unaffected

- **WHEN** a visitor opens a photo fullscreen
- **THEN** the display variant is shown, as it is today

### Requirement: A tile shows a placeholder until its photo has loaded

From the moment a tile's box is reserved until its image has loaded, the tile SHALL show an animated placeholder filling that box, so a gallery scrolled into fresh territory presents pending content rather than empty boxes. The placeholder SHALL be replaced by the image with no change to the tile's position or size, and SHALL NOT appear for an image the browser already holds complete. It SHALL NOT be animated when the visitor has expressed a preference for reduced motion, and SHALL NOT be announced to assistive technology — a tile's accessible name is unchanged by whether its image has loaded.

A tile whose image fails to load SHALL keep its reserved box, showing a resting placeholder rather than an empty box or an endless animation, and SHALL remain activatable.

The fullscreen slideshow SHALL show the same placeholder while its display image loads, sized to the space that image will occupy.

#### Scenario: Scrolling into fresh photos

- **WHEN** a visitor scrolls into a region whose images have not loaded
- **THEN** each tile shows an animated placeholder at the tile's final size and position

#### Scenario: Placeholder gives way to the photo

- **WHEN** a tile's image finishes loading
- **THEN** the image replaces the placeholder in the same box, and no other tile moves

#### Scenario: Revisiting loaded photos

- **WHEN** a visitor scrolls back to photos whose images the browser already holds
- **THEN** those tiles show their images directly, without a placeholder appearing first

#### Scenario: Reduced motion

- **WHEN** the visitor's system expresses a preference for reduced motion
- **THEN** placeholders are shown without animation and still occupy the full tile

#### Scenario: A tile's image fails

- **WHEN** a tile's image cannot be loaded
- **THEN** the tile keeps its size and position showing a resting placeholder, remains activatable, and the rest of the gallery is unaffected

#### Scenario: Placeholders are not announced

- **WHEN** a screen reader traverses a gallery whose images are still loading
- **THEN** each tile is announced by its own accessible name, with no placeholder announced alongside it

#### Scenario: The slideshow waits visibly

- **WHEN** a visitor opens a photo whose display image has not loaded
- **THEN** a placeholder occupies the space that image will fill until it arrives

### Requirement: The gallery reads from the dmbk GraphQL API

The gallery's first page and keyword vocabulary SHALL be rendered on the server from the dmbk GraphQL API, honoring the keyword filter in the URL. Every later page, filter change and deep-linked photo SHALL be requested by the browser from the dmbk GraphQL API directly, without a session. The gallery SHALL request the public view explicitly (visible, `ready` photos only) so that a visitor who also holds an admin session elsewhere sees the same set as everyone else.

#### Scenario: Filtered link arrives filtered

- **WHEN** a visitor opens `/?k=film`
- **THEN** the first page rendered by the server already contains only photos keyworded `film`, without a further request after hydration

#### Scenario: Scrolling continues from the server's page

- **WHEN** a visitor scrolls past the first page
- **THEN** the browser requests the next page from the dmbk GraphQL API starting after the server-rendered page's end cursor, and no photo is repeated or skipped

#### Scenario: Deep link to a photo outside the loaded pages

- **WHEN** a visitor opens a link naming a `ready`, visible photo that is not in the first page
- **THEN** that photo is fetched from the dmbk GraphQL API and opens in the slideshow; a hidden, non-`ready` or unknown photo resolves to nothing rather than an error

### Requirement: Photo URLs keep carrying the photo's UUID

The gallery's URLs SHALL identify a photo by its UUID, as they did before reads moved to the dmbk GraphQL API, even though the API identifies photos by global ID. A link shared before this change SHALL open the same photo after it.

#### Scenario: Old shared link still opens

- **WHEN** a visitor opens a gallery link whose photo parameter is a UUID copied before this change
- **THEN** that photo opens in the slideshow

#### Scenario: New links use the UUID

- **WHEN** a visitor opens a photo and copies the URL
- **THEN** the photo parameter in it is the photo's UUID, not its global ID
