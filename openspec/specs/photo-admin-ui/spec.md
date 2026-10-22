# photo-admin-ui Specification

## Purpose

Defines what an administrator can actually do with the photo library through a screen: choosing and uploading one or more image files, what is shown while an upload runs and when it fails, where the upload leaves them, loading an existing photo by the identifier in the URL, and saving changes to its title and keywords.

## Requirements

### Requirement: An administrator can upload a photo by choosing a file

The upload screen SHALL let an administrator choose between one and ten image files from their device and submit them together. It SHALL accept the same formats the library accepts — JPEG, PNG, WebP, and AVIF — and SHALL offer an optional keyword field that applies to every photo in the batch. A title SHALL be offered when exactly one file is chosen and SHALL NOT be offered for several, since titles rarely repeat across a batch and are editable per photo afterwards. Neither a title nor keywords SHALL be required to upload. Image bytes SHALL be sent from the browser directly to object storage rather than through the application, so an original larger than the application's request body limit uploads successfully.

Choosing more than ten files SHALL be refused before anything is uploaded, naming how many were chosen and what the limit is, and SHALL leave no photo record behind.

#### Scenario: Uploading with metadata

- **WHEN** an administrator chooses a single JPEG, enters a title and some keywords, and submits
- **THEN** the photo is stored and becomes publicly listable with that title and those keywords

#### Scenario: Uploading a batch with shared keywords

- **WHEN** an administrator chooses several files, enters keywords once, and submits
- **THEN** every photo in the batch is stored carrying those keywords

#### Scenario: No title field for a batch

- **WHEN** an administrator has chosen more than one file
- **THEN** no title field is offered, and the keyword field applies to the whole batch

#### Scenario: Uploading without metadata

- **WHEN** an administrator chooses files and submits with the metadata fields left empty
- **THEN** the uploads succeed and the photos have no title and no keywords

#### Scenario: Large original

- **WHEN** an administrator uploads an original larger than the application's request body limit
- **THEN** the upload succeeds, because the bytes go directly to object storage

#### Scenario: Too many files

- **WHEN** an administrator chooses eleven files
- **THEN** the screen reports that the limit is ten and how many were chosen, nothing is uploaded, and no photo record is created

#### Scenario: Exactly the limit

- **WHEN** an administrator chooses ten files
- **THEN** the batch is accepted and every file is uploaded

#### Scenario: No file chosen

- **WHEN** an administrator submits without having chosen a file
- **THEN** the screen says a file is required and no photo record is created

### Requirement: Files can be dropped onto the upload screen

The upload screen SHALL offer a drop area onto which an administrator can drag image files from their device, and SHALL also let them open the device's file picker from that same area, by click or from the keyboard. A dropped selection SHALL be treated exactly as a chosen one: the same limit on the number of files, the same type and size rejections naming each offending file, the same refusal of a whole selection containing a rejected file, the same previews, and the same upload path. Dropping SHALL replace the current selection rather than add to it, matching what choosing through the picker does.

While files are dragged over it, the drop area SHALL indicate that releasing them will select them. While a batch is uploading, the drop area SHALL NOT accept a new selection, so a drop mid-batch cannot replace the files being uploaded.

#### Scenario: Dropping a single image

- **WHEN** an administrator drags one supported image onto the drop area and releases it
- **THEN** it is previewed and the title field is offered, exactly as if it had been chosen through the picker

#### Scenario: Dropping a batch

- **WHEN** an administrator drops several supported images at once
- **THEN** every one is previewed and no title field is offered

#### Scenario: Dropping too many files

- **WHEN** an administrator drops eleven files
- **THEN** the screen reports that the limit is ten and how many were dropped, nothing is previewed, and no photo record is created

#### Scenario: Dropping an unsupported file among valid ones

- **WHEN** an administrator drops four images and one PDF
- **THEN** the rejection names the PDF, nothing in the selection is previewed or uploaded, and no record is created

#### Scenario: Dropping replaces the selection

- **WHEN** an administrator has a selection and then drops a different set of files
- **THEN** the previews show only the dropped files, and the earlier previews are released

