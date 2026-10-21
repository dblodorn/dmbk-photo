"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Divider,
  FormControl,
  Loader,
  Modal,
  Text,
  TextField,
  View,
  useToast,
} from "reshaped";
import { fetchQuery, graphql, useRelayEnvironment } from "react-relay";
import { apiErrorCode, describeApiError } from "./api-errors";
import { formatKeywords, parseKeywordInput } from "./keyword-input";
import { toPhotoGlobalId } from "@/lib/photos/photo-id";
import { useApiMutation } from "./use-api-mutation";
import type { PhotoEditFormUpdateMutation } from "./__generated__/PhotoEditFormUpdateMutation.graphql";
import type { PhotoEditFormSetHiddenMutation } from "./__generated__/PhotoEditFormSetHiddenMutation.graphql";
import type { PhotoEditFormDeleteMutation } from "./__generated__/PhotoEditFormDeleteMutation.graphql";
import type { PhotoEditFormQuery } from "./__generated__/PhotoEditFormQuery.graphql";

interface Props {
  photoId: string;
  /** Optional — a modal can use this to close itself after a save. */
  onSaved?: () => void;
}

// Writes go to the dmbk GraphQL API; each payload selects what this form
// shows, so a save can display what the library actually stored.
const updateMutation = graphql`
  mutation PhotoEditFormUpdateMutation($input: DmbkPhotosUpdatePhotoInput!) {
    dmbkPhotosUpdatePhoto(input: $input) {
      photo {
        id
        title
        keywords
      }
    }
  }
`;

// `deletedPhotoId` is selected for Relay's @deleteRecord once the library
// reads through the API too; for now the screens drop the photo themselves.
const deleteMutation = graphql`
  mutation PhotoEditFormDeleteMutation($input: DmbkPhotosDeletePhotoInput!) {
    dmbkPhotosDeletePhoto(input: $input) {
      deletedPhotoId
    }
  }
`;

const setHiddenMutation = graphql`
  mutation PhotoEditFormSetHiddenMutation($input: DmbkPhotosSetPhotoHiddenInput!) {
    dmbkPhotosSetPhotoHidden(input: $input) {
      photo {
        id
        hidden
      }
    }
  }
`;

/*
 * The photo being edited, read from the dmbk GraphQL API through the admin
 * proxy. `node` answers at any visibility or state for an admin session, so a
 * hidden photo can be unhidden from its own form; an id that names nothing
 * resolves to null.
 */
const photoQuery = graphql`
  query PhotoEditFormQuery($id: ID!) {
    node(id: $id) {
      ... on Photo {
        id
        title
        keywords
        hidden
        thumbUrl
        width
        height
      }
    }
  }
`;

interface LoadedPhoto {
  title: string | null;
  keywords: readonly string[];
  hidden: boolean;
  thumbUrl: string | null;
  width: number | null;
  height: number | null;
}

