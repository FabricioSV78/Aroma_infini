import {
  PUBLIC_INITIAL_CONTEXT_ID,
  PUBLIC_INITIAL_CONTEXT_MAX_AGE_MS,
  PUBLIC_INITIAL_CONTEXT_MAX_BYTES,
} from '../domain/public-initial-context'
import { publicQueryCacheGeneration } from './public-query-cache'
let initial: Record<string, unknown> | null | undefined
/** Only the current anonymous HTML response, consumed once. Never storage,
 * an edge cache, a private session or a replacement for transactional quotes. */
export function takePublicInitialContext(
  kind: 'home' | 'browse' | 'settings',
  key?: string,
): unknown {
  if (typeof document === 'undefined') return undefined
  const element = document.getElementById(PUBLIC_INITIAL_CONTEXT_ID)
  if (
    performance.now() > PUBLIC_INITIAL_CONTEXT_MAX_AGE_MS ||
    publicQueryCacheGeneration() !== 0
  ) {
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
      text.length > PUBLIC_INITIAL_CONTEXT_MAX_BYTES ||
      new TextEncoder().encode(text).byteLength >
        PUBLIC_INITIAL_CONTEXT_MAX_BYTES
    )
      return undefined
    try {
      const source: unknown = JSON.parse(text)
      if (source && typeof source === 'object' && !Array.isArray(source)) {
        const envelope = source as Record<string, unknown>
        if (
          envelope.version === 1 &&
          envelope.project === import.meta.env.VITE_SUPABASE_URL &&
          envelope.path === location.pathname + location.search &&
          envelope.values &&
          typeof envelope.values === 'object' &&
          !Array.isArray(envelope.values)
        )
          initial = envelope.values as Record<string, unknown>
      }
    } catch {
      /* Ordinary anonymous RPC remains the fallback. */
    }
  }
  const value = initial?.[kind]
  if (initial) Reflect.deleteProperty(initial, kind)
  if (kind !== 'browse') return value
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined
  const query = value as Record<string, unknown>
  return query.key === key ? query.value : undefined
}
