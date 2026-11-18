import {
  HOME_BOOTSTRAP_ID,
  HOME_BOOTSTRAP_MAX_BYTES,
} from '../domain/home-bootstrap'
import { publicQueryCacheGeneration } from './public-query-cache'

/** Single-use editorial data, never pricing or stock, from this fresh HTML. */
export function takeInitialHome(): unknown {
  if (typeof document === 'undefined') return undefined
  const element = document.getElementById(HOME_BOOTSTRAP_ID)
  if (!element) return undefined
  element.remove()
  const text = element.textContent ?? ''
  if (
    element.tagName !== 'SCRIPT' ||
    element.getAttribute('type') !== 'application/json' ||
    location.pathname !== '/' ||
    performance.now() > 30000 ||
    publicQueryCacheGeneration() !== 0 ||
    text.length > HOME_BOOTSTRAP_MAX_BYTES ||
    new TextEncoder().encode(text).byteLength > HOME_BOOTSTRAP_MAX_BYTES
  )
    return undefined
  try {
    const value: unknown = JSON.parse(text)
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const source = value as Record<string, unknown>
      if (
        source.version === 1 &&
        source.project === import.meta.env.VITE_SUPABASE_URL
      )
        return source.value
    }
  } catch {
    /* Preserve the ordinary Home RPC and its error handling. */
  }
  return undefined
}
