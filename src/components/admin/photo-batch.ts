/**
 * The shape of an upload batch, shared by the form that runs it and the
 * component that reports on it.
 *
 * It lives in its own module rather than in `PhotoUploadForm` because the form
 * imports the summary — putting the types beside the form would make that
 * import circular.
 */

/**
 * Where one file has got to.
 *
 * `uploading` covers reserving and sending the bytes; `processing` is the
 * server building derivatives during finalization. The distinction matters
 * because processing is the slow, silent step, and a batch that appears frozen
 * has to be distinguishable from one still working.
 */
export type FileState =
  | "waiting"
  | "uploading"
  | "processing"
  | "done"
  | "failed";

export interface BatchItem {
  /** Stable across state changes, so React keeps rows in place. Two files can
   *  share a name, so the name is not usable as a key. */
  key: string;
  file: File;
  /** Object URL for the preview, revoked when the selection is replaced. */
  previewUrl: string | null;
  state: FileState;
  /** Set once the photo is finalized — this is what the edit link points at. */
  photoId?: string;
  /** Set when the file failed, in terms an administrator can act on. */
  error?: string;
}

/** What each state is called on screen. */
export const FILE_STATE_LABELS: Record<FileState, string> = {
  waiting: "Waiting",
  uploading: "Uploading",
  processing: "Processing",
  done: "Uploaded",
  failed: "Failed",
};
