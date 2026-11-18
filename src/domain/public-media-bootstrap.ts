import { inertJson } from './inert-json'
export const PUBLIC_MEDIA_BOOTSTRAP_ID = 'aroma-public-media'
export const PUBLIC_MEDIA_BOOTSTRAP_MAX_BYTES = 256 * 1024
export function publicMediaBootstrapJson(
  project: string,
  document: unknown,
  aliases: unknown,
) {
  return inertJson(
    { version: 1, project, document, aliases },
    PUBLIC_MEDIA_BOOTSTRAP_MAX_BYTES,
  )
}
