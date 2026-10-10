import type { Brand, Product } from '../types/catalog'
import type { HomeContent, HomeMedia } from '../types/home'
import type { ShippingSettings } from '../types/shipping'
import {
  localStorefrontRepository,
  type StorefrontProductRecord,
} from './storefront-repository'

export interface HomeData {
  brands: Brand[]
  bestsellers: Product[]
  featured: Product[]
  shipping: ShippingSettings
  media: HomeMedia
  content: HomeContent
}

export interface HomeService {
  getHome(): Promise<HomeData>
}

function bestsellersFromRecords(records: StorefrontProductRecord[]): Product[] {
  return [...records]
    .sort((a, b) => a.popularity - b.popularity)
    .slice(0, 4)
    .map((record) => record.product)
}

export function getBestsellingProducts(): Product[] {
  return bestsellersFromRecords(
    localStorefrontRepository.peekSnapshot().products,
  )
}

export const homeService: HomeService = {
  async getHome() {
    const snapshot = await localStorefrontRepository.readSnapshot()
    const productsById = new Map(
      snapshot.products.map((record) => [record.product.id, record.product]),
    )
    return {
      brands: snapshot.brands,
      bestsellers: bestsellersFromRecords(snapshot.products),
      featured: snapshot.featuredOrder.flatMap((id) => {
        const product = productsById.get(id)
        return product ? [product] : []
      }),
      shipping: snapshot.shipping,
      media: { ...snapshot.media },
      content: snapshot.content,
    }
  },
}
