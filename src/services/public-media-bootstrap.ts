import {
  PUBLIC_MEDIA_BOOTSTRAP_ID,
  PUBLIC_MEDIA_BOOTSTRAP_MAX_BYTES,
} from '../domain/public-media-bootstrap'
import { publicQueryCacheGeneration } from './public-query-cache'

let initial: Record<string, unknown> | null | undefined
/** Two consumers share only verified public image metadata from this document.
 * Each part is consumed once; forced reads and invalidations use normal RPCs. */
export function takeInitialPublicMedia(kind: 'document' | 'aliases'): unknown {
  if (typeof document === 'undefined') return undefined
  const element = document.getElementById(PUBLIC_MEDIA_BOOTSTRAP_ID)
  if (performance.now() > 30000 || publicQueryCacheGeneration() !== 0) {
    element?.remove()
    initial = null
    return undefined
  }
  if (initial === undefined) {
    initial = null
    if (!element) return undefined
    const text = element.textContent ?? ''
    element.remove()
    if (
      element.tagName !== 'SCRIPT' ||
      element.getAttribute('type') !== 'application/json' ||
      text.length > PUBLIC_MEDIA_BOOTSTRAP_MAX_BYTES ||
      new TextEncoder().encode(text).byteLength >
        PUBLIC_MEDIA_BOOTSTRAP_MAX_BYTES
    )
      return undefined
    try {
      const value: unknown = JSON.parse(text)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const envelope = value as Record<string, unknown>
        if (
          envelope.version === 1 &&
          envelope.project === import.meta.env.VITE_SUPABASE_URL
        )
          initial = envelope
      }
    } catch {
      /* Both consumers fall back to their existing public RPCs. */
    }
  }
  const value = initial?.[kind]
  if (initial) Reflect.deleteProperty(initial, kind)
  return value
}
