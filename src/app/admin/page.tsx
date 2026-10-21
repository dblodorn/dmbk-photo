"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Text } from "reshaped";

/**
 * The admin entry point, not a destination.
 *
 * Reaching this at all means the layout found a session — an anonymous visitor
 * gets the sign-in surface instead and never renders this. So there is nothing
 * to show here: send them where the work is.
 */
export default function AdminIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/upload");
  }, [router]);

  return <Text color="neutral-faded">Redirecting to upload…</Text>;
}
