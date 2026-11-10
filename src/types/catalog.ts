import type { OlfactoryFamily } from '../domain/olfactory-family'

export interface ProductVariant {
  id: string
  /** Unique presentation SKU; generated on save when omitted from a draft. */
  sku?: string
  /** null for non-volumetric presentations, such as accessories. */
  ml: number | null
  label?: string
  priceCents: number
  /** Read-only public quotation calculated by SQL; never an administrative input. */
  readonly finalPriceCents?: number
  stock: number
  active?: boolean
}

/** A product-wide offer. Every presentation keeps its own original price. */
export interface ProductDiscount {
  active: boolean
  type: 'percent' | 'fixed'
  /** Integer percent (1–99) or integer cents, depending on type. */
  value: number
  /** UTC ISO timestamp or empty string for an open-ended boundary. */
  startsAt: string
  endsAt: string
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

export type ProductAudience = 'hombre' | 'mujer' | 'unisex'
export type ProductType = 'perfume' | 'complemento'

export interface Product {
  /** Missing on legacy records; interpreted as perfume at the domain boundary. */
  productType?: ProductType
  id: string
  /** Legacy DTO key for the internal product code, NOT a presentation SKU. */
  sku?: string
  slug: string
  name: string
  brandId: string
  image: string
  /** Legacy single/primary value kept for records saved before multi-selection. */
  olfactoryFamily?: OlfactoryFamily | null
  /** Canonical classifications. An empty array explicitly means unclassified. */
  olfactoryFamilies?: OlfactoryFamily[] | null
  /** Short editorial profile shown on the card, e.g. “Amaderado · fresco”. */
  family: string
  variants: ProductVariant[]
  discount?: ProductDiscount | null
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
  shortDescription: string
  description: string
  /** Per-product editorial image for the olfactory profile; null hides it. */
  olfactoryImage?: string | null
  notes: OlfactoryNotes
  intensity: 'Suave' | 'Moderada' | 'Intensa' | null
  intensityLevel: 1 | 2 | 3 | null
  occasion: string
  season: string
  gallery: ProductGalleryView[]
  recommendationIds: string[]
}
