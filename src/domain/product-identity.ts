/** Variant-level identifier shared by manual editing and Excel imports. */
export function normalizeSku(value: string): string {
  return value.trim().toUpperCase()
}

export function isValidSku(value: string): boolean {
  return /^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(normalizeSku(value))
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
