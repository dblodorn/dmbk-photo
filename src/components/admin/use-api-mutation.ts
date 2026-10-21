"use client";

import { useCallback } from "react";
import { useMutation } from "react-relay";
import type { GraphQLTaggedNode, MutationParameters } from "relay-runtime";

/**
 * A Relay mutation against the dmbk GraphQL API, as a promise.
 *
 * The screens are written as `await`-and-catch (they were tRPC's
 * `mutateAsync`), which keeps a failed save's draft handling in one place.
 * Relay's `commit` is callback-based; this adapts it and nothing else. A
 * failure rejects with the `ApiError` the environment raised, so callers hand
 * it straight to `describeApiError`.
 */
export function useApiMutation<T extends MutationParameters>(
  mutation: GraphQLTaggedNode,
): [(variables: T["variables"]) => Promise<T["response"]>, boolean] {
  const [commit, isInFlight] = useMutation<T>(mutation);

  const run = useCallback(
    (variables: T["variables"]) =>
      new Promise<T["response"]>((resolve, reject) => {
        commit({
          variables,
          onCompleted: (response) => resolve(response),
          onError: reject,
        });
      }),
    [commit],
  );

  return [run, isInFlight];
}
