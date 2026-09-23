import type { Brand, CartItem, Product, ProductVariant } from '../types/catalog'
import {
  getShippingSettings,
  getStoreBrands,
  getStoreProducts,
} from './admin-service'

export interface FavoriteProduct {
  product: Product
  brand: Brand | undefined
}

export type ResolvedCartLine =
  | {
      kind: 'ready'
      item: CartItem
      product: Product
      variant: ProductVariant
      brand: Brand | undefined
      subtotalCents: number
      needsAttention: boolean
    }
  | {
      kind: 'missing'
      item: CartItem
    }

export interface ResolvedCart {
  lines: ResolvedCartLine[]
  subtotalCents: number
  quantity: number
  needsAttention: boolean
}

export function getFreeShippingThresholdCents() {
  return getShippingSettings().freeThresholdCents
}

export function resolveFavoriteProducts(ids: readonly string[]) {
  const products = getStoreProducts()
  const brands = getStoreBrands()
  const found: FavoriteProduct[] = []
  const missingIds: string[] = []
  for (const id of ids) {
    const product = products.find((candidate) => candidate.id === id)
    if (!product) {
      missingIds.push(id)
      continue
    }
    found.push({
      product,
      brand: brands.find((candidate) => candidate.id === product.brandId),
    })
  }
  return { found, missingIds }
}

export function resolveCart(items: readonly CartItem[]): ResolvedCart {
  const products = getStoreProducts()
  const brands = getStoreBrands()
  const lines = items.map<ResolvedCartLine>((item) => {
    const product = products.find((candidate) =>
      candidate.variants.some((variant) => variant.id === item.variantId),
    )
    const variant = product?.variants.find(
      (candidate) =>
        candidate.id === item.variantId && candidate.active !== false,
    )
    if (!product || !variant) return { kind: 'missing', item }
    return {
      kind: 'ready',
      item,
      product,
      variant,
      brand: brands.find((candidate) => candidate.id === product.brandId),
      subtotalCents: variant.priceCents * item.quantity,
      needsAttention: variant.stock === 0 || item.quantity > variant.stock,
    }
  })
  return {
    lines,
    subtotalCents: lines.reduce(
      (total, line) => total + (line.kind === 'ready' ? line.subtotalCents : 0),
      0,
    ),
    quantity: items.reduce((total, item) => total + item.quantity, 0),
    needsAttention: lines.some(
      (line) => line.kind === 'missing' || line.needsAttention,
    ),
  }
}
