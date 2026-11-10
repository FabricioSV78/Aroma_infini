import type { Brand } from '../src/types/catalog'
import type { StorefrontProductRecord } from '../src/services/storefront-repository'
import { availableFinderVariants } from '../src/services/fragrance-matching'
import { isPerfume } from '../src/domain/product-type'

export function publicHomeCatalogFixture<T extends { brands: Brand[] }>(
  metadata: T,
  products: readonly StorefrontProductRecord[],
) {
  const ordered = [...products].sort(
    (a, b) =>
      a.popularity - b.popularity || a.product.id.localeCompare(b.product.id),
  )
  return {
    ...metadata,
    items: ordered.slice(0, 4),
    profiles: ordered.map(({ product, detail }) => ({
      brandId: product.brandId,
      family: product.family,
      olfactoryFamilies: product.olfactoryFamilies ?? [],
      occasion: detail.occasion,
      intensity: detail.intensity,
      finderAvailable: Boolean(
        isPerfume(product) &&
        metadata.brands.some((brand) => brand.id === product.brandId) &&
        availableFinderVariants(product.variants, undefined, product).length,
      ),
    })),
  }
}

export function publicBrandPreviewsFixture(
  brands: readonly Brand[],
  products: readonly StorefrontProductRecord[],
) {
  const ordered = [...products].sort(
    (a, b) =>
      a.popularity - b.popularity || a.product.id.localeCompare(b.product.id),
  )
  return {
    brands: brands.map((brand) => ({
      ...brand,
      previewImage:
        ordered.find(({ product }) => product.brandId === brand.id)?.product
          .image ?? null,
    })),
    mediaAssets: [],
  }
}
