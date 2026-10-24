import { UserFacingError } from '../../services/admin-messages'

export interface ImagePreset {
  width: number
  height: number
  label: string
}

export const homeImagePresets = {
  heroDesktop: {
    width: 1536,
    height: 864,
    label: '16:9 · mínimo 1536 × 864 px',
  },
  heroMobile: {
    width: 780,
    height: 1170,
    label: '2:3 · mínimo 780 × 1170 px',
  },
  finderDesktop: {
    width: 1536,
    height: 864,
    label: '16:9 · mínimo 1536 × 864 px',
  },
  finderMobile: {
    width: 780,
    height: 1170,
    label: '2:3 · mínimo 780 × 1170 px',
  },
  finderOption: {
    width: 480,
    height: 480,
    label: '1:1 · mínimo 480 × 480 px',
  },
  hombre: { width: 800, height: 1000, label: '4:5 · mínimo 800 × 1000 px' },
  mujer: { width: 800, height: 1000, label: '4:5 · mínimo 800 × 1000 px' },
  unisex: { width: 800, height: 1000, label: '4:5 · mínimo 800 × 1000 px' },
  complementos: {
    width: 800,
    height: 1000,
    label: '4:5 · mínimo 800 × 1000 px',
  },
} as const satisfies Record<string, ImagePreset>

export const productImagePreset: ImagePreset = {
  width: 800,
  height: 1000,
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
  if (file.size > 20 * 1024 * 1024) {
    throw new UserFacingError(
      'image-size',
      'La imagen debe pesar 20 MB o menos.',
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
    canvas.width = preset.width
    canvas.height = preset.height
    const context = canvas.getContext('2d')
    if (!context)
      throw new UserFacingError(
        'image-canvas',
        'No se pudo preparar la imagen. Inténtalo de nuevo.',
      )
    context.drawImage(
      bitmap,
      (bitmap.width - cropWidth) / 2,
      (bitmap.height - cropHeight) / 2,
      cropWidth,
      cropHeight,
      0,
      0,
      preset.width,
      preset.height,
    )
    const image = canvas.toDataURL('image/webp', 0.82)
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
