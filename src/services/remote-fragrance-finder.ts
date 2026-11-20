import type { FinderAnswers } from '../types/fragrance-finder'
import { parseManagedMediaAsset, parseManagedMediaPath } from '../domain/media'
import {
  parseOlfactoryFamilyDefinitions,
  replaceOlfactoryFamilies,
} from '../domain/olfactory-family'
import { rememberManagedAssets } from './media-registry'
import {
  CatalogReadError,
  parseCatalogBrand,
  parseCatalogProduct,
} from './supabase-storefront'
import { requireReadySupabaseClient } from './supabase-client'
import {
  recommendFragrances,
  type FinderRecord,
  type FinderSnapshot,
} from './fragrance-matching'

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new CatalogReadError()
  return value as Record<string, unknown>
}

/** Validate the compact projection without inventing unused detail fields or
 * exposing it as a complete storefront snapshot to other routes. */
export function parseFinderCatalogContext(value: unknown): FinderSnapshot {
  const source = object(value)
  if (
    !Array.isArray(source.items) ||
    source.items.length > 10000 ||
    !Array.isArray(source.brands) ||
    source.brands.length > 10000 ||
    !Array.isArray(source.mediaAssets) ||
    source.mediaAssets.length > 10000 ||
    !Number.isSafeInteger(source.total) ||
    source.total !== source.items.length
  )
    throw new CatalogReadError()
  const families = parseOlfactoryFamilyDefinitions(source.olfactoryFamilies)
  const familyCodes = new Set(families.map((family) => family.value))
  const brands = source.brands.map(parseCatalogBrand)
  const brandIds = new Set(brands.map((brand) => brand.id))
  if (brandIds.size !== brands.length) throw new CatalogReadError()
  const assets = source.mediaAssets.map(parseManagedMediaAsset)
  const bySource = new Map(assets.map((asset) => [asset.src, asset]))
  if (new Set(assets.map((asset) => asset.id)).size !== assets.length)
    throw new CatalogReadError()
  const products = source.items.map((value): FinderRecord => {
    const record = object(value),
      detail = object(record.detail)
    const product = parseCatalogProduct(record.product, false, familyCodes)
    const level = detail.intensityLevel
    const intensity =
      level === 1
        ? 'Suave'
        : level === 2
          ? 'Moderada'
          : level === 3
            ? 'Intensa'
            : null
    if (
      product.productType !== 'perfume' ||
      !brandIds.has(product.brandId) ||
      !product.variants.some(
        (variant) =>
          variant.active && variant.stock > 0 && (variant.ml ?? 0) > 0,
      ) ||
      (level !== null && level !== 1 && level !== 2 && level !== 3) ||
      detail.intensity !== intensity ||
      typeof detail.occasion !== 'string' ||
      detail.occasion.length > 1000 ||
      (parseManagedMediaPath(product.image) && !bySource.has(product.image))
    )
      throw new CatalogReadError()
    return { product, detail: { occasion: detail.occasion, intensity } }
  })
  if (
    new Set(products.map((record) => record.product.id)).size !==
    products.length
  )
    throw new CatalogReadError()
  const images = new Set(products.map((record) => record.product.image))
  if (assets.some((asset) => !images.has(asset.src)))
    throw new CatalogReadError()
  // Publish vocabulary/manifests only after the entire response passed. No
  // partial products, authorization result, price or stock cache is populated.
  rememberManagedAssets(source.mediaAssets)
  replaceOlfactoryFamilies(families)
  return { products, brands }
}

export async function readRemoteFinderRecommendations(answers: FinderAnswers) {
  // Each submission gets current public variants/offers in one SQL snapshot.
  // Do not reuse the Home option cache as a price or availability decision.
  const { data, error } = await (
    await requireReadySupabaseClient()
  ).rpc('catalog_finder_context')
  if (error) throw new CatalogReadError()
  return recommendFragrances(parseFinderCatalogContext(data), answers)
}
