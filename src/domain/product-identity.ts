/** Variant-level identifier shared by manual editing and Excel imports. */
export function normalizeSku(value: string): string {
  return value.trim().toUpperCase()
}

export function isValidSku(value: string): boolean {
  return /^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(normalizeSku(value))
}

export const FIRST_VARIANT_SKU = 1000

interface VariantSkuRecord {
  id: string
  sku?: string
}

/** Plan the whole operation first, so later manual SKUs also reserve their codes. */
export function planVariantSkus(
  variants: readonly VariantSkuRecord[],
  existing: readonly VariantSkuRecord[],
  nextVariantSku = FIRST_VARIANT_SKU,
): { skus: string[]; nextVariantSku: number } | null {
  const previous = new Map(
    existing.map((variant) => [variant.id, normalizeSku(variant.sku ?? '')]),
  )
  const ids = new Set(variants.map((variant) => variant.id))
  const used = new Set(
    existing.map((variant) => normalizeSku(variant.sku ?? '')),
  )
  const otherSkus = new Set(
    existing
      .filter((variant) => !ids.has(variant.id))
      .map((variant) => normalizeSku(variant.sku ?? ''))
      .filter(Boolean),
  )
  const skus = variants.map(
    (variant) =>
      normalizeSku(variant.sku ?? '') || previous.get(variant.id) || '',
  )
  const requested = new Set<string>()
  for (const sku of skus) {
    if (!sku) continue
    if (!isValidSku(sku) || requested.has(sku) || otherSkus.has(sku))
      return null
    requested.add(sku)
    used.add(sku)
  }
  let next =
    Number.isSafeInteger(nextVariantSku) && nextVariantSku >= FIRST_VARIANT_SKU
      ? nextVariantSku
      : FIRST_VARIANT_SKU
  for (let index = 0; index < skus.length; index++) {
    if (skus[index]) continue
    while (Number.isSafeInteger(next) && used.has(String(next))) next++
    if (!Number.isSafeInteger(next) || next >= Number.MAX_SAFE_INTEGER)
      return null
    skus[index] = String(next)
    used.add(skus[index])
    next++
  }
  return { skus, nextVariantSku: next }
}

/** Internal product codes remain separate from commercial presentation SKUs. */
export function variantSkuSummary(
  variants: readonly { sku?: string }[],
): string {
  const skus = variants.map((variant) => variant.sku).filter(Boolean)
  if (!skus.length) return 'SKU pendiente'
  return `SKU ${skus.slice(0, 2).join(', ')}${skus.length > 2 ? ` +${skus.length - 2}` : ''}`
}

export const FIRST_PRODUCT_SKU = 10000
export const LAST_PRODUCT_SKU = 99999

export function isProductSku(value: unknown): value is string {
  return typeof value === 'string' && /^[1-9]\d{4}$/.test(value)
}

/**
 * Preserve valid legacy codes and fill gaps without reusing an issued code.
 * The returned counter belongs in the same transaction as the products.
 * Variant merchant SKUs have a separate namespace and remain untouched.
 */
export function planProductSkus(
  products: readonly { sku?: string }[],
  nextProductSku = FIRST_PRODUCT_SKU,
): { skus: string[]; nextProductSku: number } | null {
  const used = new Set<string>()
  let next =
    Number.isInteger(nextProductSku) && nextProductSku >= FIRST_PRODUCT_SKU
      ? nextProductSku
      : FIRST_PRODUCT_SKU
  const skus = products.map(({ sku }) => {
    if (!isProductSku(sku) || used.has(sku)) return ''
    used.add(sku)
    next = Math.max(next, Number(sku) + 1)
    return sku
  })
  for (let index = 0; index < skus.length; index += 1) {
    if (skus[index]) continue
    if (next > LAST_PRODUCT_SKU) return null
    skus[index] = String(next)
    next += 1
  }
  return { skus, nextProductSku: next }
}

export function productSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
