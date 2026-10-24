import type { Product, ProductDetail } from '../types/catalog'

/** Stock on inactive presentations cannot make a product available to buy. */
export function hasProductStock(product: Pick<Product, 'variants'>): boolean {
  return product.variants.some(
    (variant) =>
      variant.active !== false &&
      Number.isInteger(variant.stock) &&
      variant.stock > 0,
  )
}

/** The first gallery image and the catalog cover must describe the same photo. */
export function hasProductMainImage(record: {
  product: Pick<Product, 'image'>
  detail: Pick<ProductDetail, 'gallery'>
}): boolean {
  return Boolean(
    record.product.image.trim() &&
    record.detail.gallery[0]?.image.trim() === record.product.image.trim(),
  )
}
