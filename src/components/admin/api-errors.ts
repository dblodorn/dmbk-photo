/**
 * Failures from the dmbk GraphQL API, as the admin screens report them.
 *
 * The Relay environment (src/app/admin/relay-environment.ts) turns every
 * GraphQL error and transport failure into an `ApiError` carrying the API's
 * code, so a screen never has to pick apart a response — it calls
 * `describeApiError` and shows the result.
 */

/** The codes the API (and the /api/admin/graphql proxy in front of it) uses. */
export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BAD_USER_INPUT"
  | "STORAGE_CLEANUP_FAILED"
  | "INTERNAL_SERVER_ERROR"
  | "API_UNAVAILABLE"
  | (string & {});

export class ApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

/** The code of whatever was thrown, or null when it was not an API error. */
export function apiErrorCode(error: unknown): ApiErrorCode | null {
  return error instanceof ApiError ? error.code : null;
}

export const SESSION_ENDED = "Your session ended. Sign in again to continue.";
export const UNREACHABLE = "Couldn't reach the photo service. Try again.";

/**
 * What to tell the administrator. `fallback` is used for an API error with no
 * more specific wording, so each screen can say what it was trying to do.
 */
export function describeApiError(error: unknown, fallback = UNREACHABLE): string {
  if (!(error instanceof ApiError)) return UNREACHABLE;
  switch (error.code) {
    // FORBIDDEN is the API's refusal of a signed-in non-admin. From the
    // admin's side the remedy is the same: sign in again as an admin.
    case "UNAUTHENTICATED":
    case "FORBIDDEN":
      return SESSION_ENDED;
    case "NOT_FOUND":
      return "That photo no longer exists.";
    // The API's own wording: it names the field and the limit.
    case "BAD_USER_INPUT":
      return error.message;
    case "STORAGE_CLEANUP_FAILED":
      return "The photo was deleted, but its files could not be removed from storage.";
    case "INTERNAL_SERVER_ERROR":
    case "API_UNAVAILABLE":
      return UNREACHABLE;
    default:
      return fallback;
  }
}
