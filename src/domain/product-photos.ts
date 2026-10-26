import { isPerfume } from './product-type'
import { hasProductMainImage } from './product-publication'
import type { Product, ProductDetail } from '../types/catalog'

type PhotoRecord = { product: Product; detail: ProductDetail }

/** Completeness is a work queue, not an additional publication requirement. */
export function getProductPhotoStatus(record: PhotoRecord) {
  const gallery = record.detail.gallery.filter((view) =>
    view.image.trim(),
  ).length
  const hasOlfactoryImage =
    isPerfume(record.product) && Boolean(record.detail.olfactoryImage?.trim())
  const expected = isPerfume(record.product) ? 5 : 4
  const count = gallery + Number(hasOlfactoryImage)
  const status =
    count === 0
      ? 'none'
      : gallery === 4 &&
          hasProductMainImage(record) &&
          (expected === 4 || hasOlfactoryImage)
        ? 'complete'
        : 'incomplete'
  return { gallery, hasOlfactoryImage, count, expected, status }
}
