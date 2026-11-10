import { adminService } from './admin-service'
import { catalogAdminService } from './catalog-admin-service'
import { isRemoteCatalog } from './catalog-source'
import type { AdminSaveResult } from '../types/admin'
import type { ProductDetail } from '../types/catalog'

/** Read the latest record so a photo-only save never overwrites price or stock. */
export function saveProductPhotos(
  productId: string,
  photos: Pick<ProductDetail, 'gallery' | 'olfactoryImage'>,
  expectedVersion?: number,
): AdminSaveResult | Promise<AdminSaveResult> {
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
  return (isRemoteCatalog ? catalogAdminService : adminService).saveProduct({
    ...current,
    version: expectedVersion ?? current.version,
    product: { ...current.product, image: gallery[0]?.image ?? '' },
    detail: {
      ...current.detail,
      gallery,
      olfactoryImage: photos.olfactoryImage ?? null,
    },
  })
}
