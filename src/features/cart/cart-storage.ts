import type { CartItem } from '../../types/catalog'

const STORAGE_KEY = 'aroma-infini:cart:v1'
const STORAGE_VERSION = 1
const MAX_CART_LINES = 500
const MAX_VARIANT_ID_LENGTH = 128

interface StoredCart {
  version: typeof STORAGE_VERSION
  items: CartItem[]
}

export function parseStoredCart(value: string | null): CartItem[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('version' in parsed) ||
      parsed.version !== STORAGE_VERSION ||
      !('items' in parsed) ||
      !Array.isArray(parsed.items)
    )
      return []
    const quantities = new Map<string, number>()
    for (const item of parsed.items) {
      if (
        !item ||
        typeof item !== 'object' ||
        !('variantId' in item) ||
        typeof item.variantId !== 'string' ||
        item.variantId.length === 0 ||
        item.variantId.length > MAX_VARIANT_ID_LENGTH ||
        !('quantity' in item) ||
        typeof item.quantity !== 'number' ||
        !Number.isFinite(item.quantity) ||
        item.quantity < 1
      )
        continue
      const quantity = Math.min(99, Math.floor(item.quantity))
      quantities.set(
        item.variantId,
        Math.min(99, (quantities.get(item.variantId) ?? 0) + quantity),
      )
      if (quantities.size >= MAX_CART_LINES) break
    }
    return [...quantities].map(([variantId, quantity]) => ({
      variantId,
      quantity,
    }))
  } catch {
    return []
  }
}

export function readCart() {
  return parseStoredCart(window.localStorage.getItem(STORAGE_KEY))
}

export function writeCart(items: CartItem[]) {
  const stored: StoredCart = { version: STORAGE_VERSION, items }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
}

export function isCartStorageEvent(event: StorageEvent) {
  return (
    event.storageArea === window.localStorage &&
    (event.key === STORAGE_KEY || event.key === null)
  )
}
