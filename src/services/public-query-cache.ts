// Only explicitly public RPC projections belong here. Never use this for Auth,
// account data, authorization, admin reads, orders or transactional quotations.
const entries = new Map<string, { expires: number; value: unknown }>()
const inFlight = new Map<string, Promise<unknown>>()
let generation = 0

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
  lifetime = 5000,
): Promise<T> {
  const cached = entries.get(key)
  if (cached && cached.expires > Date.now()) return cached.value as T
  const pending = inFlight.get(key)
  if (pending) return pending as Promise<T>
  const expected = generation
  const operation = read().then((value) => {
    if (expected !== generation) return cachedPublicQuery(key, read, lifetime)
    if (entries.size >= 40) entries.delete(entries.keys().next().value!)
    entries.set(key, { value, expires: Date.now() + lifetime })
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
