import { getLocalImageVariants } from '../content/image-variants'
import { assetSource } from './asset-source'

export function isUploadedImage(image: string) {
  return image.startsWith('data:image/webp;base64,')
}

function isRemoteImage(image: string) {
  return /^https:\/\//i.test(image)
}

export function imageSource(image: string, width = 480) {
  const source =
    isUploadedImage(image) ||
    isRemoteImage(image) ||
    (image.startsWith('/') && !image.startsWith('//'))
      ? image
      : `/images/${image}-${width}.webp`
  return assetSource(source)
}

export function imageSourceSet(image: string, widths: readonly number[]) {
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
