# design-system Specification

## Purpose

Gives the whole app — the public gallery and the admin — one component system and one theme, so every screen looks and behaves alike. It also keeps the admin's libraries out of what a gallery visitor downloads.

## Requirements

### Requirement: Every screen is built on one component system and theme

Every screen — the gallery, its keyword drawer and fullscreen view, the admin's sign-in surface, shell, upload, library and edit view — SHALL be rendered with the same component system and the same theme, so controls, type, spacing and feedback states look and behave alike everywhere. The theme SHALL be monochrome: primary and brand colours black (white in dark mode), and status colours told apart by lightness rather than hue, so the photographs are the only colour on the page. Its corners SHALL be square. Every text role SHALL be set in ABCAreal, self-hosted by the app, so no visitor's browser contacts a font CDN.

#### Scenario: Screens share one look

- **WHEN** a visitor or administrator moves between the gallery and the admin screens
- **THEN** buttons, fields, alerts and headings are styled consistently on each

#### Scenario: Type is ABCAreal

- **WHEN** any screen renders
- **THEN** its headings, body text and controls are set in ABCAreal, loaded from the app's own origin

#### Scenario: Controls are monochrome and square

- **WHEN** any screen renders a primary button, a selected keyword or an alert
- **THEN** it uses the theme's neutral black or white, with square corners

### Requirement: The gallery loads none of the admin's libraries

No gallery route SHALL load the admin's data client, its session state library, or the upload screen's drop-area library, whether directly or through a shared bundle.

#### Scenario: Gallery carries no admin JavaScript

- **WHEN** a visitor loads the gallery
- **THEN** none of the scripts served to it include the admin's data client, session state or drop-area libraries

### Requirement: Every screen is styled from its first paint

Every screen SHALL be fully styled, in the colour mode it will settle on, in the first paint the browser makes, rather than appearing unstyled — or in the other colour mode — until client-side code has run.

#### Scenario: Full page load

- **WHEN** a visitor loads any URL directly
- **THEN** the page is styled before hydration completes, with no flash of unstyled controls

#### Scenario: Dark system on a full page load

- **WHEN** a visitor whose system is set to dark loads any URL directly
- **THEN** the first paint is already dark, with no flash of the light theme

### Requirement: Responsive components respond to the viewport

Components that change layout at a viewport breakpoint SHALL do so at the breakpoints the theme defines, rather than rendering at their narrowest variant on every screen.

#### Scenario: Wide viewport

- **WHEN** an administrator opens the library on a desktop-width viewport
- **THEN** responsive components render their wide-viewport layout, not the narrow one

### Requirement: The app follows the system colour mode

Every screen SHALL render in light or dark mode to match the visitor's system preference, and SHALL switch when that preference changes while a page is open. The whole visible canvas, including overscroll areas, SHALL take the active mode's page colour.

#### Scenario: Dark system preference

- **WHEN** a visitor with a dark system preference opens any screen
- **THEN** it renders in dark mode, including native controls and scrollbars

#### Scenario: Preference changes while open

- **WHEN** the system preference changes from light to dark while a page is open
- **THEN** the page switches to dark without a reload

#### Scenario: Canvas matches the theme

- **WHEN** a visitor overscrolls a page in dark mode
- **THEN** the area revealed is the dark page colour, not white

#### Scenario: Preference unavailable

- **WHEN** the browser cannot report a colour-scheme preference
- **THEN** the app renders in light mode

### Requirement: The admin shell spans the viewport

Once signed in, every admin screen SHALL show a header spanning the full width of the viewport. The header SHALL carry the admin's title, a link to the public gallery that opens in a new tab, the signed-in administrator's email, a sign-out control, and the admin's sections (Upload and Library) as tabs. The tab for the section the current URL belongs to SHALL be marked selected, and choosing a tab SHALL navigate to that section's URL without a full page reload. Page content SHALL sit under the header inside the same horizontal gutter, and SHALL NOT be confined to a fixed-width centred column by the shell. Individual screens MAY limit their own content to a readable width.

#### Scenario: Header is full width

- **WHEN** an administrator opens any signed-in admin screen on a viewport wider than 1600px
- **THEN** the header's content and its bottom rule reach the viewport's side gutters rather than stopping at a centred column

#### Scenario: Selected section follows the URL

- **WHEN** an administrator is on a photo's edit view
- **THEN** the Library tab is marked selected

#### Scenario: Switching sections

- **WHEN** an administrator chooses the Upload tab from the library
- **THEN** the upload screen is shown at its URL without a full page reload or a repeat of the session check

#### Scenario: View gallery

- **WHEN** an administrator chooses the link to the public gallery
- **THEN** the gallery opens in a new tab and the admin stays open

#### Scenario: Pre-session screens are unaffected

- **WHEN** a visitor without a session opens any admin URL
- **THEN** the sign-in surface is shown centred without the header or tabs
