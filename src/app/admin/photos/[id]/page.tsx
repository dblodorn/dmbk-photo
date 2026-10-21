"use client";

import { use } from "react";
import { View } from "reshaped";
import PhotoEditForm from "@/components/admin/PhotoEditForm";
import { TextLink } from "@/components/admin/links";

/**
 * Thin wrapper: takes the identifier from the URL and hands it to the edit
 * module, which owns loading, validation, and saving.
 */
export default function AdminEditPhotoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <View gap={6}>
      <PhotoEditForm photoId={id} />
      <View direction="row" gap={4}>
        <TextLink href="/admin/photos">Back to the library</TextLink>
        <TextLink href="/admin/upload">Upload another</TextLink>
      </View>
    </View>
  );
}
