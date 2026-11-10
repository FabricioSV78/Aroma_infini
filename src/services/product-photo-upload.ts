import { prepareImageFile, productImagePreset } from './prepare-image-file'
import { PRODUCT_MEDIA_PROFILES } from '../domain/media'

export type ProductPhotoRole = 'gallery' | 'olfactory'

/** Preparing a preview never publishes or uploads a photograph. Remote media
 * transfer happens only when the administrator saves the complete product.
 * Local/demo persistence may still retain prepared data URLs in IndexedDB.
 */
export interface ProductPhotoUploadAdapter {
  prepare(file: File, role: ProductPhotoRole): Promise<string>
}

const localProductPhotoUpload: ProductPhotoUploadAdapter = {
  prepare(file, role) {
    return prepareImageFile(
      file,
      role === 'olfactory'
        ? {
            ...PRODUCT_MEDIA_PROFILES['product-olfactory'],
            quality: 0.9,
            label: '4:5 · mínimo 960 × 1200 px',
          }
        : {
            ...productImagePreset,
            maxWidth: PRODUCT_MEDIA_PROFILES['product-gallery'].maxWidth,
            quality: 0.9,
          },
    )
  },
}

export function prepareProductPhoto(file: File, role: ProductPhotoRole) {
  return localProductPhotoUpload.prepare(file, role)
}
