// Only explicitly public RPC projections belong here. Never use this for Auth,
// account data, authorization, admin reads, orders or transactional quotations.
const entries = new Map<string, { expires: number; value: unknown }>()
const inFlight = new Map<string, Promise<unknown>>()
let generation = 0
const lifetimeMs = 5000
const invalidationListeners = new Set<(remote: boolean) => void>()
let channel: BroadcastChannel | undefined
let channelStarted = false

function listenForPublications() {
  if (channelStarted || typeof window === 'undefined') return
  channelStarted = true
  if (typeof BroadcastChannel === 'undefined') return
  try {
    channel = new BroadcastChannel(
      `aroma-public-publication:${import.meta.env.VITE_SUPABASE_URL ?? 'local'}`,
    )
    channel.onmessage = (event: MessageEvent<unknown>) => {
      // A signal only: never receive content, identity, prices or permissions.
      if (event.data !== 'publication-v1') return
      clearPublicQueries(true)
    }
  } catch {
    // TTL and focus/navigation revalidation remain available without channels.
  }
}

function clearPublicQueries(remote: boolean) {
  generation++
  entries.clear()
  inFlight.clear()
  invalidationListeners.forEach((listener) => listener(remote))
}

export function subscribePublicQueryInvalidation(
  listener: (remote: boolean) => void,
) {
  listenForPublications()
  invalidationListeners.add(listener)
  return () => { invalidationListeners.delete(listener) }
}

function remember(key: string, value: unknown, expires: number) {
  if (entries.size >= 40) entries.delete(entries.keys().next().value!)
  entries.set(key, { value, expires })
}

/** A validated anonymous document projection joins the existing cache, without
 * restarting its freshness window or replacing a newer/pending server read. */
export function seedInitialPublicQuery(
  key: string,
  value: unknown,
  documentAgeMs: number,
  lifetime = lifetimeMs,
) {
  if (
    generation !== 0 ||
    !Number.isFinite(documentAgeMs) ||
    documentAgeMs < 0 ||
    !Number.isFinite(lifetime) || lifetime <= 0 || lifetime > 30000 ||
    documentAgeMs >= lifetime ||
    inFlight.has(key) ||
    (entries.get(key)?.expires ?? 0) > Date.now()
  )
    return false
  remember(key, value, Date.now() + lifetime - documentAgeMs)
  return true
}

/** Public projections can coordinate dependencies without retaining old epochs. */
export function publicQueryCacheGeneration() {
  return generation
}

/** Parsing happens after dependency/version barriers. An invalid successful
 * HTTP payload must not poison its TTL or evict an unrelated newer response. */
export function forgetInvalidPublicQuery(key: string, value: unknown) {
  if (entries.get(key)?.value === value) entries.delete(key)
}

export function invalidatePublicQueryCache(publish = false) {
  listenForPublications()
  clearPublicQueries(false)
  // Only confirmed writes publish. Refresh clocks never echo.
  if (publish) {
    try { channel?.postMessage('publication-v1') }
    catch { /* TTL revalidation remains available if messaging is disabled. */ }
  }
}

export async function cachedPublicQuery<T>(
  key: string,
  read: () => Promise<T>,
  lifetime = lifetimeMs,
): Promise<T> {
  listenForPublications()
  const cached = entries.get(key)
  if (cached && cached.expires > Date.now()) return cached.value as T
  const pending = inFlight.get(key)
  if (pending) return pending as Promise<T>
  const expected = generation
  const operation = read().then((value) => {
    if (expected !== generation) return cachedPublicQuery(key, read, lifetime)
    remember(key, value, Date.now() + lifetime)
    return value
  })
  inFlight.set(key, operation)
  void operation
    .finally(() => {
      if (inFlight.get(key) === operation) inFlight.delete(key)
    })
    .catch(() => {})
  return operation
}
