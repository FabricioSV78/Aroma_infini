import { getLocalImageVariants } from '../content/image-variants'
import { assetSource } from './asset-source'
import { getManagedMedia } from './media-registry'
import { managedImageCandidates } from '../domain/managed-image-candidates'

export function isUploadedImage(image: string) {
  return image.startsWith('data:image/webp;base64,')
}

function isRemoteImage(image: string) {
  return /^https:\/\//i.test(image)
}

export function imageSource(image: string, width?: number) {
  const media = getManagedMedia(image)
  if (media) {
    // Detail previews and the olfactory image do not all provide a srcset.
    // Preserve the original by default; only an explicit requested size picks
    // a smaller verified object.
    if (width === undefined) return assetSource(image)
    const variant =
      media.variants.find((candidate) => candidate.width >= width) ??
      media.variants.at(-1)!
    return assetSource(variant.src)
  }
  const source =
    isUploadedImage(image) ||
    isRemoteImage(image) ||
    (image.startsWith('/') && !image.startsWith('//'))
      ? image
      : `/images/${image}-${width ?? 480}.webp`
  return assetSource(source)
}

export function imageSourceSet(image: string, widths: readonly number[]) {
  const managed = getManagedMedia(image)
  if (managed) {
    // Include the real nearest candidate for every requested size, including
    // a smaller original when a requested width would otherwise upscale it.
    const candidates = managedImageCandidates(managed, widths)
    return candidates.length
      ? candidates
          .map(({ width, src }) => `${assetSource(src)} ${width}w`)
          .join(', ')
      : undefined
  }
  const variants = getLocalImageVariants(image)
  if (variants) {
    const candidates = variants.filter((variant) =>
      widths.includes(variant.width),
    )
    return candidates.length
      ? candidates
          .map(({ src, width }) => `${assetSource(src)} ${width}w`)
          .join(', ')
      : undefined
  }
  return isUploadedImage(image) ||
    isRemoteImage(image) ||
    (image.startsWith('/') && !image.startsWith('//'))
    ? undefined
    : widths.map((width) => `${imageSource(image, width)} ${width}w`).join(', ')
}
