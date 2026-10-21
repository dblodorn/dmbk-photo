import { Environment, Network, RecordSource, Store, type FetchFunction } from "relay-runtime";
import { ApiError } from "@/components/admin/api-errors";

/*
 * The admin's Relay environment, for operations against the dmbk GraphQL API.
 *
 * Operations go to /api/admin/graphql by persisted id, never as query text:
 * that route forwards only ids the Relay compiler wrote from the admin's own
 * source, attaching the session token from the HTTP-only cookie. See
 * src/app/api/admin/graphql/route.ts.
 *
 * Reads and writes both: the screens keep their own state and fetch with
 * `fetchQuery`, so nothing renders from this store directly yet.
 */

interface GraphQLResponseBody {
  data?: unknown;
  errors?: { message: string; extensions?: { code?: string } }[];
}

const fetchOperation: FetchFunction = async (params, variables) => {
  if (!params.id) {
    // Only persisted operations can be forwarded; text would be refused.
    throw new Error(`Operation ${params.name} was not persisted. Run \`pnpm relay\`.`);
  }

  let res: Response;
  try {
    res = await fetch("/api/admin/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id: params.id, variables }),
    });
  } catch {
    throw new ApiError("API_UNAVAILABLE", "The photo service could not be reached.");
  }

  let body: GraphQLResponseBody;
  try {
    body = await res.json();
  } catch {
    throw new ApiError("API_UNAVAILABLE", `The photo service answered ${res.status} with no JSON.`);
  }

  // Every mutation field on the API is non-null, so any error nulls the whole
  // payload. Raised with the API's code rather than handed to Relay, which
  // would report it only as "no data returned".
  const first = body.errors?.[0];
  if (first) {
    throw new ApiError(first.extensions?.code ?? "INTERNAL_SERVER_ERROR", first.message);
  }
  return body as { data: Record<string, unknown> };
};

/** One per mount of the admin providers, so nothing is shared across requests. */
export function createAdminRelayEnvironment(): Environment {
  return new Environment({
    network: Network.create(fetchOperation),
    store: new Store(new RecordSource()),
  });
}
