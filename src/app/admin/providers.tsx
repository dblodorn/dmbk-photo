"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RelayEnvironmentProvider } from "react-relay";
import { createAdminRelayEnvironment } from "./relay-environment";

/**
 * react-query and Relay providers — mounted only under /admin, so the public
 * gallery ships neither. Reshaped is app-wide, in the root layout.
 */
export default function AdminProviders({ children }: { children: ReactNode }) {
  // One client per mount, created lazily so it is never shared across requests.
  // react-query holds only the admin session (lib/admin-session.ts).
  const [queryClient] = useState(() => new QueryClient());

  // Every photo read and write goes to the dmbk GraphQL API through Relay.
  // See relay-environment.ts.
  const [relayEnvironment] = useState(createAdminRelayEnvironment);

  return (
    <QueryClientProvider client={queryClient}>
      <RelayEnvironmentProvider environment={relayEnvironment}>{children}</RelayEnvironmentProvider>
    </QueryClientProvider>
  );
}
