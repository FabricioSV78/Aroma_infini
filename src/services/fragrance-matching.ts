import type { Product, ProductVariant } from '../types/catalog'
import { isPerfume } from '../domain/product-type'
import type {
  FinderAnswers,
  FinderOption,
  FinderOptions,
  FinderResult,
  FragranceMatch,
} from '../types/fragrance-finder'
import type {
  StorefrontSnapshot,
  StorefrontProductRecord,
} from './storefront-repository'
import { formatPEN } from './currency'
import { getVariantPrice } from './product-discounts'
import {
  getOlfactoryAromaLabel,
  getProductOlfactoryFamilies,
} from '../domain/olfactory-family'

export const finderWeights = { family: 5, occasion: 3, intensity: 2 } as const

export function normalizeFinderValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Accept old single-choice answers at runtime while the UI moves to arrays. */
function selectedValues(value: unknown): Set<string> {
  const raw = Array.isArray(value) ? value : [value]
  return new Set(
    raw
      .filter((item): item is string => typeof item === 'string')
      .map(normalizeFinderValue)
      .filter(Boolean),
  )
}

/** Match full labels, never substrings, inferred notes or personality stereotypes. */
export function profileParts(value: string): FinderOption[] {
  return value
    .replace(/\bn\/a\b/gi, '')
    .split(/[·,;/|]/)
    .map((label) => label.trim())
    .filter(
      (label) =>
        Boolean(label) &&
        !/^(por definir|pendiente|sin definir|n\/?a|[-—–])$/i.test(label),
    )
    .map((label) => ({
      value: normalizeFinderValue(label),
      label: label.charAt(0).toLocaleUpperCase('es') + label.slice(1),
    }))
}

export function availableFinderVariants(
  variants: readonly ProductVariant[],
  budgetCents?: number,
  product?: Product,
): ProductVariant[] {
  const finalPrice = (variant: ProductVariant) =>
    product ? getVariantPrice(product, variant).finalCents : variant.priceCents
  return variants
    .filter(
      (variant) =>
        variant.active !== false &&
        Number.isFinite(variant.stock) &&
        variant.stock > 0 &&
        Number.isSafeInteger(variant.priceCents) &&
        variant.priceCents > 0 &&
        Number.isFinite(variant.ml) &&
        (variant.ml ?? 0) > 0 &&
        (budgetCents === undefined || finalPrice(variant) <= budgetCents),
    )
    .sort(
      (a, b) =>
        finalPrice(a) - finalPrice(b) ||
        (a.ml ?? 0) - (b.ml ?? 0) ||
        a.id.localeCompare(b.id),
    )
}

function availableRecords(
  snapshot: StorefrontSnapshot,
): StorefrontProductRecord[] {
  const brands = new Set(snapshot.brands.map((brand) => brand.id))
  // Publication is owned by the repository, and availability by variant stock.
  return snapshot.products.filter(
    (record) =>
      isPerfume(record.product) &&
      brands.has(record.product.brandId) &&
      availableFinderVariants(
        record.product.variants,
        undefined,
        record.product,
      ).length,
  )
}

export function getFinderOptions(snapshot: StorefrontSnapshot): FinderOptions {
  const records = availableRecords(snapshot)
  function unique(options: FinderOption[]): FinderOption[] {
    return [
      ...new Map(options.map((option) => [option.value, option])).values(),
    ].sort((a, b) => a.label.localeCompare(b.label, 'es'))
  }
  return {
    families: unique(
      records.flatMap(({ product }) =>
        getProductOlfactoryFamilies(product).map((family) => ({
          value: family,
          label: getOlfactoryAromaLabel(family),
        })),
      ),
    ),
    occasions: unique(
      records.flatMap(({ detail }) => profileParts(detail.occasion)),
    ),
    intensities: ['Suave', 'Moderada', 'Intensa']
      .filter((label) =>
        records.some(({ detail }) => detail.intensity === label),
      )
      .map((label) => ({ value: normalizeFinderValue(label), label })),
    availableCount: records.length,
  }
}

