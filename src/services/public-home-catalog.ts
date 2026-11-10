import type { Brand, ProductDetail } from '../types/catalog'
import {
  isOlfactoryFamily,
  MAX_PRODUCT_OLFACTORY_FAMILIES,
  replaceOlfactoryFamilies,
  type OlfactoryFamily,
} from '../domain/olfactory-family'
import {
  CatalogReadError,
  parseCatalogBrand,
  parseCatalogImage,
  parseCatalogProductRecord,
  parseCatalogSettings,
} from './supabase-storefront'
import { confirmPublicCatalogRecords } from './storefront-repository'
import { rememberManagedAssets } from './media-registry'
import { cachedPublicQuery } from './public-query-cache'
import { requireSupabaseClient } from './supabase-client'
import { getFinderOptionsFromProfiles } from './fragrance-matching'

interface HomeCatalogProfile {
  brandId: string
  family: string
  olfactoryFamilies: OlfactoryFamily[]
  occasion: string
  intensity: ProductDetail['intensity']
  finderAvailable: boolean
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new CatalogReadError()
  return value as Record<string, unknown>
}

function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length > maximum)
    throw new CatalogReadError()
  return value
}

function array(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new CatalogReadError()
  return value
}

function distinct<T>(values: T[]): T[] {
  if (new Set(values).size !== values.length) throw new CatalogReadError()
  return values
}

function parseProfile(value: unknown): HomeCatalogProfile {
  const source = object(value)
  const brandId = text(source.brandId, 36)
  if (
    brandId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      brandId,
    )
  )
    throw new CatalogReadError()
  if (
    typeof source.finderAvailable !== 'boolean' ||
    (source.intensity !== null &&
      source.intensity !== 'Suave' &&
      source.intensity !== 'Moderada' &&
      source.intensity !== 'Intensa')
  )
    throw new CatalogReadError()
  return {
    brandId,
    family: text(source.family, 1000),
    olfactoryFamilies: distinct(
      array(source.olfactoryFamilies, MAX_PRODUCT_OLFACTORY_FAMILIES).map(
        (family) => {
          if (!isOlfactoryFamily(family)) throw new CatalogReadError()
          return family
        },
      ),
    ),
    occasion: text(source.occasion, 1000),
    intensity: source.intensity,
    finderAvailable: source.finderAvailable,
  }
}

export function getHomeBrandProfiles(
  brands: readonly Brand[],
  profiles: readonly Pick<HomeCatalogProfile, 'brandId' | 'family'>[],
): Record<string, string[]> {
  return Object.fromEntries(
    brands.map((brand) => [
      brand.id,
      [
        ...new Set(
          profiles
            .filter((profile) => profile.brandId === brand.id)
            .flatMap((profile) =>
              profile.family.split('·').map((part) => part.trim()),
            )
            .filter(
              (family) =>
                family && !/^(por definir|pendiente|—)$/i.test(family),
            ),
        ),
      ].slice(0, 3),
    ]),
  )
}

export function parseHomeCatalogContext(value: unknown) {
  const source = object(value)
  const settings = parseCatalogSettings(source)
  replaceOlfactoryFamilies(settings.olfactoryFamilies)
  const brands = array(source.brands, 10000).map(parseCatalogBrand)
  distinct(brands.map((brand) => brand.id))
  const profiles = array(source.profiles, 10000).map(parseProfile)
  const brandIds = new Set(brands.map((brand) => brand.id))
  if (
    profiles.some(
      (profile) => profile.finderAvailable && !brandIds.has(profile.brandId),
    )
  )
    throw new CatalogReadError()
  const records = array(source.items, 4).map((item) =>
    parseCatalogProductRecord(item),
  )
  distinct(records.map((record) => record.product.id))
  return {
    brands,
    settings,
    records,
    brandProfiles: getHomeBrandProfiles(brands, profiles),
    finderOptions: getFinderOptionsFromProfiles(
      profiles
        .filter((profile) => profile.finderAvailable)
        .map((profile) => ({
          product: {
            family: profile.family,
            olfactoryFamilies: profile.olfactoryFamilies,
          },
          detail: { occasion: profile.occasion, intensity: profile.intensity },
        })),
    ),
  }
}

export async function readRemoteHomeCatalog() {
  const value = await cachedPublicQuery('home-catalog', async () => {
    const { data, error } = await requireSupabaseClient().rpc(
      'catalog_home_context',
    )
    if (error) throw new CatalogReadError()
    return data
  })
  const result = parseHomeCatalogContext(value)
  confirmPublicCatalogRecords(result.records, result)
  return result
}

export function parseBrandPreviews(value: unknown) {
  const source = object(value)
  const brands = array(source.brands, 10000).map((value) => {
    const brand = object(value)
    return {
      ...parseCatalogBrand(brand),
      previewImage:
        brand.previewImage === null
          ? undefined
          : parseCatalogImage(brand.previewImage),
    }
  })
  distinct(brands.map((brand) => brand.id))
  rememberManagedAssets(source.mediaAssets)
  return brands
}

export async function readRemoteBrandPreviews() {
  const value = await cachedPublicQuery('brand-previews', async () => {
    const { data, error } = await requireSupabaseClient().rpc(
      'catalog_brand_previews',
    )
    if (error) throw new CatalogReadError()
    return data
  })
  return parseBrandPreviews(value)
}
