import type { ProductVariant } from '../types/catalog'

export function getProductPresentation(variants: readonly ProductVariant[]) {
  const active = variants.filter((variant) => variant.active !== false)
  const available = active.filter((variant) => variant.stock > 0)
  const inStock = available.length > 0
  const visibleVariants = inStock ? available : active
  const prices = visibleVariants.map((variant) => variant.priceCents)

  return {
    inStock,
    priceCents: prices.length ? Math.min(...prices) : null,
    showFrom: inStock && new Set(prices).size > 1,
    variants: visibleVariants,
  }
}
