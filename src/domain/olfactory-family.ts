import type { Product } from '../types/catalog'

/** Stable identifiers for catalog filters, saved products and future database rows. */
export const OLFACTORY_FAMILIES = [
  { value: 'amaderado', label: 'Amaderada', aromaLabel: 'Amaderado' },
  { value: 'floral', label: 'Floral', aromaLabel: 'Floral' },
  { value: 'verde', label: 'Verde', aromaLabel: 'Verde' },
  { value: 'ambar', label: 'Ámbar', aromaLabel: 'Ámbar' },
  { value: 'citrico', label: 'Cítrica', aromaLabel: 'Cítrico' },
  { value: 'aromatico', label: 'Aromática', aromaLabel: 'Aromático' },
  { value: 'fresco', label: 'Fresca', aromaLabel: 'Fresco' },
  { value: 'gourmand', label: 'Gourmand', aromaLabel: 'Gourmand' },
] as const

export type OlfactoryFamily = (typeof OLFACTORY_FAMILIES)[number]['value']

const familyAliases: Readonly<Record<string, OlfactoryFamily>> = {
  amaderado: 'amaderado',
  amaderada: 'amaderado',
  floral: 'floral',
  verde: 'verde',
  ambar: 'ambar',
  citrico: 'citrico',
  citrica: 'citrico',
  aromatico: 'aromatico',
  aromatica: 'aromatico',
  fresco: 'fresco',
  fresca: 'fresco',
  gourmand: 'gourmand',
}

function normalizedFamilyText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim()
}

export function isOlfactoryFamily(value: unknown): value is OlfactoryFamily {
  return OLFACTORY_FAMILIES.some((family) => family.value === value)
}

/** Accept only a complete family label or identifier, never a note or product name. */
export function parseOlfactoryFamily(
  value: string,
): OlfactoryFamily | undefined {
  return familyAliases[normalizedFamilyText(value)]
}

/** A comma-separated Excel cell may contain several confirmed families. */
export function parseOlfactoryFamilies(value: string): OlfactoryFamily[] | null {
  if (!value.trim()) return []
  const parsed = value.split(',').map((part) => parseOlfactoryFamily(part))
  if (parsed.some((family) => !family)) return null
  if (new Set(parsed).size !== parsed.length) return null
  return parsed as OlfactoryFamily[]
}

export function getOlfactoryFamilyLabel(value: OlfactoryFamily): string {
  return OLFACTORY_FAMILIES.find((family) => family.value === value)!.label
}

export function getOlfactoryAromaLabel(value: OlfactoryFamily): string {
  return OLFACTORY_FAMILIES.find((family) => family.value === value)!.aromaLabel
}

/** The primary label recorded in the legacy editorial profile, if recognized. */
export function getEditorialPrimaryFamily(
  profile: string,
): OlfactoryFamily | undefined {
  return parseOlfactoryFamily(profile.split('·', 1)[0] ?? '')
}

/**
 * Previously saved products have only `family`, an editorial profile such as
 * “Amaderado · fresco”. Its first, complete label was the recorded family.
 * New records use the explicit field; null deliberately means unclassified.
 */
export function getProductOlfactoryFamily(
  product: Pick<Product, 'olfactoryFamily' | 'family'> &
    Partial<Pick<Product, 'olfactoryFamilies'>>,
): OlfactoryFamily | undefined {
  if (product.olfactoryFamilies !== undefined) {
    return getProductOlfactoryFamilies(product)[0]
  }
  if (product.olfactoryFamily !== undefined) {
    return isOlfactoryFamily(product.olfactoryFamily)
      ? product.olfactoryFamily
      : undefined
  }
  return getEditorialPrimaryFamily(product.family)
}

/** Explicit multi-family data wins over the old single field and editorial fallback. */
export function getProductOlfactoryFamilies(
  product: Pick<Product, 'olfactoryFamily' | 'family'> &
    Partial<Pick<Product, 'olfactoryFamilies'>>,
): OlfactoryFamily[] {
  if (product.olfactoryFamilies !== undefined) {
    return Array.isArray(product.olfactoryFamilies)
      ? [...new Set(product.olfactoryFamilies.filter(isOlfactoryFamily))]
      : []
  }
  if (product.olfactoryFamily !== undefined) {
    return isOlfactoryFamily(product.olfactoryFamily)
      ? [product.olfactoryFamily]
      : []
  }
  const legacy = getEditorialPrimaryFamily(product.family)
  return legacy ? [legacy] : []
}

/** Keep administration and Excel validation aligned with storefront classification. */
export function validateProductOlfactoryClassification(
  product: Pick<Product, 'family' | 'olfactoryFamily'> &
    Partial<Pick<Product, 'olfactoryFamilies'>>,
): string | null {
  if (
    product.olfactoryFamily !== undefined &&
    product.olfactoryFamily !== null &&
    !isOlfactoryFamily(product.olfactoryFamily)
  ) {
    return 'Selecciona familias olfativas válidas o déjalas sin clasificar.'
  }
  const multiple = product.olfactoryFamilies
  if (
    multiple !== undefined &&
    multiple !== null &&
    (!Array.isArray(multiple) ||
      multiple.some((family) => !isOlfactoryFamily(family)) ||
      new Set(multiple).size !== multiple.length)
  ) {
    return 'Selecciona familias olfativas válidas, sin repetir opciones.'
  }
  const selected = getProductOlfactoryFamilies(product)
  if (
    multiple !== undefined &&
    product.olfactoryFamily !== undefined &&
    product.olfactoryFamily !== (selected[0] ?? null)
  ) {
    return 'Revisa la familia olfativa principal del producto.'
  }
  const editorial = getEditorialPrimaryFamily(product.family)
  if (editorial && selected.length && !selected.includes(editorial)) {
    return 'La familia olfativa no coincide con el perfil aromático breve. Revisa ambos datos.'
  }
  return null
}
