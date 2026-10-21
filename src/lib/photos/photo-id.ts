/**
 * Photo ids at the boundary between this site and the dmbk GraphQL API.
 *
 * The site addresses a photo by its UUID: it is what gallery URLs and
 * `/admin/photos/<id>` carry, and the listing's tie-break orders by it. The
 * API addresses it by Relay global ID: Pothos' default encoding, base64 of
 * `Photo:<uuid>`. Ids are decoded as they arrive from the API and encoded on
 * the way back. The decode checks the type prefix, so a change in the API's
 * encoding fails loudly instead of addressing the wrong record.
 */

const PREFIX = "Photo:";

export function toPhotoGlobalId(uuid: string): string {
  return btoa(`${PREFIX}${uuid}`);
}

export function fromPhotoGlobalId(globalId: string): string {
  let decoded: string;
  try {
    decoded = atob(globalId);
  } catch {
    throw new Error(`Not a global ID: ${globalId}`);
  }
  if (!decoded.startsWith(PREFIX)) {
    throw new Error(`Not a Photo global ID: ${globalId}`);
  }
  return decoded.slice(PREFIX.length);
}
