import {
  PRODUCT_BOOTSTRAP_ID,
  PRODUCT_BOOTSTRAP_MAX_AGE_MS,
  PRODUCT_BOOTSTRAP_MAX_BYTES,
} from '../domain/product-bootstrap'
import { publicQueryCacheGeneration } from './public-query-cache'

/** Only the first navigation may adopt its fresh, no-store anonymous DTO.
 * Its validated value can reuse only the original five-second query window;
 * invalidation or expiry still makes later reads use Supabase. No product,
 * stock or price data is saved to storage or a cross-request cache. */
export function takeProductBootstrap(slug: string): unknown {
  if (typeof document === 'undefined') return undefined
  const element = document.getElementById(PRODUCT_BOOTSTRAP_ID)
  if (!element) return undefined
  const text = element.textContent ?? ''
  element.remove()
  if (
    element.tagName !== 'SCRIPT' ||
    element.getAttribute('type') !== 'application/json' ||
    publicQueryCacheGeneration() !== 0 ||
    performance.now() > PRODUCT_BOOTSTRAP_MAX_AGE_MS ||
    location.pathname.replace(/\/$/, '') !== `/producto/${slug}` ||
    text.length > PRODUCT_BOOTSTRAP_MAX_BYTES ||
    new TextEncoder().encode(text).byteLength > PRODUCT_BOOTSTRAP_MAX_BYTES
  )
    return undefined
  try {
    const source: unknown = JSON.parse(text)
    if (!source || typeof source !== 'object' || Array.isArray(source))
      return undefined
    const value = source as Record<string, unknown>
    if (
      value.version !== 1 ||
      value.slug !== slug ||
      value.project !== import.meta.env.VITE_SUPABASE_URL
    )
      return undefined
    return value.value
  } catch {
    return undefined
  }
}
