import type { Brand } from '../src/types/catalog'
import type { OlfactoryFamilyDefinition } from '../src/domain/olfactory-family'
import type { StorefrontProductRecord } from '../src/services/storefront-repository'
import { availableFinderVariants } from '../src/services/fragrance-matching'

/** Isolated HTTP fixture only. SQL parity is checked independently against
 * canonical documents in 040_finder_projection.sql. */
export function finderCatalogFixture(
  brands: Brand[],
  olfactoryFamilies: readonly OlfactoryFamilyDefinition[],
  records: readonly (StorefrontProductRecord & { mediaAssets?: unknown[] })[],
) {
  const brandIds = new Set(brands.map((brand) => brand.id))
  const selected = records.filter(
    ({ product }) =>
      product.productType === 'perfume' &&
      brandIds.has(product.brandId) &&
      availableFinderVariants(product.variants, undefined, product).length > 0,
  )
  const covers = new Set(selected.map((record) => record.product.image))
  const media = new Map<string, unknown>()
  for (const record of selected)
    for (const asset of record.mediaAssets ?? []) {
      if (
        asset &&
        typeof asset === 'object' &&
        'src' in asset &&
        typeof asset.src === 'string' &&
        covers.has(asset.src)
      )
        media.set(asset.src, asset)
    }
  return {
    brands,
    olfactoryFamilies,
    total: selected.length,
    items: selected.map(({ product, detail }) => ({
      product,
      detail: {
        occasion: detail.occasion,
        intensityLevel: detail.intensityLevel,
        intensity: detail.intensity,
      },
    })),
    mediaAssets: [...media.values()],
  }
}
