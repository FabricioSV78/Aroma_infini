import type { Brand, CartItem, Product, ProductVariant } from '../types/catalog'
import {
  getShippingSettings,
  getStoreBrands,
  getStoreProducts,
} from './admin-service'
import { getVariantPrice } from './product-discounts'

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
      unitPriceCents: number
      originalUnitPriceCents: number
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
  productDiscountCents: number
  quantity: number
  needsAttention: boolean
}

function firstById<T extends { id: string }>(items: readonly T[]) {
  const index = new Map<string, T>()
  for (const item of items) {
    if (!index.has(item.id)) index.set(item.id, item)
  }
  return index
}

export function getFreeShippingThresholdCents() {
  return getShippingSettings().freeThresholdCents
}

export function resolveFavoriteProducts(ids: readonly string[]) {
  if (!ids.length) return { found: [], missingIds: [] }
  const products = firstById(getStoreProducts())
  const brands = firstById(getStoreBrands())
  const found: FavoriteProduct[] = []
  const missingIds: string[] = []
  for (const id of ids) {
    const product = products.get(id)
    if (!product) {
      missingIds.push(id)
      continue
    }
    found.push({
      product,
      brand: brands.get(product.brandId),
    })
  }
  return { found, missingIds }
}

export function resolveCart(items: readonly CartItem[]): ResolvedCart {
  if (!items.length)
    return {
      lines: [],
      subtotalCents: 0,
      productDiscountCents: 0,
      quantity: 0,
      needsAttention: false,
    }
  const products = getStoreProducts()
  const brands = firstById(getStoreBrands())
  const variants = new Map<
    string,
    { product: Product; variant: ProductVariant | undefined }
  >()
  for (const product of products) {
    for (const variant of product.variants) {
      const firstMatch = variants.get(variant.id)
      if (!firstMatch) {
        variants.set(variant.id, {
          product,
          variant: variant.active !== false ? variant : undefined,
        })
      } else if (
        firstMatch.product === product &&
        !firstMatch.variant &&
        variant.active !== false
      ) {
        // Legacy duplicate IDs still resolve within the first matching product.
        firstMatch.variant = variant
      }
    }
  }
  const lines = items.map<ResolvedCartLine>((item) => {
    const { product, variant } = variants.get(item.variantId) ?? {}
    if (!product || !variant) return { kind: 'missing', item }
    const price = getVariantPrice(product, variant)
    return {
      kind: 'ready',
      item,
      product,
      variant,
      brand: brands.get(product.brandId),
      unitPriceCents: price.finalCents,
      originalUnitPriceCents: price.originalCents,
      subtotalCents: price.finalCents * item.quantity,
      needsAttention: variant.stock === 0 || item.quantity > variant.stock,
    }
  })
  return {
    lines,
    subtotalCents: lines.reduce(
      (total, line) => total + (line.kind === 'ready' ? line.subtotalCents : 0),
      0,
    ),
    productDiscountCents: lines.reduce(
      (total, line) =>
        total +
        (line.kind === 'ready'
          ? (line.originalUnitPriceCents - line.unitPriceCents) *
            line.item.quantity
          : 0),
      0,
    ),
    quantity: items.reduce((total, item) => total + item.quantity, 0),
    needsAttention: lines.some(
      (line) => line.kind === 'missing' || line.needsAttention,
    ),
  }
}
