import type { ReactNode } from "react";
import AdminProviders from "./providers";
import AdminShell from "./AdminShell";

export const metadata = {
  title: "Admin",
  // An admin tool has no business in a search index.
  robots: { index: false, follow: false },
};

/**
 * Rendered per request, never prerendered.
 *
 * Nothing here is cacheable — every screen is gated and specific to the
 * signed-in administrator. Declaring it at the layout means a future page
 * cannot accidentally be statically built with one administrator's state
 * baked into it.
 */
export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminProviders>
      <AdminShell>{children}</AdminShell>
    </AdminProviders>
  );
}
