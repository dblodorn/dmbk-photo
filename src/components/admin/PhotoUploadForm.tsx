"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Alert, Button, FormControl, Text, TextField, View } from "reshaped";
import { graphql } from "react-relay";
// The browser's copy of the API's upload limits — see constants.ts.
import {
  SUPPORTED_CONTENT_TYPES,
  isSupportedContentType,
  MAX_ORIGINAL_BYTES,
  MAX_BATCH_FILES,
} from "@/lib/photos/constants";
import { ApiError, SESSION_ENDED, apiErrorCode, describeApiError } from "./api-errors";
import { parseKeywordInput } from "./keyword-input";
import { fromPhotoGlobalId } from "@/lib/photos/photo-id";
import { useApiMutation } from "./use-api-mutation";
import type { PhotoUploadFormReserveMutation } from "./__generated__/PhotoUploadFormReserveMutation.graphql";
import type { PhotoUploadFormFinalizeMutation } from "./__generated__/PhotoUploadFormFinalizeMutation.graphql";
import PhotoBatchSummary from "./PhotoBatchSummary";
import type { BatchItem, FileState } from "./photo-batch";
import styles from "./photo-upload.module.scss";

interface Props {
  /**
   * Called with each new photo's id once it is stored and finalized, and with
   * the size of the batch it came from.
   *
   * The contract is per photo, not per submission: a batch of five calls this
   * five times. `batch.size` is what lets a host decide whether navigating
   * anywhere makes sense — for several photos there is no single one to go to.
   */
  onUploaded: (id: string, batch: { size: number }) => void;
}

/** How many files are uploaded at once.
 *
 *  Serially, ten uploads feel ten times slower than one, which would undercut
 *  the point of batching. All at once, ten large PUTs compete for the same
 *  connection: every one of them gets slower and the progress display stops
 *  being honest, since everything sits at "uploading" together. Three keeps the
 *  pipe busy while each row still means something. */
const CONCURRENCY = 3;

function isUnauthorized(error: unknown): boolean {
  const code = apiErrorCode(error);
  return code === "UNAUTHENTICATED" || code === "FORBIDDEN";
}

