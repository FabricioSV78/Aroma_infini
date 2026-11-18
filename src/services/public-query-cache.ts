// Only explicitly public RPC projections belong here. Never use this for Auth,
// account data, authorization, admin reads, orders or transactional quotations.
const entries = new Map<string, { expires: number; value: unknown }>()
const inFlight = new Map<string, Promise<unknown>>()
let generation = 0
const lifetimeMs = 5000

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
) {
  if (
    generation !== 0 ||
    !Number.isFinite(documentAgeMs) ||
    documentAgeMs < 0 ||
    documentAgeMs >= lifetimeMs ||
    inFlight.has(key) ||
    (entries.get(key)?.expires ?? 0) > Date.now()
  )
    return false
  remember(key, value, Date.now() + lifetimeMs - documentAgeMs)
  return true
}

/** Public projections can coordinate dependencies without retaining old epochs. */
export function publicQueryCacheGeneration() {
  return generation
}

export function invalidatePublicQueryCache() {
  generation++
  entries.clear()
  inFlight.clear()
}

export async function cachedPublicQuery<T>(
  key: string,
  read: () => Promise<T>,
  lifetime = lifetimeMs,
): Promise<T> {
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
