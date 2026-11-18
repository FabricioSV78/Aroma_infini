import { parseManagedMediaAsset } from '../src/domain/media'
import { managedImageCandidates } from '../src/domain/managed-image-candidates'
import { PRODUCT_CARD_IMAGE_SIZES } from '../src/domain/product-card-image'

const object = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const attribute = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/** Only the first canonical item of this exact fresh browse response. Never
 * fetch another manifest, guess a filename, hint an alternate photo or reuse
 * a product from another page/filter/order. Local legacy assets are left alone. */
export function catalogImageHint(value: unknown): string {
  try {
    const items = object(value)?.items
    if (!Array.isArray(items) || !items.length) return ''
    const record = object(items[0]), product = object(record?.product)
    if (!product || !Array.isArray(record?.mediaAssets) || record.mediaAssets.length > 100) return ''
    const selected = record.mediaAssets.find(value => object(value)?.src === product.image)
    if (!selected) return ''
    const asset = parseManagedMediaAsset(selected)
    const srcset = managedImageCandidates(asset, [480, 960]).map(variant => `${variant.src} ${variant.width}w`).join(', ')
    if (!srcset) return ''
    return `<link rel="preload" as="image" type="image/webp" href="${attribute(asset.src)}" imagesrcset="${attribute(srcset)}" imagesizes="${attribute(PRODUCT_CARD_IMAGE_SIZES)}" fetchpriority="high" data-catalog-image-hint>`
  } catch {
    return ''
  }
}
