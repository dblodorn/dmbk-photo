"use client";

import { useEffect, type MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Tabs } from "reshaped";

const SECTIONS = [
  { value: "upload", href: "/admin/upload", label: "Upload" },
  { value: "library", href: "/admin/photos", label: "Library" },
] as const;

/*
 * The admin's sections, as tabs that follow the URL.
 *
 * Each section is its own route rather than a panel on one page, so the
 * selected tab is a function of the path. Everything under /admin/photos — the
 * library and a photo's edit view — is Library; the rest is Upload.
 *
 * The bordered variant draws the rule under the header across the full width,
 * which is why the header itself carries no border.
 *
 * Client-side navigation by hand. Reshaped's Tabs.Item renders a plain <a>
 * for an `href` and, unlike Button and Link, has no `render` prop for Next's
 * Link (see links.tsx). A plain <a> is a full page load, and the session gate
 * is client-side, so every switch would flash "Checking session…". So a
 * plain primary click is intercepted and routed; a modified click (new tab,
 * new window, download) is left to the browser, which is why the real `href`
 * stays. Prefetched by hand for the same reason — only Next's Link does it on
 * its own.
 */
export default function AdminNav() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const selected = pathname.startsWith("/admin/photos") ? "library" : "upload";

  useEffect(() => {
    for (const section of SECTIONS) router.prefetch(section.href);
  }, [router]);

  function navigate(event: MouseEvent<HTMLElement>, href: string) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    router.push(href);
  }

  return (
    <Tabs value={selected} variant="bordered">
      <Tabs.List>
        {SECTIONS.map((section) => (
          <Tabs.Item
            key={section.value}
            value={section.value}
            href={section.href}
            attributes={{
              onClick: (event) => navigate(event, section.href),
              "aria-current": selected === section.value ? "page" : undefined,
            }}
          >
            {section.label}
          </Tabs.Item>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
