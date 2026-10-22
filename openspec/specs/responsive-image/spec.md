# responsive-image Specification

## Purpose

Defines the app's shared image primitive: how any surface renders a raster image so that it reserves its layout space before loading, requests a resolution appropriate to the space it occupies, defers work that is off screen, and shows a placeholder rather than a void while the bytes are in flight. Also defines the placeholder itself as a primitive that other surfaces can use on their own.

## Requirements

### Requirement: An image reserves its layout space before it loads

The image primitive SHALL accept the image's intrinsic pixel width and height and SHALL occupy a box of that aspect ratio from its first render, before any image data has been requested. Layout SHALL NOT shift when the image arrives. When intrinsic dimensions are not supplied, the primitive SHALL still render the image rather than failing, but SHALL NOT claim to reserve space for it.

#### Scenario: Space is held before the image arrives

- **WHEN** the primitive renders with intrinsic dimensions and no image data has loaded
- **THEN** it occupies a box at the intrinsic aspect ratio, and content below it sits at its final position

#### Scenario: Nothing moves when the image loads

- **WHEN** the image data arrives
- **THEN** the surrounding layout is unchanged from before it arrived

#### Scenario: Dimensions are unknown

- **WHEN** the primitive renders without intrinsic dimensions
- **THEN** the image is still displayed, and the caller is responsible for any space it needs

### Requirement: A placeholder is shown until the image is ready

While an image has not yet finished loading, the primitive SHALL display a placeholder occupying exactly the reserved box. The placeholder SHALL be removed once the image has loaded, and the transition SHALL NOT move any surrounding content. An image that is already complete when the primitive renders — a cached image, or one restored from a previous render — SHALL NOT flash a placeholder.

The placeholder SHALL be animated to read as pending rather than as a permanent empty state, and SHALL NOT be announced to assistive technology as content.

#### Scenario: Placeholder covers the wait

- **WHEN** the primitive renders and the image has not loaded
- **THEN** the placeholder is shown in the reserved box

#### Scenario: Placeholder is replaced

- **WHEN** the image finishes loading
- **THEN** the placeholder is removed, the image is shown in the same box, and nothing around it moves

#### Scenario: A cached image does not flash

- **WHEN** the primitive renders an image the browser already holds complete
- **THEN** the image is shown without the placeholder appearing first

#### Scenario: Placeholder is not content

- **WHEN** a screen reader traverses a surface whose images are still loading
- **THEN** the placeholders are not announced, and each image's own text alternative is what is announced

### Requirement: A failed image leaves the box occupied rather than empty

When the image cannot be loaded, the primitive SHALL leave its reserved box occupied by a resting placeholder that is not animated, rather than collapsing the box or showing an animation that never ends. The failure SHALL NOT be reported as an error to the visitor, and SHALL NOT prevent the rest of the surface from rendering.

#### Scenario: Image fails to load

- **WHEN** the image source cannot be fetched
- **THEN** the box stays at its reserved size showing a resting placeholder, and no animation continues indefinitely

#### Scenario: One failure does not break the surface

- **WHEN** one image among many fails to load
- **THEN** every other image on the surface loads and displays normally

### Requirement: The browser selects a resolution from a supplied set of variants

The primitive SHALL accept more than one source for the same image, each with the pixel width at which it is stored, together with a description of how much layout width the image will occupy at each viewport size. The browser SHALL be given what it needs to choose among those sources according to the rendered size and the device's pixel ratio, so that a high-density display is not served an image it must upscale and a small viewport is not served an image far larger than it can show.

A variant that does not exist for a given image SHALL be omitted from the set rather than offered as a broken source, and the primitive SHALL remain usable with a single source.

#### Scenario: A dense display gets a larger variant

- **WHEN** an image occupying 300 layout pixels of width is rendered on a display with a device pixel ratio of 2, and variants both smaller and larger than 600 pixels are offered
- **THEN** the browser is able to select a variant of at least the rendered pixel width rather than being forced to upscale a smaller one

#### Scenario: A small viewport is not over-served

- **WHEN** the same image is rendered in a narrow column on a low-density display
- **THEN** the browser is able to select the smallest variant that covers the rendered size

#### Scenario: A missing variant is skipped

- **WHEN** one of an image's variants has not been generated
- **THEN** it is absent from the set offered, and the remaining variants are still selectable

#### Scenario: A single source still works

- **WHEN** only one source is supplied
- **THEN** the image renders from it, with space reservation and the placeholder behaving as they do for a multi-variant image

### Requirement: Images outside the viewport are deferred

The primitive SHALL default to deferring the loading of images that are not near the viewport, and SHALL allow a caller to opt a specific image out of that deferral for an image known to be visible immediately. Decoding SHALL be performed off the main thread where the browser supports it, so that a batch of images arriving at once does not block interaction.

#### Scenario: Below-the-fold images wait

- **WHEN** a surface renders many images and most are far below the viewport
- **THEN** only those near the viewport are requested

#### Scenario: A known-visible image is not deferred

- **WHEN** a caller marks an image as immediately visible
- **THEN** that image is requested without waiting to approach the viewport

#### Scenario: Arriving images do not block interaction

- **WHEN** several images finish downloading at the same moment
- **THEN** the page remains responsive to input while they are decoded

### Requirement: The placeholder is available on its own

The placeholder SHALL also be usable independently of any image, sized by its caller, so a surface can suggest the shape of content that has not yet arrived. Its animation SHALL be disabled when the visitor has expressed a preference for reduced motion, and it SHALL then present as a resting block rather than as nothing at all.

#### Scenario: Placeholder used without an image

- **WHEN** a caller renders the placeholder with a width and a height
- **THEN** a placeholder of that size is shown

#### Scenario: Reduced motion is respected

- **WHEN** the visitor's system expresses a preference for reduced motion
- **THEN** the placeholder is shown without animation, still occupying its full size

### Requirement: The primitive is independent of any content source

The primitive SHALL be defined in terms of sources, dimensions, and text alternatives only. It SHALL NOT depend on the shape of any particular content source, and adopting it on a new surface SHALL NOT require changing it.

#### Scenario: Two unrelated surfaces use the same primitive

- **WHEN** one surface renders images from the photo library and another renders images from an unrelated content source
- **THEN** both use the same primitive without either passing source-specific structures to it

#### Scenario: Text alternative is the caller's to supply

- **WHEN** a caller renders an image
- **THEN** the text alternative it supplies is the one presented to assistive technology, with the primitive adding none of its own
