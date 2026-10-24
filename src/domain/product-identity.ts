/** Variant-level identifier shared by manual editing and Excel imports. */
export function normalizeSku(value: string): string {
  return value.trim().toUpperCase()
}

export function isValidSku(value: string): boolean {
  return /^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(normalizeSku(value))
}

export function productSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
