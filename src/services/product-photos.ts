import { adminService, type AdminSaveResult } from './admin-service'
import type { ProductDetail } from '../types/catalog'

/** Read the latest record so a photo-only save never overwrites price or stock. */
export function saveProductPhotos(
  productId: string,
  photos: Pick<ProductDetail, 'gallery' | 'olfactoryImage'>,
): AdminSaveResult {
  const current = adminService
    .getSnapshot()
    .products.find((record) => record.product.id === productId)
  if (!current)
    return {
      kind: 'validation',
      message: 'Este producto ya no está disponible.',
    }
  const gallery = photos.gallery.filter((view) => view.image.trim())
  if (gallery.length > 4)
    return {
      kind: 'validation',
      message: 'La galería admite hasta cuatro fotografías.',
    }
  return adminService.saveProduct({
    ...current,
    product: { ...current.product, image: gallery[0]?.image ?? '' },
    detail: {
      ...current.detail,
      gallery,
      olfactoryImage: photos.olfactoryImage ?? null,
    },
  })
}
