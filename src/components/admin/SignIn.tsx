"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Card, Loader, Text, View, useTheme } from "reshaped";
import { SignInError, useSignIn } from "@/lib/admin-session";

/*
 * Google sign-in for the admin section, through Google Identity Services.
 *
 * Google renders the button and hands back an ID token for the dmbk OAuth
 * client; `/api/session` trades it with the accounts API for a session. The
 * page's origin must be an authorized JavaScript origin on that client —
 * Google refuses to render the button anywhere else, including Vercel
 * preview URLs.
 */

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

interface GoogleId {
  initialize(config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    ux_mode?: "popup" | "redirect";
    auto_select?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: { theme?: string; size?: string; text?: string; shape?: string; width?: number },
  ): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

export default function SignIn() {
  const signIn = useSignIn();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(
    () => typeof window !== "undefined" && !!window.google?.accounts?.id,
  );
  const [scriptFailed, setScriptFailed] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCredential = useCallback(
    async ({ credential }: { credential?: string }) => {
      if (!credential) {
        setError("Google did not return a sign-in token. Try again.");
        return;
      }
      setError(null);
      setSigningIn(true);
      try {
        await signIn(credential);
      } catch (err) {
        setError(err instanceof SignInError ? err.message : "Sign-in failed. Try again.");
      } finally {
        setSigningIn(false);
      }
    },
    [signIn],
  );

  // The admin follows the system colour mode, and Google's button is an
  // iframe our tokens cannot reach — so pick its own dark variant to match,
  // and re-render it (into an emptied container) when the mode changes.
  const { colorMode } = useTheme();

  useEffect(() => {
    const id = window.google?.accounts?.id;
    if (!scriptReady || !id || !CLIENT_ID || !buttonRef.current) return;
    id.initialize({ client_id: CLIENT_ID, callback: onCredential, ux_mode: "popup" });
    buttonRef.current.replaceChildren();
    id.renderButton(buttonRef.current, {
      theme: colorMode === "dark" ? "filled_black" : "outline",
      size: "large",
      text: "signin_with",
      shape: "rectangular",
    });
  }, [scriptReady, onCredential, colorMode]);

  return (
    <Card padding={6}>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() => setScriptFailed(true)}
      />
      <View gap={5}>
        <View gap={1}>
          <Text as="h1" variant="featured-3">
            Admin sign-in
          </Text>
          <Text color="neutral-faded">Sign in with your Google account to continue.</Text>
        </View>

        {error && (
          <Alert color="critical" title="Sign-in failed">
            {error}
          </Alert>
        )}

        {!CLIENT_ID ? (
          <Alert color="warning">
            Google sign-in is not configured: NEXT_PUBLIC_GOOGLE_CLIENT_ID is unset.
          </Alert>
        ) : scriptFailed ? (
          <Alert color="warning">
            Google sign-in could not load. Check your connection or any blocker, then reload this page.
          </Alert>
        ) : signingIn ? (
          <View direction="row" gap={3} align="center">
            <Loader size="small" ariaLabel="Signing in" />
            <Text color="neutral-faded">Signing in…</Text>
          </View>
        ) : null}

        {/* Google renders its button into this element. Kept mounted while
            signing in so a failure can be retried without reloading.
            `color-scheme: light` whatever the admin's mode: the button is an
            iframe whose document is light, and a browser paints an opaque
            white backdrop behind an iframe whose scheme differs from its
            embedder's — a white box around the dark button. */}
        <div
          ref={buttonRef}
          data-testid="google-sign-in"
          hidden={!CLIENT_ID || scriptFailed || signingIn}
          style={{ minHeight: 44, colorScheme: "light" }}
        />
      </View>
    </Card>
  );
}
