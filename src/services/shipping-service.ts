import { adminService } from './admin-service'
import type { ShippingSettings } from '../types/shipping'
import { localStorefrontRepository } from './storefront-repository'

/** Public read model for shipping pages; the admin store is an implementation detail. */
export interface ShippingReadService {
  subscribe(listener: () => void): () => void
  getSnapshot(): ShippingSettings
  loadSettings(): Promise<ShippingSettings>
}

export const shippingService: ShippingReadService = {
  subscribe: adminService.subscribe,
  getSnapshot: () => adminService.getSnapshot().shipping,
  async loadSettings() {
    return (await localStorefrontRepository.readSnapshot()).shipping
  },
}
