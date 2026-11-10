import type { ShippingSettings } from '../types/shipping'
import {
  storefrontRepository,
  readStorefrontMetadata,
} from './storefront-repository'
import { isRemoteCatalog } from './catalog-source'
import { publicShippingSettings } from './commerce-settings-service'
export { getAreaBaseShipping } from './shipping-rates'

/** Public read model for shipping pages; the admin store is an implementation detail. */
export interface ShippingReadService {
  subscribe(listener: () => void): () => void
  getSnapshot(): ShippingSettings
  loadSettings(): Promise<ShippingSettings>
}

export const shippingService: ShippingReadService = {
  subscribe: storefrontRepository.subscribe,
  getSnapshot: () => storefrontRepository.peekSnapshot().shipping,
  async loadSettings() {
    if (isRemoteCatalog) {
      await readStorefrontMetadata()
      return publicShippingSettings.peek()
    }
    return (await readStorefrontMetadata()).shipping
  },
}
