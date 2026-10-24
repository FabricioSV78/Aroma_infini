import type {
  Brand,
  Product,
  ProductAudience,
  ProductDetail,
} from '../types/catalog'
import type { HomeContent, HomeMedia } from '../types/home'
import type { ShippingSettings } from '../types/shipping'
import type { StoreFeatures } from '../domain/store-features'
import {
  adminService,
  getStoreBrands,
  getStoreProductRecords,
  hydrateAdminStore,
  type AdminState,
} from './admin-service'

/** Published product information shared by the shop and admin inventory. */
export interface StorefrontProductRecord {
  product: Product
  detail: ProductDetail
  gender: ProductAudience | null
  popularity: number
  newest: number
}

export interface StorefrontSnapshot {
  brands: Brand[]
  products: StorefrontProductRecord[]
  shipping: ShippingSettings
  media: HomeMedia
  content: HomeContent
  features: StoreFeatures
}

/** Async boundary to replace with remote queries during Supabase integration. */
export interface StorefrontRepository {
  readSnapshot(): Promise<StorefrontSnapshot>
}

/** Compatibility read for the browser-local session; remote adapters need no sync API. */
export interface LocalStorefrontRepository extends StorefrontRepository {
  peekSnapshot(): StorefrontSnapshot
  subscribe(listener: () => void): () => void
}

let cachedState: AdminState | undefined
let cachedSnapshot: StorefrontSnapshot | undefined

function peekLocalSnapshot(): StorefrontSnapshot {
  const state = adminService.getSnapshot()
  if (state === cachedState && cachedSnapshot) return cachedSnapshot
  cachedState = state
  cachedSnapshot = {
    brands: getStoreBrands(),
    products: getStoreProductRecords(),
    shipping: state.shipping,
    media: state.homeMedia,
    content: state.homeContent,
    features: state.features,
  }
  return cachedSnapshot
}

export const localStorefrontRepository: LocalStorefrontRepository = {
  subscribe: adminService.subscribe,
  async readSnapshot() {
    await hydrateAdminStore()
    return peekLocalSnapshot()
  },
  peekSnapshot: peekLocalSnapshot,
}
