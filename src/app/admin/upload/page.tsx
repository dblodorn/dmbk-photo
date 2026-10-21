"use client";

import { useRouter } from "next/navigation";
import PhotoUploadForm from "@/components/admin/PhotoUploadForm";

/**
 * Thin wrapper: the upload module owns the flow, this owns only where a
 * finished upload goes next. Keeping navigation out here is what lets a modal
 * reuse the same module with a different callback.
 */
export default function AdminUploadPage() {
  const router = useRouter();

  return (
    <PhotoUploadForm
      onUploaded={(id, batch) => {
        // One photo has an obvious next screen; several do not, and picking one
        // of them would hide the rest — so a batch stays put and reports in
        // place instead.
        if (batch.size === 1) router.push(`/admin/photos/${id}`);
      }}
    />
  );
}