#### Scenario: Opening the picker from the drop area

- **WHEN** an administrator clicks the drop area, or focuses it and presses Enter or Space
- **THEN** the device's file picker opens, limited to the accepted image formats

#### Scenario: Drag-over feedback

- **WHEN** an administrator drags files over the drop area without releasing them
- **THEN** the drop area visibly indicates that releasing will select them, and returns to its resting state if they are dragged away

#### Scenario: Dropping during an upload

- **WHEN** an administrator drops files while a batch is uploading
- **THEN** the drop is ignored and the running batch is unaffected

#### Scenario: Dropping outside the drop area

- **WHEN** an administrator drops a file elsewhere on the upload screen
- **THEN** the browser does not navigate away to open the file, and the selection is unchanged

### Requirement: The upload screen rejects unsupported files before uploading

The screen SHALL reject a file whose type is not among the accepted formats, and one whose size exceeds the library's limit, before any upload is attempted. The rejection SHALL name what was wrong and which file it was wrong about, since with several files chosen an unattributed error cannot be acted on. A rejected file SHALL leave no photo record behind and SHALL NOT consume an upload reservation.

A batch containing a rejected file SHALL be refused as a whole before uploading, rather than silently uploading the acceptable files — the administrator chose those files together and should decide what to do about the bad one.

#### Scenario: Unsupported file type

- **WHEN** an administrator chooses a PDF or a GIF and submits
- **THEN** the screen reports the type is not supported, no upload is attempted, and no record is created

#### Scenario: File over the size limit

- **WHEN** an administrator chooses an image larger than the library's size limit
- **THEN** the screen reports the file is too large, no upload is attempted, and no record is created

#### Scenario: One bad file among several

- **WHEN** an administrator chooses five files of which one is an unsupported type
- **THEN** the rejection names that file, nothing in the batch is uploaded, and no record is created for any of them

#### Scenario: Rejection is recoverable

- **WHEN** a selection has been rejected and the administrator then chooses a valid one
- **THEN** the upload proceeds normally, with no leftover error blocking it

### Requirement: The upload screen previews the chosen image before uploading

Once a file has been chosen and accepted, the upload screen SHALL show a visual preview of it before any upload begins, so an administrator can confirm they picked the intended image. Every file in a batch SHALL be previewed, not merely the first — a batch is chosen in one action and can only be checked if all of it is visible. Choosing a different selection SHALL replace the previews and release the ones it replaces. A file the screen rejected SHALL NOT be previewed, since showing it would suggest it is going to be uploaded.

A preview SHALL NOT outlive its upload as though the photo were still pending. Where a single-file upload completes the screen is left behind entirely; in a batch the image remains beside that file's own outcome, where it identifies which file the row is reporting on rather than suggesting work still to do.

#### Scenario: Choosing a file shows it

- **WHEN** an administrator chooses a supported image within the size limit
- **THEN** a preview of that image is shown before any upload has started

#### Scenario: Every file in a batch is previewed

- **WHEN** an administrator chooses several files at once
- **THEN** each of them is previewed, not only the first

#### Scenario: Choosing a different file replaces the preview

- **WHEN** an administrator chooses one image and then chooses another
- **THEN** the preview shows the second image, not the first

#### Scenario: A rejected file is not previewed

- **WHEN** an administrator chooses a file that is refused for its type or size
- **THEN** no preview is shown alongside the rejection

#### Scenario: Preview is cleared after uploading

- **WHEN** a single-file upload completes successfully
- **THEN** the administrator is no longer on the screen that showed the preview, and returning to it shows none

#### Scenario: A batch keeps each image beside its result

- **WHEN** a batch finishes
- **THEN** each file's image is still shown against that file's own outcome, and choosing a new selection replaces them all

### Requirement: The upload screen reports progress and outcome

While an upload runs the screen SHALL show that it is in progress and SHALL prevent the same upload being submitted twice. On success it SHALL make the outcome unambiguous. On failure it SHALL report that the upload failed, in terms the administrator can act on, and SHALL leave the screen usable for another attempt rather than stuck in a busy state.

