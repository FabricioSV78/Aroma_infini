import { cachedPublicQuery, forgetInvalidPublicQuery, seedInitialPublicQuery } from './public-query-cache'

/** Editorial metadata only. No prices, stock, account data or authorization.
 * A forced read supersedes an older pending read without extending its TTL. */
export function createPublicDocumentCache<T>(
  key: string,
  read: () => Promise<unknown>,
  confirm: (value: unknown) => T,
  snapshot: () => T,
) {
  let revision = 0
  let confirmedRaw: unknown
  let hasConfirmed = false
  let forced: Promise<T> | undefined
  function accept(raw: unknown) {
    if (hasConfirmed && raw === confirmedRaw) return snapshot()
    const value = confirm(raw)
    confirmedRaw = raw
    hasConfirmed = true
    return value
  }
  async function load(force = false): Promise<T> {
    if (force) {
      if (forced) return forced
      revision++
      const operation = load()
      forced = operation
      void operation.finally(() => {
        if (forced === operation) forced = undefined
      }).catch(() => {})
      return operation
    }
    const expected = revision
    const cacheKey = `${key}:${expected}`
    const raw = await cachedPublicQuery(cacheKey, read, 30000)
    if (expected !== revision) return load()
    try { return accept(raw) }
    catch (error) {
      forgetInvalidPublicQuery(cacheKey, raw)
      throw error
    }
  }
  return {
    load,
    seed(raw: unknown, documentAgeMs: number) {
      const value = accept(raw)
      seedInitialPublicQuery(`${key}:${revision}`, raw, documentAgeMs, 30000)
      return value
    },
  }
}
