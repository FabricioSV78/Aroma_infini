import type { Brand, Product } from '../types/catalog'
import type { HomeContent, HomeMedia } from '../types/home'
import type { ShippingSettings } from '../types/shipping'
import { isPerfume } from '../domain/product-type'
import type { FinderOptions } from '../types/fragrance-finder'
import type { StoreFeatures } from '../domain/store-features'
import { getFinderOptions } from './fragrance-matching'
import {
  storefrontRepository,
  type StorefrontProductRecord,
} from './storefront-repository'
import { isRemoteCatalog } from './catalog-source'
import { readPublicHome } from './home-content-service'
import {
  getHomeBrandProfiles,
  readRemoteHomeCatalog,
} from './public-home-catalog'
import { readRemoteProductsByIds } from './remote-catalog-queries'

export interface HomeData {
  brands: Brand[]
  brandProfiles: Record<string, string[]>
  bestsellers: Product[]
  /** Only currently public products referenced by Hero campaigns. */
  heroProducts: Product[]
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
    .filter((record) => isPerfume(record.product))
    .sort((a, b) => a.popularity - b.popularity)
    .slice(0, 4)
    .map((record) => record.product)
}

export function getBestsellingProducts(): Product[] {
  return bestsellersFromRecords(storefrontRepository.peekSnapshot().products)
}

export const homeService: HomeService = {
  async getHome() {
    if (isRemoteCatalog) {
      const catalogReady = readRemoteHomeCatalog()
      const [catalog, home] = await Promise.all([
        catalogReady,
        readPublicHome(
          catalogReady.then(({ settings }) => settings.featuredBrandId),
        ),
      ])
      const heroProductIds = home.content.hero.flatMap((slide) =>
        slide.destination?.type === 'product'
          ? [slide.destination.productId]
          : [],
      )
      const heroRecords = await readRemoteProductsByIds(heroProductIds)
      return {
        brands: catalog.brands,
        brandProfiles: catalog.brandProfiles,
        // The bounded SQL projection already applies confirmed-sales ranking.
        // Reapplying the editorial fallback here would undo that public order.
        bestsellers: catalog.records
          .filter((record) => isPerfume(record.product))
          .slice(0, 4)
          .map((record) => record.product),
        heroProducts: heroRecords.map((record) => record.product),
        shipping: storefrontRepository.peekSnapshot().shipping,
        media: { ...home.media },
        content: home.content,
        finderOptions: catalog.finderOptions,
        features: catalog.settings.features,
      }
    }
    const snapshot = await storefrontRepository.readSnapshot()
    const content = snapshot.content
    const heroProductIds = new Set(
      content.hero.flatMap((slide) =>
        slide.destination?.type === 'product'
          ? [slide.destination.productId]
          : [],
      ),
    )
    return {
      brands: snapshot.brands,
      brandProfiles: getHomeBrandProfiles(
        snapshot.brands,
        snapshot.products.map(({ product }) => product),
      ),
      bestsellers: bestsellersFromRecords(snapshot.products),
      heroProducts: snapshot.products
        .filter(({ product }) => heroProductIds.has(product.id))
        .map(({ product }) => product),
      shipping: snapshot.shipping,
      media: { ...snapshot.media },
      content,
      finderOptions: getFinderOptions(snapshot),
      features: snapshot.features,
    }
  },
}
