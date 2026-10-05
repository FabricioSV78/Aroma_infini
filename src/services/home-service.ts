import type { Brand, Product } from '../types/catalog'
import {
  getFeaturedProducts,
  getStoreBrands,
  getStoreProducts,
  getAdminProduct,
  getShippingSettings,
  adminService,
  hydrateAdminStore,
  type AdminShippingSettings,
  type HomeMedia,
} from './admin-service'

export interface HomeData {
  brands: Brand[]
  bestsellers: Product[]
  featured: Product[]
  shipping: AdminShippingSettings
  media: HomeMedia
}

// Único contrato de datos requerido en las fases 1 y 2.
export interface HomeService {
  getHome(): Promise<HomeData>
}

export function getBestsellingProducts(): Product[] {
  return [...getStoreProducts()]
    .sort(
      (a, b) =>
        (getAdminProduct(a.id)?.popularity ?? Infinity) -
        (getAdminProduct(b.id)?.popularity ?? Infinity),
    )
    .slice(0, 4)
}

export const homeService: HomeService = {
  async getHome() {
    await hydrateAdminStore()
    return {
      brands: getStoreBrands(),
      bestsellers: getBestsellingProducts(),
      featured: getFeaturedProducts(),
      shipping: getShippingSettings(),
      media: { ...adminService.getSnapshot().homeMedia },
    }
  },
}
