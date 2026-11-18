import { inertJson } from './inert-json'
/** One anonymous response already fetched for this document, never an edge cache. */
export const PRODUCT_BOOTSTRAP_ID = 'aroma-public-product'
export const PRODUCT_BOOTSTRAP_MAX_BYTES = 128 * 1024
export const PRODUCT_BOOTSTRAP_MAX_AGE_MS = 5000

export function productBootstrapJson(
  project: string,
  slug: string,
  value: unknown,
) {
  return inertJson(
    { version: 1, project, slug, value },
    PRODUCT_BOOTSTRAP_MAX_BYTES,
  )
}
