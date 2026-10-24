import type { Brand, Product } from '../types/catalog'
import type { HomeContent, HomeMedia } from '../types/home'
import type { ShippingSettings } from '../types/shipping'
import type { FinderOptions } from '../types/fragrance-finder'
import type { StoreFeatures } from '../domain/store-features'
import { getFinderOptions } from './fragrance-matching'
import {
  localStorefrontRepository,
  type StorefrontProductRecord,
} from './storefront-repository'

export interface HomeData {
  brands: Brand[]
  brandProfiles: Record<string, string[]>
  bestsellers: Product[]
  shipping: ShippingSettings
  media: HomeMedia
  content: HomeContent
  finderOptions: FinderOptions
  features: StoreFeatures
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
    return {
      brands: snapshot.brands,
      brandProfiles: Object.fromEntries(
        snapshot.brands.map((brand) => [
          brand.id,
          [
            ...new Set(
              snapshot.products
                .filter(({ product }) => product.brandId === brand.id)
                .flatMap(({ product }) =>
                  product.family.split('·').map((part) => part.trim()),
                )
                .filter(
                  (family) =>
                    family && !/^(por definir|pendiente|—)$/i.test(family),
                ),
            ),
          ].slice(0, 3),
        ]),
      ),
      bestsellers: bestsellersFromRecords(snapshot.products),
      shipping: snapshot.shipping,
      media: { ...snapshot.media },
      content: snapshot.content,
      finderOptions: getFinderOptions(snapshot),
      features: snapshot.features,
    }
  },
}
