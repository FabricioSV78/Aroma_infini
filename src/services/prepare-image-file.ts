import { UserFacingError } from './admin-messages'
import {
  inspectRasterHeader,
  MEDIA_ORIGINAL_MAX_BYTES,
  PRODUCT_MEDIA_PROFILES,
  IMAGE_MEDIA_PROFILES,
  validOriginalImageDimensions,
} from '../domain/media'

export interface ImagePreset {
  width: number
  height: number
  label: string
  /** Retain extra source detail where this placement benefits from high-DPI. */
  maxWidth?: number
  quality?: number
}

const categoryImagePreset: ImagePreset = {
  width: 800,
  height: 1000,
  maxWidth: 1600,
  quality: 0.9,
  label: '4:5 · mínimo 800 × 1000 px · recomendado 1600 × 2000 px',
}

export const homeImagePresets = {
  heroDesktop: {
    width: 1536,
    height: 864,
    maxWidth: IMAGE_MEDIA_PROFILES['hero-desktop'].maxWidth,
    label: '16:9 · mínimo 1536 × 864 px',
  },
  heroMobile: {
    width: 780,
    height: 1170,
    maxWidth: IMAGE_MEDIA_PROFILES['hero-mobile'].maxWidth,
    label: '2:3 · mínimo 780 × 1170 px',
  },
  finderDesktop: {
    width: 1536,
    height: 864,
    maxWidth: IMAGE_MEDIA_PROFILES['finder-desktop'].maxWidth,
    label: '16:9 · mínimo 1536 × 864 px',
  },
  finderMobile: {
    width: 780,
    height: 1170,
    maxWidth: IMAGE_MEDIA_PROFILES['finder-mobile'].maxWidth,
    label: '2:3 · mínimo 780 × 1170 px',
  },
  finderOption: {
    width: 480,
    height: 480,
    maxWidth: IMAGE_MEDIA_PROFILES['finder-option'].maxWidth,
    label: '1:1 · mínimo 480 × 480 px',
  },
  hombre: categoryImagePreset,
  mujer: categoryImagePreset,
  unisex: categoryImagePreset,
  complementos: categoryImagePreset,
} as const satisfies Record<string, ImagePreset>

export const productImagePreset: ImagePreset = {
  width: PRODUCT_MEDIA_PROFILES['product-gallery'].width,
  height: PRODUCT_MEDIA_PROFILES['product-gallery'].height,
  label: '4:5 · mínimo 800 × 1000 px',
}

const acceptedTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
])

export async function prepareImageFile(file: File, preset: ImagePreset) {
  if (!acceptedTypes.has(file.type)) {
    throw new UserFacingError(
      'image-format',
      'Elige un archivo JPG, PNG, WebP o AVIF.',
    )
  }
  if (!file.size || file.size > MEDIA_ORIGINAL_MAX_BYTES) {
    throw new UserFacingError(
      'image-size',
      'La imagen debe pesar 20 MB o menos.',
    )
  }

  // Bound decompression cost before constructing a decoded bitmap. Header
  // inspection is an additional local safeguard, never the server authority.
  const header = inspectRasterHeader(
    new Uint8Array(await file.slice(0, 2 * 1024 * 1024).arrayBuffer()),
  )
  if (!header || header.mime !== file.type) {
    throw new UserFacingError(
      'image-content',
      'No se pudo abrir la imagen. El archivo no coincide con una fotografía JPG, PNG, WebP o AVIF válida.',
    )
  }
  if (!validOriginalImageDimensions(header.width, header.height)) {
    throw new UserFacingError(
      'image-pixels',
      'La imagen es demasiado grande para procesarla. Usa una de hasta 40 megapíxeles y 12000 px por lado.',
    )
  }
  if (header.animated) {
    throw new UserFacingError(
      'image-animation',
      'Usa una fotografía estática; las imágenes animadas no son compatibles.',
    )
  }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new UserFacingError(
      'image-unreadable',
      'No se pudo abrir la imagen. Prueba con otro archivo JPG, PNG, WebP o AVIF.',
    )
  }
  try {
    if (!validOriginalImageDimensions(bitmap.width, bitmap.height)) {
      throw new UserFacingError(
        'image-pixels',
        'La imagen es demasiado grande para procesarla. Usa una de hasta 40 megapíxeles y 12000 px por lado.',
      )
    }
    const targetRatio = preset.width / preset.height
    const cropWidth = Math.min(bitmap.width, bitmap.height * targetRatio)
    const cropHeight = Math.min(bitmap.height, bitmap.width / targetRatio)
    if (cropWidth < preset.width || cropHeight < preset.height) {
      throw new UserFacingError(
        'image-dimensions',
        `Necesitamos una imagen con área útil de al menos ${preset.width} × ${preset.height} px en proporción ${preset.width}:${preset.height}.`,
      )
    }

    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(
      Math.min(preset.maxWidth ?? preset.width, cropWidth),
    )
    canvas.height = Math.round(canvas.width / targetRatio)
    const context = canvas.getContext('2d')
    if (!context)
      throw new UserFacingError(
        'image-canvas',
        'No se pudo preparar la imagen. Inténtalo de nuevo.',
      )
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(
      bitmap,
      (bitmap.width - cropWidth) / 2,
      (bitmap.height - cropHeight) / 2,
      cropWidth,
      cropHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    )
    const image = canvas.toDataURL('image/webp', preset.quality ?? 0.82)
    if (!image.startsWith('data:image/webp;base64,')) {
      throw new UserFacingError(
        'image-webp',
        'Este navegador no pudo preparar la imagen en WebP.',
      )
    }
    return image
  } finally {
    bitmap.close()
  }
}
