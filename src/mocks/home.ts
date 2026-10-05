import type { Brand, Product } from '../types/catalog'

// Datos de demostración: no representan marcas, precios ni inventario reales.
export const brands: Brand[] = [
  { id: 'atelier', slug: 'atelier-01', name: 'Atelier 01' },
  { id: 'forme', slug: 'forme', name: 'Forme' },
  { id: 'sillage', slug: 'studio-sillage', name: 'Studio sillage' },
  { id: 'matiere', slug: 'matiere-04', name: 'Matière 04' },
]

export const products: Product[] = [
  {
    id: 'cedre',
    slug: 'bois-clair',
    name: 'Bois Clair',
    brandId: 'atelier',
    image: 'cedre',
    family: 'Amaderado · fresco',
    variants: [
      { id: 'cedre-50', ml: 50, priceCents: 39000, stock: 5 },
      { id: 'cedre-100', ml: 100, priceCents: 59000, stock: 3 },
    ],
  },
  {
    id: 'petale',
    slug: 'petale-nu',
    name: 'Pétale Nu',
    brandId: 'forme',
    image: 'petale',
    family: 'Floral · suave',
    variants: [
      { id: 'petale-50', ml: 50, priceCents: 42000, stock: 4 },
      { id: 'petale-100', ml: 100, priceCents: 62000, stock: 2 },
    ],
  },
  {
    id: 'sillage',
    slug: 'vert-silence',
    name: 'Vert Silence',
    brandId: 'sillage',
    image: 'sillage',
    family: 'Verde · aromático',
    variants: [{ id: 'sillage-75', ml: 75, priceCents: 48000, stock: 3 }],
  },
  {
    id: 'ambre',
    slug: 'ambre-lent',
    name: 'Ambre Lent',
    brandId: 'matiere',
    image: 'ambre',
    family: 'Ámbar · envolvente',
    variants: [
      { id: 'ambre-50', ml: 50, priceCents: 45000, stock: 0 },
      { id: 'ambre-100', ml: 100, priceCents: 65000, stock: 0 },
    ],
  },
  {
    id: 'neroli',
    slug: 'neroli-matin',
    name: 'Néroli Matin',
    brandId: 'atelier',
    image: 'neroli',
    family: 'Cítrico · luminoso',
    variants: [{ id: 'neroli-75', ml: 75, priceCents: 41000, stock: 6 }],
  },
  {
    id: 'iris',
    slug: 'iris-velours',
    name: 'Iris Velours',
    brandId: 'forme',
    image: 'iris',
    family: 'Floral · empolvado',
    variants: [{ id: 'iris-75', ml: 75, priceCents: 46000, stock: 6 }],
  },
  {
    id: 'figue',
    slug: 'figue-douce',
    name: 'Figue Douce',
    brandId: 'sillage',
    image: 'figue',
    family: 'Verde · cremoso',
    variants: [{ id: 'figue-75', ml: 75, priceCents: 49000, stock: 6 }],
  },
  {
    id: 'santal',
    slug: 'santal-nuit',
    name: 'Santal Nuit',
    brandId: 'matiere',
    image: 'santal',
    family: 'Amaderado · especiado',
    variants: [{ id: 'santal-75', ml: 75, priceCents: 52000, stock: 6 }],
  },
]
