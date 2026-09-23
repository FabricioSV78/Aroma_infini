export interface ProductVariant {
  id: string
  ml: number
  priceCents: number
  stock: number
  active?: boolean
}

export interface CartItem {
  variantId: string
  quantity: number
}

export interface Brand {
  id: string
  slug: string
  name: string
}

export interface Product {
  id: string
  slug: string
  name: string
  brandId: string
  image: string
  family: string
  variants: ProductVariant[]
}

export type ProductGalleryFraming = 'full' | 'detail-top' | 'detail-base'

export interface ProductGalleryView {
  image: string
  alt: string
  framing: ProductGalleryFraming
}

export interface OlfactoryNotes {
  top: string[]
  heart: string[]
  base: string[]
}

export interface ProductDetail {
  type: string
  shortDescription: string
  description: string
  notes: OlfactoryNotes
  intensity: 'Suave' | 'Moderada' | 'Intensa'
  intensityLevel: 1 | 2 | 3
  occasion: string
  season: string
  gallery: ProductGalleryView[]
  recommendationIds: string[]
}
