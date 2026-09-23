const STORAGE_KEY = 'aroma-infini:favorites:v1'
const STORAGE_VERSION = 1
const MAX_FAVORITES = 500
const MAX_PRODUCT_ID_LENGTH = 128

interface StoredFavorites {
  version: typeof STORAGE_VERSION
  ids: string[]
}

export function parseStoredFavorites(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('version' in parsed) ||
      parsed.version !== STORAGE_VERSION ||
      !('ids' in parsed) ||
      !Array.isArray(parsed.ids)
    )
      return []
    const ids = new Set<string>()
    for (const id of parsed.ids) {
      if (
        typeof id !== 'string' ||
        id.length === 0 ||
        id.length > MAX_PRODUCT_ID_LENGTH
      )
        continue
      ids.add(id)
      if (ids.size >= MAX_FAVORITES) break
    }
    return [...ids]
  } catch {
    return []
  }
}

export function readFavorites() {
  return parseStoredFavorites(window.localStorage.getItem(STORAGE_KEY))
}

export function writeFavorites(ids: string[]) {
  const stored: StoredFavorites = { version: STORAGE_VERSION, ids }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
}

export function isFavoritesStorageEvent(event: StorageEvent) {
  return (
    event.storageArea === window.localStorage &&
    (event.key === STORAGE_KEY || event.key === null)
  )
}
