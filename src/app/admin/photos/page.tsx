"use client";

import PhotoGallery from "@/components/admin/PhotoGallery";

/**
 * Thin wrapper. The gallery owns its filters, paging, and toggling.
 *
 * Sits alongside `photos/[id]/page.tsx`: Next resolves the static segment
 * first, so this serves the library and `[id]` serves one photo's edit view.
 */
export default function AdminPhotosPage() {
  return <PhotoGallery />;
}