#### Scenario: Upload in progress

- **WHEN** an upload is under way
- **THEN** the screen indicates it is working and submitting again does not start a second upload of the same file

#### Scenario: Upload fails partway

- **WHEN** the transfer to object storage fails
- **THEN** the screen reports the failure, is not left in a busy state, and can be used to try again

#### Scenario: Finalization rejects the file

- **WHEN** the uploaded bytes are rejected during finalization — because they do not decode as a supported image
- **THEN** the screen reports that the file was rejected, and the photo does not appear as though it had been published

#### Scenario: Session lost mid-upload

- **WHEN** the administrator's session ends before an upload completes
- **THEN** the screen reports the action was refused rather than appearing to succeed

### Requirement: A completed upload leads to that photo's edit view

On a successful single-file upload the administrator SHALL be taken to the edit view for the photo just created, addressed by its identifier, so that tagging can continue immediately without navigating anywhere by hand. The edit view SHALL show the title and keywords the upload was given.

A multi-file batch SHALL NOT navigate away, because there is no single photo to navigate to and choosing one would hide the rest. It SHALL instead report its results in place, as the batch summary requires.

#### Scenario: Landing after upload

- **WHEN** an upload of one file completes successfully
- **THEN** the administrator is on the edit view for that photo, at a URL carrying its identifier

#### Scenario: Metadata carries across

- **WHEN** a photo was uploaded with a title and keywords
- **THEN** the edit view it lands on shows that title and those keywords rather than empty fields

#### Scenario: The landing URL is shareable

- **WHEN** the administrator copies the URL they landed on and opens it again later
- **THEN** the same photo's edit view loads

#### Scenario: A batch stays put

- **WHEN** an upload of several files completes
- **THEN** the administrator remains on the upload screen with the batch's results shown, rather than being taken to any one photo

### Requirement: A batch reports per-file progress

While a batch is uploading, the screen SHALL show each file's own progress — waiting, uploading, processing, done, or failed — rather than a single indicator for the batch. A batch that appears frozen SHALL be distinguishable from one still working. Submitting again while a batch is running SHALL NOT start a second upload of the same files.

#### Scenario: Progress is per file

- **WHEN** a batch of several files is uploading
- **THEN** each file's row shows its own state, and files that have finished are distinguishable from those still going

#### Scenario: Resubmitting during a batch

- **WHEN** an administrator submits again while a batch is running
- **THEN** no file is uploaded a second time

#### Scenario: The screen recovers after a batch

- **WHEN** a batch finishes, whether every file succeeded or not
- **THEN** the screen is usable for another batch rather than left in a busy state

### Requirement: A batch reports what happened to every file

When a multi-file batch finishes, the screen SHALL report each file individually as succeeded or failed. A failure SHALL name the file and say why it failed, in terms the administrator can act on. A success SHALL offer a way to reach that photo's edit view. The summary SHALL account for every file submitted, so none is silently dropped.

#### Scenario: All files succeed

- **WHEN** a batch of five files uploads successfully
- **THEN** all five are reported as succeeded, each linking to its edit view

#### Scenario: Some files fail

- **WHEN** three of five files fail during upload or finalization
- **THEN** the two successes are reported as succeeded and the three failures are each named with a reason

#### Scenario: Every file is accounted for

- **WHEN** a batch finishes
- **THEN** the number of rows reported equals the number of files submitted

#### Scenario: Session ends mid-batch

- **WHEN** the administrator's session ends partway through a batch
- **THEN** the remaining files are reported as failed with the session as the reason, rather than appearing to succeed

### Requirement: Files in a batch succeed or fail independently

Each file in a batch SHALL be uploaded on its own terms. A file that fails SHALL NOT prevent the others from completing, and SHALL NOT undo those already stored. Photos that uploaded successfully SHALL remain in the library and be publicly listable, whatever happened to the rest of the batch.

#### Scenario: One failure does not discard the rest

- **WHEN** one file in a batch of ten fails during finalization
- **THEN** the other nine are stored and publicly listable

