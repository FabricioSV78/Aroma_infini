import type { Product } from '../types/catalog'

export interface OlfactoryFamilyDefinition {
  value: string
  label: string
  aromaLabel: string
  active: boolean
  aliases: readonly string[]
  version?: number
  productCount?: number
}

/** Bootstrap vocabulary for the isolated local adapter; remote reads replace it. */
export const DEFAULT_OLFACTORY_FAMILIES: readonly OlfactoryFamilyDefinition[] =
  [
    { value: 'amaderado', label: 'Amaderada', aromaLabel: 'Amaderado' },
    { value: 'floral', label: 'Floral', aromaLabel: 'Floral' },
    { value: 'verde', label: 'Verde', aromaLabel: 'Verde' },
    { value: 'ambar', label: 'Ámbar', aromaLabel: 'Ámbar' },
    { value: 'citrico', label: 'Cítrica', aromaLabel: 'Cítrico' },
    { value: 'aromatico', label: 'Aromática', aromaLabel: 'Aromático' },
    { value: 'fresco', label: 'Fresca', aromaLabel: 'Fresco' },
    { value: 'gourmand', label: 'Gourmand', aromaLabel: 'Gourmand' },
  ].map((family) => ({
    ...family,
    active: true,
    aliases: [],
    version: 1,
    productCount: 0,
  }))

export type OlfactoryFamily = string
export const MAX_PRODUCT_OLFACTORY_FAMILIES = 32
export const MAX_OLFACTORY_FAMILIES = 500

// Public metadata only, shared by parsers and synchronous catalog consumers.
// Writes replace the complete validated vocabulary and notify through the
// existing repository/admin snapshots. Product records never add definitions.
export let OLFACTORY_FAMILIES: readonly OlfactoryFamilyDefinition[] =
  DEFAULT_OLFACTORY_FAMILIES

export function olfactoryFamilyKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim()
    .replace(/\s+/g, ' ')
}

export function olfactoryFamilyCode(value: string): string {
  return olfactoryFamilyKey(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function parseOlfactoryFamilyDefinitions(
  value: unknown,
  admin = false,
): OlfactoryFamilyDefinition[] {
  if (!Array.isArray(value) || value.length > MAX_OLFACTORY_FAMILIES)
    throw new Error('La lista de familias olfativas no es válida.')
  const codes = new Set<string>()
  return value.map((entry): OlfactoryFamilyDefinition => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error('Familia olfativa inválida.')
    const family = entry as Record<string, unknown>
    if (
      typeof family.value !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(family.value) ||
      family.value.length > 64 ||
      codes.has(family.value) ||
      typeof family.label !== 'string' ||
      !family.label.trim() ||
      family.label.length > 80 ||
      typeof family.aromaLabel !== 'string' ||
      !family.aromaLabel.trim() ||
      family.aromaLabel.length > 80 ||
      typeof family.active !== 'boolean' ||
      !Array.isArray(family.aliases) ||
      family.aliases.length > 100 ||
      family.aliases.some(
        (alias) =>
          typeof alias !== 'string' || !alias.trim() || alias.length > 80,
      ) ||
      (admin &&
        (typeof family.version !== 'number' ||
          !Number.isSafeInteger(family.version) ||
          family.version < 1 ||
          typeof family.productCount !== 'number' ||
          !Number.isSafeInteger(family.productCount) ||
          family.productCount < 0))
    )
      throw new Error('Familia olfativa inválida.')
    codes.add(family.value)
    return {
      value: family.value,
      label: family.label,
      aromaLabel: family.aromaLabel,
      active: family.active,
      aliases: family.aliases.map((alias) => String(alias)),
      ...(admin
        ? {
            version: family.version as number,
            productCount: family.productCount as number,
          }
        : {}),
    }
  })
}

export function replaceOlfactoryFamilies(
  value: readonly OlfactoryFamilyDefinition[],
): void {
  OLFACTORY_FAMILIES = parseOlfactoryFamilyDefinitions(value).map((family) =>
    Object.freeze(family),
  )
}

export function validateOlfactoryFamilyName(
  label: string,
  currentCode?: string,
): string | null {
  if (
    !label.trim() ||
    label.trim().length > 80 ||
    Array.from(label).some(
      (character) => character.charCodeAt(0) < 32 || character === ',',
    ) ||
    !olfactoryFamilyCode(label)
  )
    return 'Escribe un nombre de hasta 80 caracteres, sin comas.'
  const key = olfactoryFamilyKey(label)
  const code = olfactoryFamilyCode(label)
  if (
    OLFACTORY_FAMILIES.some(
      (family) =>
        family.value !== currentCode &&
        (family.value === code ||
          [family.label, family.aromaLabel, ...family.aliases].some(
            (alias) => olfactoryFamilyKey(alias) === key,
          )),
    )
  )
    return 'Ya existe una familia con ese nombre.'
  return null
}

export function isActiveOlfactoryFamily(value: string): boolean {
  return OLFACTORY_FAMILIES.some(
    (family) => family.value === value && family.active,
  )
}

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
  return olfactoryFamilyKey(value)
}

export function isOlfactoryFamily(value: unknown): value is OlfactoryFamily {
  return OLFACTORY_FAMILIES.some((family) => family.value === value)
}

/** Accept only a complete family label or identifier, never a note or product name. */
export function parseOlfactoryFamily(
  value: string,
): OlfactoryFamily | undefined {
  const key = normalizedFamilyText(value)
  const matched = OLFACTORY_FAMILIES.find(
    (family) =>
      family.value === key ||
      family.value === olfactoryFamilyCode(value) ||
      [family.label, family.aromaLabel, ...family.aliases].some(
        (label) => normalizedFamilyText(label) === key,
      ),
  )
  if (matched) return matched.value
  const original = familyAliases[key]
  return original && isOlfactoryFamily(original) ? original : undefined
}

/** A comma-separated Excel cell may contain several confirmed families. */
export function parseOlfactoryFamilies(
  value: string,
): OlfactoryFamily[] | null {
  if (!value.trim()) return []
  const parsed = value.split(',').map((part) => parseOlfactoryFamily(part))
  if (parsed.some((family) => !family)) return null
  if (
    new Set(parsed).size !== parsed.length ||
    parsed.length > MAX_PRODUCT_OLFACTORY_FAMILIES
  )
    return null
  return parsed as OlfactoryFamily[]
}

export function getOlfactoryFamilyLabel(value: OlfactoryFamily): string {
  return (
    OLFACTORY_FAMILIES.find((family) => family.value === value)?.label ?? value
  )
}

export function getOlfactoryAromaLabel(value: OlfactoryFamily): string {
  return (
    OLFACTORY_FAMILIES.find((family) => family.value === value)?.aromaLabel ??
    value
  )
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
      multiple.length > MAX_PRODUCT_OLFACTORY_FAMILIES ||
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
