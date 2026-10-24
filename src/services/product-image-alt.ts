import type { ProductGalleryView } from '../types/catalog'

/** A neutral description: uploaded photographs are not necessarily bottle shots. */
export function productImageAlt(
  productName: string,
  brandName: string,
  index: number,
): string {
  const name = productName.trim() || 'Perfume'
  const brand = brandName.trim()
  const subject =
    brand && !name.toLowerCase().includes(brand.toLowerCase())
      ? `${name} de ${brand}`
      : name
  return `${subject}, ${index === 0 ? 'imagen principal' : `imagen ${index + 1}`}`
}

/**
 * Keep detailed legacy descriptions while the underlying photo and product
 * identity stay the same. Generate copy for new/replaced photos and renames.
 */
export function withGeneratedGalleryAlts(
  gallery: readonly ProductGalleryView[],
  productName: string,
  brandName: string,
  previous?: {
    gallery: readonly ProductGalleryView[]
    productName: string
    brandName: string
  },
): ProductGalleryView[] {
  const sameIdentity =
    previous?.productName === productName.trim() &&
    previous.brandName === brandName.trim()

  return gallery.map((view, index) => ({
    ...view,
    alt: !view.image
      ? ''
      : sameIdentity &&
          previous?.gallery[index]?.image === view.image &&
          view.alt.trim()
        ? view.alt.trim()
        : productImageAlt(productName, brandName, index),
  }))
}
