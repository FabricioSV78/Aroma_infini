import type { Brand, Product } from '../types/catalog'
import {
  getFeaturedProducts,
  getStoreBrands,
  getStoreProducts,
  getShippingSettings,
  type AdminShippingSettings,
} from './admin-service'

export interface HomeData {
  brands: Brand[]
  bestsellers: Product[]
  featured: Product[]
  shipping: AdminShippingSettings
}

// Único contrato de datos requerido en las fases 1 y 2.
export interface HomeService {
  getHome(): Promise<HomeData>
}

export const homeService: HomeService = {
  async getHome() {
    const products = getStoreProducts()
    return {
      brands: getStoreBrands(),
      bestsellers: products,
      featured: getFeaturedProducts(),
      shipping: getShippingSettings(),
    }
  },
}
