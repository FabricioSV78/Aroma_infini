import { matchesDemoOlfactoryNotes } from '../mocks/product-details'
import type { ProductDetail } from '../types/catalog'

// Editorial interpretations for the demonstration catalog. Product notes remain
// the source of truth; a new or edited product has no unmatched photograph.
const images: Record<string, string> = {
  neroli: '/images/olfactory-neroli.webp',
  iris: '/images/olfactory-iris.webp',
  figue: '/images/olfactory-figue.webp',
  santal: '/images/olfactory-santal.webp',
  cedre: '/images/olfactory-cedre.webp',
  petale: '/images/olfactory-petale.webp',
  sillage: '/images/olfactory-sillage.webp',
  ambre: '/images/olfactory-ambre.webp',
}

export function getOlfactoryImage(
  productId: string,
  notes: ProductDetail['notes'],
): string | undefined {
  return matchesDemoOlfactoryNotes(productId, notes)
    ? images[productId]
    : undefined
}
