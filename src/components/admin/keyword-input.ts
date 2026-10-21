/**
 * Keywords are typed as free text, several at a time, separated by commas.
 *
 * Splitting is all the UI does — the library owns normalization (lowercasing,
 * slugifying, de-duplicating), and both forms render back what the server
 * actually stored rather than the raw text, so what you see matches what was
 * kept.
 */
export function parseKeywordInput(value: string): string[] {
  return value
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

/** Render stored slugs back into the comma-separated form the input expects. */
export function formatKeywords(keywords: readonly string[]): string {
  return keywords.join(", ");
}