#### Scenario: Successes are not rolled back

- **WHEN** a batch finishes with a mixture of successes and failures
- **THEN** no successfully uploaded photo is removed on account of another file's failure

#### Scenario: Shared keywords apply to what succeeded

- **WHEN** a batch with keywords finishes with some files failed
- **THEN** every photo that succeeded carries those keywords, and the keyword counts reflect only the photos that exist

### Requirement: A photo is loaded for editing by the identifier in the URL

The edit view SHALL take a photo identifier from the URL and load that photo's current title and keywords from the library. An identifier matching no photo SHALL produce a clear not-found message rather than an empty form that appears editable. A malformed identifier SHALL be handled the same way rather than surfacing as an unhandled error. While loading, the view SHALL indicate it is loading rather than showing an empty form.

#### Scenario: Existing photo loads

- **WHEN** an administrator opens the edit view for an existing photo's identifier
- **THEN** that photo's current title and keywords are shown, along with an image preview

#### Scenario: Unknown identifier

- **WHEN** an administrator opens the edit view with an identifier matching no photo
- **THEN** a not-found message is shown and no editable form is offered

#### Scenario: Malformed identifier

- **WHEN** the identifier in the URL is not a well-formed identifier
- **THEN** a not-found message is shown rather than an unhandled error

#### Scenario: Loading state

- **WHEN** the edit view is fetching a photo
- **THEN** it indicates it is loading rather than briefly showing an empty form

### Requirement: An administrator can edit a photo's title and keywords

The edit view SHALL let an administrator change the photo's title, its keywords, or both, and save them. Saving SHALL replace the photo's title and keyword set with what the form shows, so removing a keyword in the form removes it from the photo. Clearing the keyword field entirely SHALL leave the photo with no keywords. Saving SHALL NOT alter the photo's image, its dimensions, or its identifier. After a save the view SHALL show the saved values, not the values from before the edit.

#### Scenario: Editing the title

- **WHEN** an administrator changes the title and saves
- **THEN** the photo's title is updated and its keywords are unchanged

#### Scenario: Removing a keyword

- **WHEN** a photo carries two keywords and the administrator removes one and saves
- **THEN** the photo carries only the remaining keyword

#### Scenario: Clearing all keywords

- **WHEN** an administrator empties the keyword field and saves
- **THEN** the photo carries no keywords

#### Scenario: The image is untouched

- **WHEN** an administrator saves a title change
- **THEN** the photo's image and recorded dimensions are unchanged

#### Scenario: Saved values are reflected

- **WHEN** a save succeeds
- **THEN** the view shows the saved title and keywords, and reloading the page shows the same

### Requirement: The edit view reports save failures without losing the edit

A save that the server refuses — for an over-long title, an over-long keyword, a photo that no longer exists, or an ended session — SHALL be reported in terms naming what was wrong. A failed save SHALL leave the administrator's typed values in the form so the edit is not lost, and SHALL leave the view usable for another attempt.

#### Scenario: Title too long

- **WHEN** an administrator saves a title longer than the library permits
- **THEN** the failure is reported, the typed title remains in the form, and the photo's stored title is unchanged

#### Scenario: Keyword too long

- **WHEN** an administrator saves a keyword that normalizes longer than the library permits
- **THEN** the failure is reported and the photo's stored keywords are unchanged

#### Scenario: Photo deleted elsewhere

- **WHEN** an administrator saves a photo that no longer exists
- **THEN** the failure is reported as the photo not being found

#### Scenario: Edit survives a failure

- **WHEN** a save fails for any reason
- **THEN** the values the administrator typed are still in the form and can be corrected and saved again

### Requirement: Keywords are entered as free text and normalized on save

Keywords SHALL be entered as ordinary text, several at a time, without the administrator having to know about slugs. What is entered SHALL be normalized by the same rules the library applies everywhere, so that entering `Black and White` results in the same keyword as `black and white`, and entering the same keyword twice results in one. After a save the view SHALL show the keywords as the library stored them, so what is displayed matches what was kept.

