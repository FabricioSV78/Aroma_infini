import type { ProductVariant } from '../types/catalog'
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

export const finderWeights = { family: 5, occasion: 3, intensity: 2 } as const

export function normalizeFinderValue(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .trim()
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
): ProductVariant[] {
  return variants
    .filter(
      (variant) =>
        variant.active !== false &&
        Number.isFinite(variant.stock) &&
        variant.stock > 0 &&
        Number.isSafeInteger(variant.priceCents) &&
        variant.priceCents > 0 &&
        Number.isFinite(variant.ml) &&
        variant.ml > 0 &&
        (budgetCents === undefined || variant.priceCents <= budgetCents),
    )
    .sort(
      (a, b) =>
        a.priceCents - b.priceCents || a.ml - b.ml || a.id.localeCompare(b.id),
    )
}

function availableRecords(
  snapshot: StorefrontSnapshot,
): StorefrontProductRecord[] {
  const brands = new Set(snapshot.brands.map((brand) => brand.id))
  // Publication is owned by the repository, and availability by variant stock.
  return snapshot.products.filter(
    (record) =>
      brands.has(record.product.brandId) &&
      availableFinderVariants(record.product.variants).length,
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
    // The leading family is already the editorial category entered in the panel.
    families: unique(
      records.flatMap(({ product }) =>
        profileParts(product.family).slice(0, 1),
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
  const hasPreferences = Boolean(
    answers.family || answers.occasion || answers.intensity,
  )
  if (!hasPreferences && !answers.budget)
    return { kind: 'preferences', matches: [] }
  const budget = answers.budget ? Number(answers.budget) : undefined
  // A malformed budget must never silently become an unlimited budget.
  if (budget !== undefined && (!Number.isSafeInteger(budget) || budget <= 0))
    return { kind: 'empty', matches: [] }
  const matches: FragranceMatch[] = []
  for (const { product, detail } of records) {
    const variant = availableFinderVariants(product.variants, budget)[0]
    if (!variant) continue
    const familyMatch = Boolean(
      answers.family &&
      profileParts(product.family).some(
        (part) => part.value === answers.family,
      ),
    )
    // The chosen aroma is the anchor. Never substitute a different family just to fill results.
    if (answers.family && !familyMatch) continue
    const reasons: string[] = []
    const differences: string[] = []
    let score = 0
    if (familyMatch) {
      score += finderWeights.family
      reasons.push(`Perfil ${product.family.toLocaleLowerCase('es')}.`)
    }
    if (answers.occasion) {
      const moment = profileParts(detail.occasion).find(
        (part) => part.value === answers.occasion,
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
    if (answers.intensity) {
      if (normalizeFinderValue(detail.intensity) === answers.intensity) {
        score += finderWeights.intensity
        reasons.push(`Intensidad ${detail.intensity.toLocaleLowerCase('es')}.`)
      } else
        differences.push(
          detail.intensity
            ? `Intensidad de la ficha: ${detail.intensity.toLocaleLowerCase('es')}.`
            : 'La ficha no indica la intensidad.',
        )
    }
    if (hasPreferences && score === 0) continue
    if (budget !== undefined)
      reasons.push(
        `${variant.ml} ml por ${formatPEN(variant.priceCents)}, dentro de tu presupuesto.`,
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
      a.variant.priceCents - b.variant.priceCents ||
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
