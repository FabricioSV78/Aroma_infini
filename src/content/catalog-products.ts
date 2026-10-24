import type { AdminProduct } from '../services/admin-service'
import { productImageAlt } from '../services/product-image-alt'

/** Additional catalog records; edited through Products after registration. */
const registrations = [
  { id: 'cedre-lumiere', name: 'Cèdre Lumière', source: 'cedre', sku: 'CEL' },
  { id: 'rose-satin', name: 'Rose Satin', source: 'petale', sku: 'ROS' },
  { id: 'the-sauvage', name: 'Thé Sauvage', source: 'sillage', sku: 'THS' },
  {
    id: 'bergamote-soleil',
    name: 'Bergamote Soleil',
    source: 'neroli',
    sku: 'BGS',
  },
  { id: 'fleur-de-soie', name: 'Fleur de Soie', source: 'iris', sku: 'FLS' },
  { id: 'figue-blanche', name: 'Figue Blanche', source: 'figue', sku: 'FGB' },
  { id: 'santal-epure', name: 'Santal Épure', source: 'santal', sku: 'SAE' },
  { id: 'bois-de-brume', name: 'Bois de Brume', source: 'cedre', sku: 'BDB' },
] as const

export const registeredCatalogIds = new Set<string>(
  registrations.map(({ id }) => id),
)

export function createRegisteredCatalogProducts(
  originals: readonly AdminProduct[],
): AdminProduct[] {
  return registrations.map(({ id, name, source, sku }, index) => {
    const original = originals.find(({ product }) => product.id === source)
    if (!original) throw new Error(`No se encontró el producto ${source}.`)
    const record = structuredClone(original)
    return {
      ...record,
      active: true,
      gender: 'unisex',
      popularity: index + 9,
      newest: index + 9,
      product: {
        ...record.product,
        id,
        slug: id,
        name,
        productType: 'perfume',
        discount: null,
        variants: record.product.variants.map((variant) => ({
          ...variant,
          id: `${id}-${variant.ml}`,
          sku: `AI-${sku}-${variant.ml}`,
          stock: 6,
          active: true,
        })),
      },
      detail: {
        ...record.detail,
        gallery: record.detail.gallery.map((view, viewIndex) => ({
          ...view,
          alt: productImageAlt(name, '', viewIndex),
        })),
      },
    }
  })
}