#### Scenario: Free-text entry

- **WHEN** an administrator enters several keywords as plain text
- **THEN** each becomes a keyword on the photo

#### Scenario: Casing and spacing are normalized

- **WHEN** an administrator enters `Black and White`
- **THEN** the photo carries the same keyword it would have from entering `black and white`

#### Scenario: Duplicates collapse

- **WHEN** an administrator enters the same keyword twice in different casing
- **THEN** the photo carries it once

#### Scenario: Display matches storage

- **WHEN** a save completes
- **THEN** the keywords shown are the normalized ones the library stored, not the raw text as typed

### Requirement: The admin gallery lists every photo with its state

The admin section SHALL offer a gallery listing every photo in the library — visible, hidden, `pending`, and `failed` alike — newest first. Each entry SHALL show the photo's thumbnail where one exists, its title where it has one, and its state, so that a hidden photo is distinguishable from a visible one and a failed upload from a finished one at a glance. An entry for a photo with no thumbnail, such as one that never finalized, SHALL still render and remain identifiable rather than appearing as a broken image. An empty library SHALL be reported plainly rather than as an empty page.

#### Scenario: Gallery lists everything

- **WHEN** an administrator opens the gallery and the library holds visible, hidden, `pending`, and `failed` photos
- **THEN** all of them are listed, newest first

#### Scenario: State is visible per entry

- **WHEN** the gallery renders a hidden photo and a visible one
- **THEN** each is labelled such that the two can be told apart without opening either

#### Scenario: A failed upload has no thumbnail

- **WHEN** the gallery lists a photo that never finalized
- **THEN** the entry still renders, identifies its state, and shows no broken image

#### Scenario: Empty library

- **WHEN** an administrator opens the gallery with no photos stored
- **THEN** the gallery says so rather than rendering an empty page

#### Scenario: Gallery requires a session

- **WHEN** a visitor with no session opens the gallery
- **THEN** the sign-in surface is presented and no photo is listed

### Requirement: The gallery filters by keyword and visibility

The gallery SHALL let an administrator narrow the list by keyword and by visibility, and SHALL apply both together. The keywords offered SHALL come from the library's own vocabulary rather than being typed from memory. Clearing the filters SHALL restore the full list. A filter combination matching nothing SHALL say so rather than appearing broken.

#### Scenario: Filtering by keyword

- **WHEN** an administrator filters the gallery by a keyword
- **THEN** only photos carrying it are listed

#### Scenario: Filtering to hidden photos

- **WHEN** an administrator filters the gallery to hidden photos
- **THEN** only hidden photos are listed

#### Scenario: Filters combine

- **WHEN** an administrator filters by a keyword and by hidden together
- **THEN** only hidden photos carrying that keyword are listed

#### Scenario: Clearing filters

- **WHEN** an administrator clears the filters
- **THEN** the full list is shown again

#### Scenario: A filter matching nothing

- **WHEN** a filter combination matches no photo
- **THEN** the gallery reports that nothing matched rather than appearing empty or broken

### Requirement: The gallery pages through the library

The gallery SHALL page rather than loading the entire library at once, and SHALL let an administrator reach every photo by continuing through the pages. Paging SHALL preserve the active filters, so continuing does not silently widen the results. Every photo matching the filters SHALL be reachable exactly once.

#### Scenario: Continuing to the next page

- **WHEN** more photos match than fit on one page and the administrator continues
- **THEN** the following photos are shown, none of which appeared already

#### Scenario: Reaching the end

- **WHEN** an administrator pages to the end of the results
- **THEN** the gallery indicates there are no more rather than offering to continue indefinitely

#### Scenario: Paging preserves filters

- **WHEN** an administrator filters the gallery and then continues to the next page
- **THEN** the additional photos still match the filter

### Requirement: Visibility can be toggled from the gallery and from the edit form

An administrator SHALL be able to hide and unhide a photo both from its entry in the gallery and from its edit form, without navigating elsewhere. The control SHALL state which action it performs. After toggling, what is shown SHALL reflect the photo's new visibility rather than requiring a reload to become truthful. A toggle the server refuses SHALL be reported, and the photo SHALL continue to be shown with its actual visibility rather than the one that failed to apply.

