import { inertJson } from './inert-json'
export const PUBLIC_INITIAL_CONTEXT_ID = 'aroma-public-initial-context'
export const PUBLIC_INITIAL_CONTEXT_MAX_BYTES = 2 * 1024 * 1024 + 128 * 1024
export const PUBLIC_INITIAL_CONTEXT_MAX_AGE_MS = 5000
export function publicInitialContextJson(
  project: string,
  path: string,
  values: Record<string, unknown>,
) {
  return inertJson(
    { version: 1, project, path, values },
    PUBLIC_INITIAL_CONTEXT_MAX_BYTES,
  )
}