type PhotoLoad =
  | { status: "loading" }
  | { status: "loaded"; data: LoadedPhoto }
  | { status: "not-found" }
  | { status: "error"; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fetched fresh on every mount: the form's state is local, not the store's. */
function usePhoto(photoId: string): PhotoLoad {
  const environment = useRelayEnvironment();
  // Keyed by the id it answers for, so a change of id reads as loading again
  // without resetting state inside the effect.
  const [result, setResult] = useState<{ id: string; load: PhotoLoad } | null>(null);
  const wellFormed = UUID_RE.test(photoId);

  useEffect(() => {
    if (!wellFormed) return;
    const subscription = fetchQuery<PhotoEditFormQuery>(
      environment,
      photoQuery,
      { id: toPhotoGlobalId(photoId) },
      { fetchPolicy: "network-only" },
    ).subscribe({
      next: (data) => {
        const node = data.node;
        if (!node || node.id === undefined) {
          setResult({ id: photoId, load: { status: "not-found" } });
          return;
        }
        setResult({
          id: photoId,
          load: {
            status: "loaded",
            data: {
              title: node.title ?? null,
              keywords: node.keywords ?? [],
              hidden: node.hidden ?? false,
              thumbUrl: node.thumbUrl ?? null,
              width: node.width ?? null,
              height: node.height ?? null,
            },
          },
        });
      },
      error: (err: unknown) =>
        setResult({
          id: photoId,
          load: { status: "error", message: describeApiError(err, "Could not load this photo.") },
        }),
    });
    return () => subscription.unsubscribe();
  }, [environment, photoId, wellFormed]);

  // A malformed id cannot name a photo; say so without asking.
  if (!wellFormed) return { status: "not-found" };
  return result?.id === photoId ? result.load : { status: "loading" };
}

/**
 * Edit a photo's title and keywords.
 *
 * Reads and writes both go to the dmbk GraphQL API through the admin proxy.
 *
 * Owns its state and navigates nowhere, so a modal can mount it unchanged.
 */
export default function PhotoEditForm({ photoId, onSaved }: Props) {
  const photo = usePhoto(photoId);
  const loaded = photo.status === "loaded" ? photo.data : undefined;
  const [updatePhoto, updating] = useApiMutation<PhotoEditFormUpdateMutation>(updateMutation);
  const [setPhotoHidden, togglingHidden] =
    useApiMutation<PhotoEditFormSetHiddenMutation>(setHiddenMutation);
  const [deletePhoto, deleting] = useApiMutation<PhotoEditFormDeleteMutation>(deleteMutation);

  const router = useRouter();
  const toast = useToast();
  // The confirmation is plain state rather than a route, so a modal hosting
  // this form can still delete from it.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Visibility is not part of the title/keyword draft: toggling applies
  // immediately and must not disturb unsaved edits in the other fields.
  const [hiddenOverride, setHiddenOverride] = useState<boolean | null>(null);

  // Only what the administrator has actually typed. The displayed values are
  // derived below, falling back to the loaded photo — so the form never needs
  // an effect to copy server data into state, and a save that fails leaves the
  // typed draft exactly where it was.
  const [draft, setDraft] = useState<{
    title: string;
    keywords: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const isHidden = hiddenOverride ?? loaded?.hidden ?? false;
  const title = draft?.title ?? loaded?.title ?? "";
  const keywords =
    draft?.keywords ?? formatKeywords([...(loaded?.keywords ?? [])]);

  const edit = useCallback(
    (patch: Partial<{ title: string; keywords: string }>) => {
      setSaved(false);
      setDraft((current) => ({ title, keywords, ...current, ...patch }));
    },
    [title, keywords],
  );

  const save = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError(null);
      setSaved(false);
      try {
        // Wholesale replacement: what the form shows becomes the photo's title
        // and complete keyword set, so removing one here removes it there.
        const { dmbkPhotosUpdatePhoto } = await updatePhoto({
          input: {
            id: toPhotoGlobalId(photoId),
            title: title.trim() ? title : null,
            keywords: parseKeywordInput(keywords),
          },
        });
        const result = dmbkPhotosUpdatePhoto.photo;
        // Show what the library actually stored — normalized slugs, trimmed
        // title — rather than the raw text that was typed.
        setDraft({
          title: result.title ?? "",
          keywords: formatKeywords(result.keywords),
        });
        setSaved(true);
        onSaved?.();
      } catch (err) {
        // Leave the typed values in place so the edit is not lost.
        setError(describeApiError(err, "Could not save."));
      }
    },
    [keywords, onSaved, photoId, title, updatePhoto],
  );

  if (photo.status === "loading") {
    return (
      <View direction="row" gap={3} align="center">
        <Loader size="small" ariaLabel="Loading photo" />
        <Text color="neutral-faded">Loading photo…</Text>
      </View>
    );
  }

  if (photo.status === "not-found") {
    return (
      <Alert color="neutral" title="Not found">
        No photo found for that identifier.
      </Alert>
    );
  }

  if (photo.status === "error") {
    return (
      <Alert color="critical" title="Could not load this photo">
        {photo.message}
      </Alert>
    );
  }

  const data = photo.data;

  /**
   * Leave for the library once the photo is gone. Nothing cached needs
   * clearing: this form reads afresh on every mount.
   */
  const leaveDeleted = (warning: string | null) => {
    setConfirmingDelete(false);
    toast.show(
      warning
        ? { color: "warning", title: "Photo deleted, files left behind", text: warning }
        : { color: "neutral", text: "Photo deleted." },
    );
    router.push("/admin/photos");
  };

  const confirmDelete = async () => {
    setDeleteError(null);
    try {
      await deletePhoto({ input: { id: toPhotoGlobalId(photoId) } });
      leaveDeleted(null);
    } catch (err) {
      // The record is gone even though its files are not: there is nothing
      // left to edit, so this leaves too — saying what was left behind.
      if (apiErrorCode(err) === "STORAGE_CLEANUP_FAILED") {
        leaveDeleted(describeApiError(err));
        return;
      }
      // Anything else deleted nothing. Stay, with the draft untouched.
      setConfirmingDelete(false);
      setDeleteError(describeApiError(err, "Could not delete this photo."));
    }
  };

  const toggleHidden = async () => {
    setError(null);
    try {
      const { dmbkPhotosSetPhotoHidden } = await setPhotoHidden({
        input: { id: toPhotoGlobalId(photoId), hidden: !isHidden },
      });
      setHiddenOverride(dmbkPhotosSetPhotoHidden.photo.hidden ?? !isHidden);
    } catch (err) {
      // Leave the displayed visibility as the photo's actual one.
      setError(describeApiError(err, "Could not change visibility."));
    }
  };

  return (
    <form onSubmit={save} noValidate>
      <View gap={6} maxWidth="40rem">
        <View direction="row" gap={3} align="center" justify="space-between" wrap>
          <Text as="h2" variant="featured-3">
            Edit photo
          </Text>
          <View direction="row" gap={2} align="center">
            <Badge color={isHidden ? "warning" : "positive"}>
              {isHidden ? "hidden" : "visible"}
            </Badge>
            <Button
              variant="outline"
              size="small"
              disabled={togglingHidden}
              onClick={toggleHidden}
            >
              {togglingHidden ? "Working…" : isHidden ? "Unhide" : "Hide"}
            </Button>
          </View>
        </View>

        {error && (
          <Alert color="critical" title="Not saved">
            {error}
          </Alert>
        )}
        {saved && !error && <Alert color="positive">Saved.</Alert>}
        {deleteError && (
          <Alert color="critical" title="Not deleted">
            {deleteError}
          </Alert>
        )}

        {data.thumbUrl && (
          // align="start": a flex column stretches its children across, which
          // would widen the image past its aspect ratio once its height is capped.
          <View gap={2} align="start">
            {/* eslint-disable-next-line @next/next/no-img-element -- CDN
                thumbnail, already sized by the library's derivatives */}
            <img
              src={data.thumbUrl}
              alt={data.title ?? "Photo preview"}
              style={{
                maxWidth: "100%",
                maxHeight: "24rem",
                width: "auto",
                height: "auto",
                borderRadius: "var(--rs-radius-medium)",
              }}
            />
            <Text variant="caption-1" color="neutral-faded">
              {data.width} × {data.height}
            </Text>
          </View>
        )}

        <FormControl id="edit-title" disabled={updating}>
          <FormControl.Label>Title</FormControl.Label>
          <TextField
            name="title"
            value={title}
            onChange={({ value }) => edit({ title: value })}
          />
        </FormControl>

        <FormControl id="edit-keywords" disabled={updating}>
          <FormControl.Label>Keywords</FormControl.Label>
          <TextField
            name="keywords"
            value={keywords}
            onChange={({ value }) => edit({ keywords: value })}
          />
          <FormControl.Helper>
            Comma separated. Saving replaces the photo&apos;s keywords with
            these.
          </FormControl.Helper>
        </FormControl>

        <View direction="row">
          <Button type="submit" color="primary" disabled={updating}>
            {updating ? "Saving…" : "Save"}
          </Button>
        </View>

        {/* Apart from saving and hiding, since it is the one action here
            that cannot be taken back. */}
        <Divider />
        <View direction="row" gap={3} align="center" justify="space-between" wrap>
          <View gap={1}>
            <Text weight="medium">Delete this photo</Text>
            <Text variant="caption-1" color="neutral-faded">
              Removes it and its files for good. To take it off the site but
              keep it, hide it instead.
            </Text>
          </View>
          <Button
            color="critical"
            variant="outline"
            disabled={deleting}
            onClick={() => setConfirmingDelete(true)}
          >
            Delete photo
          </Button>
        </View>
      </View>

      <Modal
        active={confirmingDelete}
        // Not closable mid-delete: the outcome decides where this view goes.
        onClose={() => !deleting && setConfirmingDelete(false)}
        size="28rem"
        padding={6}
      >
        <View gap={4}>
          <View gap={1}>
            <Modal.Title>Delete {data.title ? `“${data.title}”` : "this photo"}?</Modal.Title>
            <Modal.Subtitle>
              This can’t be undone. The photo and all its files are removed.
              Hiding it keeps everything and can be reversed.
            </Modal.Subtitle>
          </View>
          <View direction="row" gap={2} justify="end">
            <Button variant="ghost" disabled={deleting} onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button color="critical" loading={deleting} disabled={deleting} onClick={confirmDelete}>
              Delete
            </Button>
          </View>
        </View>
      </Modal>
    </form>
  );
}