export function recommendFragrances(
  snapshot: StorefrontSnapshot,
  answers: FinderAnswers,
): FinderResult {
  const records = availableRecords(snapshot)
  if (!records.length) return { kind: 'unavailable', matches: [] }
  const selected = {
    family: selectedValues(answers.family),
    occasion: selectedValues(answers.occasion),
    intensity: selectedValues(answers.intensity),
  }
  const hasPreferences = Object.values(selected).some((values) => values.size)
  if (!hasPreferences && !answers.budget)
    return { kind: 'preferences', matches: [] }
  const budget = answers.budget ? Number(answers.budget) : undefined
  // A malformed budget must never silently become an unlimited budget.
  if (budget !== undefined && (!Number.isSafeInteger(budget) || budget <= 0))
    return { kind: 'empty', matches: [] }
  const matches: FragranceMatch[] = []
  for (const { product, detail } of records) {
    const variant = availableFinderVariants(
      product.variants,
      budget,
      product,
    )[0]
    if (!variant) continue
    const matchedFamily = getProductOlfactoryFamilies(product).find((family) =>
      selected.family.has(family),
    )
    const familyMatch = Boolean(matchedFamily)
    // The chosen aromas are the anchor. A product must match at least one of them.
    if (selected.family.size && !familyMatch) continue
    const reasons: string[] = []
    const differences: string[] = []
    let score = 0
    if (familyMatch && matchedFamily) {
      score += finderWeights.family
      reasons.push(
        `Perfil ${getOlfactoryAromaLabel(matchedFamily).toLocaleLowerCase('es')}.`,
      )
    }
    if (selected.occasion.size) {
      const moment = profileParts(detail.occasion).find((part) =>
        selected.occasion.has(part.value),
      )
      if (moment) {
        score += finderWeights.occasion
        reasons.push(
          `Momento indicado: ${moment.label.toLocaleLowerCase('es')}.`,
        )
      } else
        differences.push(
          profileParts(detail.occasion).length
            ? `Momento de la ficha: ${detail.occasion.toLocaleLowerCase('es')}.`
            : 'La ficha no indica un momento de uso.',
        )
    }
    if (selected.intensity.size) {
      if (
        selected.intensity.has(normalizeFinderValue(detail.intensity ?? ''))
      ) {
        score += finderWeights.intensity
        reasons.push(
          `Intensidad ${(detail.intensity ?? '').toLocaleLowerCase('es')}.`,
        )
      } else
        differences.push(
          detail.intensity
            ? `Intensidad de la ficha: ${(detail.intensity ?? '').toLocaleLowerCase('es')}.`
            : 'La ficha no indica la intensidad.',
        )
    }
    if (hasPreferences && score === 0) continue
    if (budget !== undefined)
      reasons.push(
        `${variant.ml} ml por ${formatPEN(getVariantPrice(product, variant).finalCents)}, dentro de tu presupuesto.`,
      )
    matches.push({
      product,
      brand: snapshot.brands.find((brand) => brand.id === product.brandId),
      variant,
      reasons,
      differences,
      score,
      complete: differences.length === 0,
    })
  }
  matches.sort(
    (a, b) =>
      Number(b.complete) - Number(a.complete) ||
      b.score - a.score ||
      getVariantPrice(a.product, a.variant).finalCents -
        getVariantPrice(b.product, b.variant).finalCents ||
      a.product.name.localeCompare(b.product.name, 'es') ||
      a.product.id.localeCompare(b.product.id),
  )
  if (!matches.length) return { kind: 'empty', matches: [] }
  if (!hasPreferences) return { kind: 'budget', matches: matches.slice(0, 3) }
  const complete = matches.filter((match) => match.complete)
  return complete.length
    ? { kind: 'matches', matches: complete.slice(0, 3) }
    : { kind: 'partial', matches: matches.slice(0, 3) }
}
