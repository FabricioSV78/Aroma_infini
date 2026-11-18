import {
  IMAGE_MEDIA_PROFILES,
  inspectRasterHeader,
  validPreparedImageDimensions,
  validOriginalImageDimensions,
  MEDIA_ORIGINAL_MAX_BYTES,
  type ImageMediaPurpose,
} from '../domain/media'
import { UserFacingError } from './admin-messages'
import { prepareImageFile, type ImagePreset } from './prepare-image-file'
import {
  uploadManagedImage,
  type ExpectedMediaActor,
} from './media-upload'

function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () =>
      reject(new UserFacingError('media-read', 'No pudimos leer el archivo.'))
    reader.readAsDataURL(blob)
  })
}

function requireMinimumDimensions(
  width: number,
  height: number,
  minimum?: { width: number; height: number },
) {
  if (minimum && (width < minimum.width || height < minimum.height))
    throw new UserFacingError(
      'site-image-dimensions',
      `Esta ubicación necesita una imagen de al menos ${minimum.width} × ${minimum.height} px. El archivo no se subió y su imagen actual se conserva.`,
    )
}

export async function prepareAndUploadSiteImage(
  file: File,
  purpose: ImageMediaPurpose,
  actor: ExpectedMediaActor,
  signal?: AbortSignal,
  minimumDimensions?: { width: number; height: number },
) {
  if (signal?.aborted) throw new DOMException('Subida cancelada', 'AbortError')
  if (!file.size || file.size > MEDIA_ORIGINAL_MAX_BYTES)
    throw new UserFacingError(
      'image-size',
      'La imagen debe pesar 20 MB o menos.',
    )
  const profile = IMAGE_MEDIA_PROFILES[purpose]
  let preset: ImagePreset = { ...profile, label: purpose, quality: 0.9 }
  const header = inspectRasterHeader(
    new Uint8Array(await file.slice(0, 2 * 1024 * 1024).arrayBuffer()),
  )
  if (purpose === 'site-image') {
    if (
      !header ||
      header.mime !== file.type ||
      header.animated ||
      !validOriginalImageDimensions(header.width, header.height)
    )
      throw new UserFacingError(
        'image-content',
        'Elige una imagen JPG, PNG, WebP o AVIF válida.',
      )
    // Use visible dimensions, including EXIF orientation from phone photos.
    const bitmap = await createImageBitmap(file)
    try {
      if (!validOriginalImageDimensions(bitmap.width, bitmap.height))
        throw new UserFacingError(
          'image-pixels',
          'La imagen supera las dimensiones permitidas.',
        )
      const scale = Math.min(
        1,
        profile.maxWidth / bitmap.width,
        2400 / bitmap.height,
        Math.sqrt(4_000_000 / (bitmap.width * bitmap.height)),
      )
      const preparedWidth = Math.floor(bitmap.width * scale)
      requireMinimumDimensions(
        preparedWidth,
        Math.round((preparedWidth * bitmap.height) / bitmap.width),
        minimumDimensions,
      )
      preset = {
        width: 64,
        height: (64 * bitmap.height) / bitmap.width,
        maxWidth: Math.floor(bitmap.width * scale),
        quality: 0.9,
        label: 'Imagen del sitio',
      }
    } finally {
      bitmap.close()
    }
  }
  // Already optimized WebP sources keep their exact pixels and original bytes.
  const retainOriginal =
    file.type === 'image/webp' &&
    file.size <= 4 * 1024 * 1024 &&
    header &&
    !header.animated &&
    validPreparedImageDimensions(header.width, header.height, purpose)
  if (retainOriginal && header)
    requireMinimumDimensions(header.width, header.height, minimumDimensions)
  const prepared = retainOriginal
    ? await dataUrl(file)
    : await prepareImageFile(file, preset)
  if (minimumDimensions && !retainOriginal) {
    const prefix = 'data:image/webp;base64,'
    const binary = prepared.startsWith(prefix)
      ? atob(prepared.slice(prefix.length, prefix.length + 65536))
      : ''
    const actual = inspectRasterHeader(
      Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    )
    requireMinimumDimensions(
      actual?.width ?? 0,
      actual?.height ?? 0,
      minimumDimensions,
    )
  }
  if (signal?.aborted) throw new DOMException('Subida cancelada', 'AbortError')
  return uploadManagedImage(prepared, purpose, {
    ...actor,
    assertCurrent: async () => {
      if (signal?.aborted)
        throw new DOMException('Subida cancelada', 'AbortError')
      await actor.assertCurrent?.()
    },
  })
}
