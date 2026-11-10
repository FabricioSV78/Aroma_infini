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
} from './admin-service'
import type { AdminState } from '../types/admin'
import { isRemoteCatalog } from './catalog-source'
import { invalidatePublicQueryCache } from './public-query-cache'
import {
  createRemoteStorefrontTransport,
  createSupabaseStorefrontRepository,
} from './supabase-storefront'
import { publicHomeContent } from './home-content-service'
import { publicShippingSettings } from './commerce-settings-service'

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

/** Observable confirmed cache for consumers that render synchronously. */
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

const remoteStorefrontRepository = createSupabaseStorefrontRepository({
  ...createRemoteStorefrontTransport(),
  editorial() {
    // Both editorial and delivery data are confirmed public projections;
    // browser-local settings never become a remote network fallback.
    return {
      shipping: publicShippingSettings.peek(),
      media: publicHomeContent.peek().media,
      content: publicHomeContent.peek().content,
    }
  },
  subscribeEditorial(listener) {
    const unsubscribeLocal = adminService.subscribe(listener)
    const unsubscribeHome = publicHomeContent.subscribe(listener)
    const unsubscribeShipping = publicShippingSettings.subscribe(listener)
    return () => {
      unsubscribeLocal()
      unsubscribeHome()
      unsubscribeShipping()
    }
  },
})

export const storefrontRepository: LocalStorefrontRepository = isRemoteCatalog
  ? remoteStorefrontRepository
  : localStorefrontRepository

/** A confirmed administrative command invalidates public reads, never hydrates them. */
export function invalidateSupabaseStorefront() {
  invalidatePublicQueryCache()
  if (isRemoteCatalog) remoteStorefrontRepository.invalidate()
}

export function readStorefrontMetadata(): Promise<StorefrontSnapshot> {
  return isRemoteCatalog
    ? remoteStorefrontRepository.readMetadata()
    : localStorefrontRepository.readSnapshot()
}

export function confirmPublicCatalogRecords(
  records: StorefrontProductRecord[],
  metadata?: Parameters<typeof remoteStorefrontRepository.confirmRecords>[1],
  selection?: Parameters<typeof remoteStorefrontRepository.confirmRecords>[2],
) {
  if (isRemoteCatalog)
    remoteStorefrontRepository.confirmRecords(records, metadata, selection)
}
