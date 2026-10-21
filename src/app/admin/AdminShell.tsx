"use client";

import type { ReactNode } from "react";
import { Alert, Button, Divider, Loader, Text, View } from "reshaped";
import { useAdminSession, useSignOut } from "@/lib/admin-session";
import SignIn from "@/components/admin/SignIn";
import AdminNav from "@/components/admin/AdminNav";

/** The centred frame every pre-session state shares, so signing in does not
 *  shift the content sideways once the session resolves. */
function Frame({ children }: { children: ReactNode }) {
  return (
    <View minHeight="100dvh" align="center" justify="center" padding={6}>
      <View width="100%" maxWidth="32rem">
        {children}
      </View>
    </View>
  );
}

/**
 * The admin gate.
 *
 * Renders sign-in when there is no session and the route's own content when
 * there is. This is a usability gate, not a security boundary — it is
 * client-side, so the markup is reachable by anyone reading the bundle. That is
 * acceptable only because the markup is empty forms: every operation behind it
 * is enforced by the dmbk GraphQL API, which checks the session's admin scope
 * on every operation the proxy forwards. Any future admin route that server-renders
 * real data must check the session on the server instead of relying on this.
 */
export default function AdminShell({ children }: { children: ReactNode }) {
  const { viewer, isPending, error } = useAdminSession();
  const signOut = useSignOut();

  // Without this, admin content flashes before the session check resolves.
  if (isPending) {
    return (
      <Frame>
        <View direction="row" gap={3} align="center" justify="center">
          <Loader size="small" ariaLabel="Checking session" />
          <Text color="neutral-faded">Checking session…</Text>
        </View>
      </Frame>
    );
  }

  if (!viewer) {
    return (
      <Frame>
        <View gap={4}>
          {error && (
            <Alert color="warning" title="Could not check your session">
              {error.message}
            </Alert>
          )}
          <SignIn />
        </View>
      </Frame>
    );
  }

  return (
    /* Full width: the header and the content share one gutter
       (paddingInline) and no centred column, so the library grid can use a
       wide monitor. Screens that read better narrow — upload, edit — cap
       their own width. */
    <View minHeight="100dvh" backgroundColor="page">
      <View as="header" paddingTop={6} paddingInline={6} gap={4}>
        <View direction="row" wrap gap={4} align="center" justify="space-between">
          <View gap={1}>
            <Text variant="featured-3" weight="medium">
              Photo admin
            </Text>
            <Text variant="caption-1" color="neutral-faded">
              photo.dmbk.io
            </Text>
          </View>

          <View direction="row" wrap gap={4} align="center">
            {/* Opens the public gallery in a new tab, so a plain anchor
                rather than Next's Link — no point prefetching its bundle. */}
            <a href="/" target="_blank" rel="noreferrer">
              <Text variant="body-2" color="neutral-faded">
                View gallery ↗
              </Text>
            </a>

            <Divider vertical />

            <View direction="row" gap={3} align="center">
              {/* Shown so someone on a shared machine can tell whose session
                  they are working under. */}
              <Text variant="caption-1" color="neutral-faded">
                {viewer.email}
              </Text>
              <Button size="small" variant="outline" onClick={signOut}>
                Sign out
              </Button>
            </View>
          </View>
        </View>

        {/* The section tabs, whose bordered variant draws the rule under the
            header — so no border on the header View itself. */}
        <AdminNav />
      </View>

      <View as="main" paddingInline={6} paddingBlock={8}>
        {children}
      </View>
    </View>
  );
}
