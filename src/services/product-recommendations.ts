import { getProductOlfactoryFamilies } from '../domain/olfactory-family'
import { getProductType } from '../domain/product-type'
import type { Product } from '../types/catalog'

/** Resolve against published products only; never store automatic suggestions as edits. */
export function getProductRecommendations(
  product: Product,
  recommendationIds: readonly string[],
  publishedProducts: readonly Product[],
): Product[] {
  const candidates = new Map(
    publishedProducts
      .filter((item) => item.id !== product.id && item.image.trim())
      .map((item) => [item.id, item]),
  )
  const selected = [...new Set(recommendationIds)]
    .map((id) => candidates.get(id))
    .filter((item): item is Product => Boolean(item))
    .slice(0, 4)
  if (selected.length) return selected

  const families = new Set(getProductOlfactoryFamilies(product))
  return [...candidates.values()]
    .filter(
      (item) =>
        getProductType(item) === getProductType(product) &&
        item.variants.some(
          (variant) =>
            variant.active !== false &&
            variant.stock > 0 &&
            variant.priceCents > 0,
        ),
    )
    .map((item, index) => ({
      product: item,
      familyMatches: getProductOlfactoryFamilies(item).filter((family) =>
        families.has(family),
      ).length,
      sameBrand: Boolean(product.brandId && item.brandId === product.brandId),
      index,
    }))
    .sort(
      (first, second) =>
        second.familyMatches - first.familyMatches ||
        Number(second.sameBrand) - Number(first.sameBrand) ||
        first.index - second.index,
    )
    .slice(0, 4)
    .map((item) => item.product)
}