#### Scenario: Hiding from the gallery

- **WHEN** an administrator hides a photo from its gallery entry
- **THEN** the entry shows it as hidden without a reload

#### Scenario: Unhiding from the gallery

- **WHEN** an administrator unhides a hidden photo from the gallery
- **THEN** the entry shows it as visible

#### Scenario: Toggling from the edit form

- **WHEN** an administrator toggles visibility while editing a photo
- **THEN** the form reflects the new visibility, and the photo's title and keywords are unaffected

#### Scenario: The control names its action

- **WHEN** an administrator looks at the control on a visible photo and on a hidden one
- **THEN** each states the action it will perform rather than the current state alone

#### Scenario: A refused toggle

- **WHEN** the server refuses a visibility change, because the session ended or the photo no longer exists
- **THEN** the failure is reported and the photo is still shown with its actual visibility

#### Scenario: Hiding does not remove the entry from the gallery

- **WHEN** an administrator hides a photo while viewing the unfiltered gallery
- **THEN** the photo remains listed, now marked hidden, rather than vanishing from the view being worked in

### Requirement: The gallery grid uses the full available width

The admin gallery's grid of photos SHALL fill the full width available beneath the admin header, inside the page gutter, adding columns as the viewport widens instead of stopping at a fixed maximum width. Thumbnails SHALL stay square and SHALL keep a minimum size, so a narrow viewport shows fewer columns rather than smaller thumbnails.

#### Scenario: Wide monitor

- **WHEN** an administrator opens the gallery on a viewport wider than 1600px
- **THEN** the grid extends to the page gutters on both sides and shows more columns than it would in a 70rem column

#### Scenario: Narrow viewport

- **WHEN** an administrator opens the gallery on a phone-width viewport
- **THEN** the grid shows fewer columns of square thumbnails, with no horizontal scrolling

### Requirement: An administrator can delete a photo from its edit view

The edit view SHALL offer an action to delete the photo, styled as destructive and distinct from hiding. Choosing it SHALL ask the administrator to confirm before anything is removed, stating that deletion cannot be undone and that hiding is the reversible alternative. Confirming SHALL delete the photo — its record, its stored files and its keyword counts — and SHALL take the administrator to the library, where the photo no longer appears. Cancelling SHALL leave the photo and any unsaved edits in the form untouched. While a delete is in progress the action SHALL NOT be repeatable.

A delete the server refuses SHALL be reported, and the photo SHALL remain shown as it is. A delete that removed the record but could not remove its stored files SHALL be reported as that, not as a clean delete and not as a failure to delete, and SHALL still leave the edit view, since the photo no longer exists.

#### Scenario: Confirmed delete

- **WHEN** an administrator chooses Delete on a photo's edit view and confirms
- **THEN** the photo is removed from the library, its stored files are removed, and the administrator is on the library with the photo absent

#### Scenario: Cancelled delete

- **WHEN** an administrator chooses Delete and then cancels the confirmation
- **THEN** the photo is unchanged, and any title or keywords typed but not yet saved are still in the form

#### Scenario: Delete is not repeatable while running

- **WHEN** a delete is in progress
- **THEN** the delete action cannot be triggered again until it finishes

#### Scenario: Photo already deleted elsewhere

- **WHEN** an administrator confirms deleting a photo that no longer exists
- **THEN** the screen reports that the photo was not found

#### Scenario: Session ended

- **WHEN** the administrator's session has ended and they confirm a delete
- **THEN** the screen reports that the session ended and the photo is not removed

#### Scenario: Files outlive the record

- **WHEN** the photo's record is deleted but its stored files cannot be removed
- **THEN** the administrator is told the photo was deleted but its files were left in storage, and is taken to the library where the photo is absent

#### Scenario: Keyword counts follow the delete

- **WHEN** the only visible photo carrying a keyword is deleted
- **THEN** that keyword no longer appears with a count in the library's keyword filter
