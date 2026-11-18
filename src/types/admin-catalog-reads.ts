import type { AdminBrand, AdminProduct } from './admin'

export interface AdminCatalogChoice {
  id: string
  name: string
  slug: string
  sku: string | null
  brandId: string
  brandName: string
  active: boolean
  published: boolean
  productType: 'perfume' | 'complemento'
  hasDiscount: boolean
  version: number
}
export interface AdminCatalogChoices {
  ownerId: string
  accessRevision: number
  items: AdminCatalogChoice[]
  selected: AdminCatalogChoice[]
  total: number
}
export interface AdminCatalogChoiceQuery {
  search?: string
  page?: number
  limit?: number
  includeIds?: readonly string[]
  excludeId?: string
  withoutOffer?: boolean
  activeOnly?: boolean
}
export interface AdminOfferList {
  revision: string
  ownerId: string
  accessRevision: number
  products: AdminProduct[]
  brands: AdminBrand[]
  total: number
  availableCount: number
}