/** API failures in the API's terms; the storage PUT's own failure as is. */
function describeError(error: unknown): string {
  if (error instanceof ApiError) return describeApiError(error, "Something went wrong.");
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

// Reserve and finalize run on the dmbk GraphQL API. Finalize selects the
// fields a finished row needs; the id it returns is a global ID.
const reserveMutation = graphql`
  mutation PhotoUploadFormReserveMutation($input: DmbkPhotosReservePhotoUploadInput!) {
    dmbkPhotosReservePhotoUpload(input: $input) {
      photo {
        id
      }
      uploadUrl
    }
  }
`;

const finalizeMutation = graphql`
  mutation PhotoUploadFormFinalizeMutation($input: DmbkPhotosFinalizePhotoInput!) {
    dmbkPhotosFinalizePhoto(input: $input) {
      photo {
        id
        status
      }
      photoEdge {
        cursor
      }
    }
  }
`;

const MAX_MB = Math.round(MAX_ORIGINAL_BYTES / 1024 / 1024);

let nextKey = 0;

/**
 * Upload up to ten photos, each in the three steps the API defines: reserve,
 * PUT the bytes straight to storage, finalize.
 *
 * Nothing on the server knows a batch exists — a batch is simply several runs
 * of the single-photo flow, driven from here.
 *
 * Owns all its state and navigates nowhere — it reports each new id through
 * `onUploaded` — so a modal can mount it unchanged.
 */
export default function PhotoUploadForm({ onUploaded }: Props) {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [title, setTitle] = useState("");
  const [keywords, setKeywords] = useState("");
  const [running, setRunning] = useState(false);
  // Faults with the selection as a whole — too many files, a file that cannot
  // be uploaded, nothing chosen. Faults with an individual upload live on that
  // file's own row instead, where they can be attributed.
  const [errors, setErrors] = useState<string[]>([]);
  // Mirrors the object URLs currently held, so cleanup can revoke them without
  // the effect depending on state, which would re-run it on every change.
  const previewUrls = useRef<string[]>([]);

  const [reserveUpload] = useApiMutation<PhotoUploadFormReserveMutation>(reserveMutation);
  const [finalizeUpload] = useApiMutation<PhotoUploadFormFinalizeMutation>(finalizeMutation);

  const busy = running;
  const single = items.length === 1;

  /** Checked before reserving so a doomed file does not burn a reservation.
   *  Not trusted — the server re-checks the declared type and size, and
   *  finalization decodes the actual bytes.
   *
   *  The message names the file: with several chosen, an unattributed error
   *  cannot be acted on. */
  const validate = useCallback((candidate: File): string | null => {
    if (!isSupportedContentType(candidate.type)) {
      return `${candidate.name}: ${candidate.type || "that file type"} is not supported. Use JPEG, PNG, WebP, or AVIF.`;
    }
    if (candidate.size > MAX_ORIGINAL_BYTES) {
      const mb = (candidate.size / 1024 / 1024).toFixed(1);
      return `${candidate.name}: that file is ${mb} MB, over the ${MAX_MB} MB limit.`;
    }
    return null;
  }, []);

  /** Replace the selection, releasing the object URLs the old one held. */
  const showBatch = useCallback((files: File[]) => {
    // Object URLs pin their file in memory until revoked. With ten files at up
    // to 50 MB each, forgetting this pins half a gigabyte for the life of the
    // page.
    for (const url of previewUrls.current) URL.revokeObjectURL(url);
    const next = files.map<BatchItem>((file) => ({
      key: `batch-${nextKey++}`,
      file,
      previewUrl: URL.createObjectURL(file),
      state: "waiting",
    }));
    previewUrls.current = next
      .map((item) => item.previewUrl)
      .filter((url): url is string => url !== null);
    setItems(next);
  }, []);

  // Release the last URLs when the form goes away — including when a modal
  // hosting it closes mid-edit.
  useEffect(() => {
    return () => {
      for (const url of previewUrls.current) URL.revokeObjectURL(url);
      previewUrls.current = [];
    };
  }, []);

  /** Move one file to a new state, leaving every other row alone. */
  const updateItem = useCallback(
    (key: string, patch: Partial<Omit<BatchItem, "key" | "file">>) => {
      setItems((current) =>
        current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
      );
    },
    [],
  );

  /**
   * The one way a selection enters the form, however it was made — chosen
   * through the picker or dropped onto the drop area. Both feed this, so a
   * dropped file meets exactly the limits, rejections and previews a chosen
   * one does.
   */
  const selectFiles = useCallback(
    (chosen: File[]) => {
      // Clear any previous rejection, so a valid selection is not blocked by a
      // stale error from the last attempt.
      if (chosen.length === 0) {
        showBatch([]);
        setErrors([]);
        return;
      }

      if (chosen.length > MAX_BATCH_FILES) {
        // Refused before anything is reserved, so no partial batch is created.
        showBatch([]);
        setErrors([
          `You chose ${chosen.length} files. Upload at most ${MAX_BATCH_FILES} at a time.`,
        ]);
        return;
      }

      // A bad file refuses the whole selection rather than quietly uploading
      // the acceptable ones: nothing has happened yet, every file is checkable,
      // and being handed seven photos out of ten leaves you working out which
      // three are missing and why. Once uploading has started the opposite rule
      // applies, because by then there is completed work to protect.
      const invalid = chosen
        .map((file) => validate(file))
        .filter((message): message is string => message !== null);
      if (invalid.length > 0) {
        // Nothing is previewed either — previewing a rejected file suggests it
        // is going to be accepted.
        showBatch([]);
        setErrors(invalid);
        return;
      }

      showBatch(chosen);
      setErrors([]);
    },
    [showBatch, validate],
  );

  /*
   * The drop area is an input source and nothing more. It is given no
   * `accept`, `maxFiles` or `maxSize`, so it never rejects anything itself:
   * every file it receives — dropped, or chosen through the picker it opens —
   * goes to selectFiles, which applies the same rules, messages and
   * all-or-nothing refusal a selection has always had. Its own rejection
   * codes would be a second, differently worded set of errors that drops the
   * "names the file" guarantee. The picker's format filter comes from the
   * input's `accept` attribute below, which filters the dialog without
   * validating anything.
   *
   * Disabled while a batch runs, so a drop mid-batch cannot replace the files
   * being uploaded. The library still prevents the browser's default on any
   * drop it does not handle, so a drop then — or anywhere else on the page —
   * neither selects anything nor navigates away to open the file.
   */
  const { getRootProps, getInputProps, isDragActive, inputRef } = useDropzone({
    onDrop: (accepted, rejected) =>
      selectFiles([...accepted, ...rejected.map((rejection) => rejection.file)]),
    multiple: true,
    disabled: busy,
  });

  const clearSelection = useCallback(() => {
    showBatch([]);
    setTitle("");
    setKeywords("");
    setErrors([]);
    if (inputRef.current) inputRef.current.value = "";
  }, [inputRef, showBatch]);

  /** Reserve, send the bytes, finalize — the single-photo flow, unchanged. */
  const uploadOne = useCallback(
    async (item: BatchItem, meta: { title: string | null; keywords: string[] }) => {
      updateItem(item.key, { state: "uploading", error: undefined });

      const { dmbkPhotosReservePhotoUpload: reservation } = await reserveUpload({
        input: {
          contentType: item.file.type,
          byteSize: item.file.size,
          title: meta.title,
          keywords: meta.keywords,
        },
      });

      // Straight to object storage — these bytes never pass through the app,
      // which is what lets an original exceed the request body limit.
      const put = await fetch(reservation.uploadUrl, {
        method: "PUT",
        body: item.file,
        headers: { "content-type": item.file.type },
      });
      if (!put.ok) {
        throw new Error(
          `Upload to storage failed (${put.status}). The photo was not saved.`,
        );
      }

      updateItem(item.key, { state: "processing" });
      await finalizeUpload({ input: { id: reservation.photo.id } });

      // The screens address photos by UUID — /admin/photos/<id> — not by the
      // API's global ID.
      const id = fromPhotoGlobalId(reservation.photo.id);
      updateItem(item.key, { state: "done", photoId: id });
      return id;
    },
    [finalizeUpload, reserveUpload, updateItem],
  );

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      // A second submission while a batch is running would upload the same
      // files twice.
      if (busy) return;

      if (items.length === 0) {
        setErrors(["Choose a file to upload."]);
        return;
      }

      // Re-check at submit time: the selection could have been chosen before a
      // limit changed, and this is the last point before a reservation.
      const invalid = items
        .map((item) => validate(item.file))
        .filter((message): message is string => message !== null);
      if (invalid.length > 0) {
        setErrors(invalid);
        return;
      }

      // Photos already stored are never uploaded again, so submitting after a
      // partly failed batch cannot duplicate them.
      const pending = items.filter((item) => item.state !== "done");
      if (pending.length === 0) {
        setErrors(["Every chosen file has already been uploaded."]);
        return;
      }

      setErrors([]);
      setRunning(true);

      const meta = {
        // A title is offered for one file only, so a batch never carries one.
        title: items.length === 1 && title.trim() ? title : null,
        // Shared across the whole batch — the reason to batch in the first
        // place. Normalization happens once, on the server, so every photo in
        // the batch is tagged identically.
        keywords: parseKeywordInput(keywords),
      };

      // Once the session has gone, the remaining files are reported as failed
      // for that reason rather than each making a doomed round trip and
      // reporting a bare error code.
      let sessionEnded = false;
      let cursor = 0;

      const worker = async () => {
        for (;;) {
          const index = cursor++;
          if (index >= pending.length) return;
          const item = pending[index];

          if (sessionEnded) {
            updateItem(item.key, { state: "failed", error: SESSION_ENDED });
            continue;
          }

          try {
            const id = await uploadOne(item, meta);
            // The size of the selection, not of this run: a batch of three
            // whose last file succeeds on a second attempt is still a batch,
            // and must not suddenly navigate away from the other two.
            onUploaded(id, { size: items.length });
          } catch (err) {
            if (isUnauthorized(err)) sessionEnded = true;
            // Recorded on this row and nowhere else. Every other file carries
            // on, and nothing already stored is touched — a compensating
            // delete would add a failure mode to remove one that the pending
            // upload cleanup already handles.
            updateItem(item.key, {
              state: "failed",
              error: describeError(err),
            });
          }
        }
      };

      try {
        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker),
        );
      } finally {
        // Always leave the form usable, whatever the outcome, so another batch
        // can follow and a failure can be retried.
        setRunning(false);
      }
    },
    [
      busy,
      items,
      keywords,
      onUploaded,
      title,
      updateItem,
      uploadOne,
      validate,
    ],
  );

  const buttonLabel = (): string => {
    if (running) return "Uploading…";
    if (items.length > 1) return `Upload ${items.length} photos`;
    return "Upload";
  };

  const stateCount = (state: FileState) =>
    items.filter((item) => item.state === state).length;

  const formats = "JPEG, PNG, WebP or AVIF";

  return (
    <form onSubmit={submit} noValidate>
      <View gap={6} maxWidth="40rem">
        <View gap={1}>
          <Text as="h2" variant="featured-3">
            Upload photos
          </Text>
          <Text color="neutral-faded">
            Up to {MAX_BATCH_FILES} at a time, {MAX_MB} MB each. Keywords apply
            to every photo in the batch.
          </Text>
        </View>

        {errors.length > 0 && (
          <Alert color="critical" title="That selection can’t be uploaded">
            <View gap={1}>
              {errors.map((message) => (
                <Text key={message}>{message}</Text>
              ))}
            </View>
          </Alert>
        )}

        <div
          {...getRootProps({
            className: styles.dropzone,
            role: "button",
            "aria-label": `Choose up to ${MAX_BATCH_FILES} image files, or drop them here`,
            "aria-describedby": "photo-dropzone-formats",
          })}
          data-active={isDragActive || undefined}
          data-disabled={busy || undefined}
        >
          <input
            {...getInputProps({
              id: "photo-file",
              accept: SUPPORTED_CONTENT_TYPES.join(","),
              "aria-label": "Image files",
            })}
          />
          <View gap={1} align="center" textAlign="center">
            <Text variant="featured-5" weight="medium">
              {busy
                ? "Uploading…"
                : isDragActive
                  ? "Release to select these files"
                  : "Drop photos here, or click to choose"}
            </Text>
            <Text
              variant="caption-1"
              color="neutral-faded"
              attributes={{ id: "photo-dropzone-formats" }}
            >
              {busy
                ? "A new selection can be made when this batch finishes."
                : `${formats} · up to ${MAX_BATCH_FILES} files · ${MAX_MB} MB each`}
            </Text>
          </View>
        </div>

        <PhotoBatchSummary items={items} />

        {/* A title is worth offering for one photo and not for ten: titles
            rarely repeat across a batch, and ten title fields would undo the
            speed batching exists for. Every photo is editable afterwards. */}
        {single && (
          <FormControl id="photo-title" disabled={busy}>
            <FormControl.Label>Title (optional)</FormControl.Label>
            <TextField
              name="title"
              value={title}
              onChange={({ value }) => setTitle(value)}
            />
          </FormControl>
        )}

        <FormControl id="photo-keywords" disabled={busy}>
          <FormControl.Label>Keywords (optional)</FormControl.Label>
          <TextField
            name="keywords"
            value={keywords}
            onChange={({ value }) => setKeywords(value)}
          />
          <FormControl.Helper>
            Comma separated
            {items.length > 1 ? "; applied to every photo in the batch" : ""}.
          </FormControl.Helper>
        </FormControl>

        <View direction="row" gap={2} align="center">
          <Button type="submit" color="primary" disabled={busy}>
            {buttonLabel()}
          </Button>
          {items.length > 0 && !running && (
            <Button variant="ghost" onClick={clearSelection}>
              Clear
            </Button>
          )}
        </View>

        {items.length > 1 && !running && stateCount("done") + stateCount("failed") > 0 && (
          <Text attributes={{ "data-testid": "batch-tally" }}>
            {stateCount("done")} uploaded, {stateCount("failed")} failed, of{" "}
            {items.length} chosen.
          </Text>
        )}
      </View>
    </form>
  );
}
