import {
  getCatalogGenders,
  PAGE_SIZE,
  parseCatalogQuery,
  type CatalogQuery,
} from '../domain/catalog-query'
import {
  OLFACTORY_FAMILIES,
  replaceOlfactoryFamilies,
} from '../domain/olfactory-family'
import {
  CatalogReadError,
  parseCatalogBrand,
  parseCatalogProductRecord,
  parseCatalogSettings,
} from './supabase-storefront'
import { requireSupabaseClient } from './supabase-client'
import {
  confirmPublicCatalogRecords,
  readStorefrontMetadata,
} from './storefront-repository'
import {
  cachedPublicQuery,
  publicQueryCacheGeneration,
} from './public-query-cache'

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new CatalogReadError()
  return value as Record<string, unknown>
}
function count(value: unknown, minimum = 0): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum
  )
    throw new CatalogReadError()
  return value
}

export async function readRemoteProductsByIds(
  productIds: string[] = [],
  variantIds: string[] = [],
) {
  if (!productIds.length && !variantIds.length) return []
  const args = {
    p_product_ids: [...new Set(productIds)].sort(),
    p_variant_ids: [...new Set(variantIds)].sort(),
  }
  const key = 'ids:' + JSON.stringify(args)
  const read = async () => {
    const { data, error } = await requireSupabaseClient().rpc(
      'catalog_products_by_ids',
      args,
    )
    if (error) throw new CatalogReadError()
    return data
  }
  for (;;) {
    const expectedGeneration = publicQueryCacheGeneration()
    // Fetch IDs and vocabulary together. Either can finish before a later
    // invalidation, so a completed metadata promise alone is not a barrier.
    await Promise.all([cachedPublicQuery(key, read), readStorefrontMetadata()])
    // Rejoin a fresh ID entry when metadata outlasts its TTL. Usually a HIT.
    const value = await cachedPublicQuery(key, read)
    if (expectedGeneration !== publicQueryCacheGeneration()) continue
    // No await between the final generation check, parsing and publication.
    const source = object(value)
    if (!Array.isArray(source.items) || source.items.length > 100)
      throw new CatalogReadError()
    const records = source.items.map((item) => parseCatalogProductRecord(item))
    confirmPublicCatalogRecords(records, undefined, { productIds, variantIds })
    return records
  }
}

export async function readRemoteProductContext(slug: string) {
  const value = await cachedPublicQuery('product:' + slug, async () => {
    const { data, error } = await requireSupabaseClient().rpc(
      'catalog_product_context',
      { p_slug: slug },
    )
    if (error) throw new CatalogReadError()
    return data
  })
  const source = object(value),
    settings = parseCatalogSettings(source)
  replaceOlfactoryFamilies(settings.olfactoryFamilies)
  if (
    !Array.isArray(source.brands) ||
    !Array.isArray(source.recommendations) ||
    source.recommendations.length > 4
  )
    throw new CatalogReadError()
  const brands = source.brands.map(parseCatalogBrand)
  if (source.record === null) {
    confirmPublicCatalogRecords([], { brands, settings })
    return undefined
  }
  const record = parseCatalogProductRecord(source.record)
  const recommendations = source.recommendations.map((item) =>
    parseCatalogProductRecord(item),
  )
  confirmPublicCatalogRecords([record, ...recommendations], {
    brands,
    settings,
  })
  return {
    product: record.product,
    detail: record.detail,
    brand: brands.find((brand) => brand.id === record.product.brandId),
    brands,
    recommendations: recommendations.map((item) => item.product),
  }
}

export async function readRemoteCatalog(
  query: CatalogQuery,
  pageSize = PAGE_SIZE,
) {
  const key = 'browse:' + JSON.stringify([query, pageSize])
  const value = await cachedPublicQuery(key, async () => {
    const { data, error } = await requireSupabaseClient().rpc(
      'catalog_browse',
      { p_query: { ...query }, p_page_size: pageSize },
    )
    if (error) throw new CatalogReadError()
    return data
  })
  const source = object(value)
  const settings = parseCatalogSettings(source)
  replaceOlfactoryFamilies(settings.olfactoryFamilies)
  if (
    !Array.isArray(source.items) ||
    source.items.length > pageSize ||
    !Array.isArray(source.brands) ||
    source.brands.length > 10000 ||
    !Array.isArray(source.familyCodes) ||
    source.familyCodes.some((code) => typeof code !== 'string')
  )
    throw new CatalogReadError()
  const records = source.items.map((item) => parseCatalogProductRecord(item))
  const brands = source.brands.map(parseCatalogBrand)
  confirmPublicCatalogRecords(records, { brands, settings })
  return {
    items: records.map((record) => record.product),
    total: count(source.total),
    availableTotal: count(source.availableTotal),
    page: count(source.page, 1),
    pages: count(source.pages, 1),
    brands,
    features: settings.features,
    families: OLFACTORY_FAMILIES.filter(
      (family) =>
        family.active &&
        (source.familyCodes as string[]).includes(family.value),
    ),
    genders: getCatalogGenders(),
  }
}

/** Send only bounded query values; the server validates them against real data. */
export async function loadRemoteCatalog(
  params: URLSearchParams,
  brandSlug?: string,
) {
  const rawQuery: CatalogQuery = {
    productTypes: params
      .getAll('tipo')
      .filter(
        (value): value is 'perfume' | 'complemento' =>
          value === 'perfume' || value === 'complemento',
      ),
    brands: brandSlug ? [brandSlug] : params.getAll('marca').slice(0, 100),
    genders: params
      .getAll('genero')
      .filter((value): value is 'hombre' | 'mujer' | 'unisex' =>
        ['hombre', 'mujer', 'unisex'].includes(value),
      ),
    families: params.getAll('familia').slice(0, 32),
    min: params.get('min') ?? '',
    max: params.get('max') ?? '',
    order:
      params.get('orden') === 'precio-asc'
        ? 'precio-asc'
        : params.get('orden') === 'precio-desc'
          ? 'precio-desc'
          : 'mas-vendidos',
    page: Math.max(
      1,
      Math.min(100000, parseInt(params.get('pagina') ?? '1', 10) || 1),
    ),
    search: (params.get('q') ?? '').trim().slice(0, 100),
  }
  // Normalize price syntax and bounds with the same UI parser, while retaining
  // IDs not loaded yet. SQL confirms their existence; no whole-catalog prefetch.
  const parsed = parseCatalogQuery(params, [], { complementsEnabled: true })
  rawQuery.min = parsed.min
  rawQuery.max = parsed.max
  const result = await readRemoteCatalog(rawQuery)
  const query = parseCatalogQuery(params, result.brands, result.features)
  const brand = brandSlug
    ? result.brands.find((item) => item.slug === brandSlug)
    : undefined
  if (brandSlug && !brand) return { kind: 'missing' as const, query }
  return {
    kind: 'ready' as const,
    ...result,
    query: brand ? { ...query, brands: [brand.slug] } : query,
    brand,
  }
}
