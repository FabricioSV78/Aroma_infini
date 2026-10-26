import {
  prepareImageFile,
  productImagePreset,
} from '../features/admin/prepareImageFile'

export type ProductPhotoRole = 'gallery' | 'olfactory'

/** Draft preparation is separate from the AdminStateRepository that commits it.
 * Sources are durable data URLs within the local IndexedDB snapshot, never blob URLs.
 * A future authenticated media adapter can return a public asset key at this seam.
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
            width: 960,
            height: 1200,
            maxWidth: 1600,
            quality: 0.9,
            label: '4:5 · mínimo 960 × 1200 px',
          }
        : { ...productImagePreset, maxWidth: 1600, quality: 0.9 },
    )
  },
}

export function prepareProductPhoto(file: File, role: ProductPhotoRole) {
  return localProductPhotoUpload.prepare(file, role)
}
