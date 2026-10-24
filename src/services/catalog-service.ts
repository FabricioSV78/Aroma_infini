import type {
  Brand,
  Product,
  ProductAudience,
  ProductGalleryView,
  ProductType,
} from '../types/catalog'
import {
  OLFACTORY_FAMILIES,
  getProductOlfactoryFamilies,
  isOlfactoryFamily,
  type OlfactoryFamily,
} from '../domain/olfactory-family'
import { getProductPresentation } from './product-presentation'
import {
  getProductType,
  isPerfume,
  isProductType,
} from '../domain/product-type'
import { getVariantPrice } from './product-discounts'
import { getProductRecommendations } from './product-recommendations'
import type { StoreFeatures } from '../domain/store-features'
import {
  localStorefrontRepository,
  type StorefrontProductRecord,
} from './storefront-repository'

export type CatalogGender = ProductAudience

const catalogGenders: ReadonlyArray<{
  value: CatalogGender
  label: string
}> = [
  { value: 'hombre', label: 'Para él' },
  { value: 'mujer', label: 'Para ella' },
  { value: 'unisex', label: 'Unisex' },
]

export function getCatalogGenders() {
  return catalogGenders
}

/** Synchronous card view backed by the same published records as catalogue pages. */
export function getCatalogProductGallery(
  productId: string,
): ProductGalleryView[] {
  return (
    localStorefrontRepository
      .peekSnapshot()
      .products.find((record) => record.product.id === productId)?.detail
      .gallery ?? []
  )
}
export const orders = [
  { value: 'mas-vendidos', label: 'Más vendidos' },
  { value: 'precio-asc', label: 'Precio: menor a mayor' },
  { value: 'precio-desc', label: 'Precio: mayor a menor' },
] as const
export type CatalogOrder = (typeof orders)[number]['value']
export const PAGE_SIZE = 12
export interface CatalogQuery {
  productTypes: ProductType[]
  brands: string[]
  genders: CatalogGender[]
  families: OlfactoryFamily[]
  min: string
  max: string
  order: CatalogOrder
  page: number
  search: string
}
function priceParam(value: string | null) {
  return value && /^\d+(\.\d{1,2})?$/.test(value) && Number(value) <= 1000000
    ? value
    : ''
}
export function readCatalogQuery(
  params: URLSearchParams,
  brands: readonly Brand[] = localStorefrontRepository.peekSnapshot().brands,
  features: StoreFeatures = localStorefrontRepository.peekSnapshot().features,
): CatalogQuery {
  const genders = getCatalogGenders()
  let min = priceParam(params.get('min'))
  let max = priceParam(params.get('max'))
  const rawOrder = params.get('orden')
  const productTypes = features.complementsEnabled
    ? [...new Set(params.getAll('tipo').filter(isProductType))]
    : []
  const complementsOnly =
    productTypes.length === 1 && productTypes[0] === 'complemento'
  if (min && max && Number(min) > Number(max)) [min, max] = [max, min]
  return {
    productTypes,
    brands: [
      ...new Set(
        params
          .getAll('marca')
          .filter((slug) => brands.some((brand) => brand.slug === slug)),
      ),
    ],
    genders: complementsOnly
      ? []
      : [
          ...new Set(
            params
              .getAll('genero')
              .filter((value): value is CatalogGender =>
                genders.some((gender) => gender.value === value),
              ),
          ),
        ],
    families: complementsOnly
      ? []
      : [...new Set(params.getAll('familia').filter(isOlfactoryFamily))],
    min,
    max,
    order:
      orders.find((order) => order.value === rawOrder)?.value ?? 'mas-vendidos',
    page: Math.max(
      1,
      Math.min(100000, Number.parseInt(params.get('pagina') ?? '1', 10) || 1),
    ),
    search: (params.get('q') ?? '').trim().slice(0, 100),
  }
}
export function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}
export function queryCatalog(
  query: CatalogQuery,
  source: Product[] = localStorefrontRepository
    .peekSnapshot()
    .products.map((record) => record.product),
  records: StorefrontProductRecord[] = localStorefrontRepository.peekSnapshot()
    .products,
  brands: Brand[] = localStorefrontRepository.peekSnapshot().brands,
) {
  const recordsById = new Map(
    records.map((record) => [record.product.id, record]),
  )
  const matched = source.filter((product) => {
    const selectedTypes = query.productTypes ?? []
    const complementsOnly =
      selectedTypes.length === 1 && selectedTypes[0] === 'complemento'
    const brand = brands.find((item) => item.id === product.brandId)
    const details = recordsById.get(product.id)
    const activeVariants = product.variants.filter(
      (variant) => variant.active !== false,
    )
    const available = activeVariants.filter((variant) => variant.stock > 0)
    const priceVariants = available.length ? available : activeVariants
    const priceMatch =
      (!query.min && !query.max) ||
      priceVariants.some((variant) => {
        const finalCents = getVariantPrice(product, variant).finalCents
        return (
          (!query.min || finalCents >= Math.round(Number(query.min) * 100)) &&
          (!query.max || finalCents <= Math.round(Number(query.max) * 100))
        )
      })
    const olfactoryFamilies = getProductOlfactoryFamilies(product)
    return (
      (!selectedTypes.length ||
        selectedTypes.includes(getProductType(product))) &&
      (!query.brands.length || query.brands.includes(brand?.slug ?? '')) &&
      (!query.genders.length ||
        complementsOnly ||
        (isPerfume(product) &&
          details?.gender !== null &&
          details !== undefined &&
          query.genders.includes(details.gender))) &&
      (!query.families.length ||
        complementsOnly ||
        (isPerfume(product) &&
          olfactoryFamilies.some((family) =>
            query.families.includes(family),
          ))) &&
      priceMatch &&
      (!query.search ||
        normalizeText(product.name + ' ' + (brand?.name ?? '')).includes(
          normalizeText(query.search),
        ))
    )
  })
  const finalPrices = new Map(
    matched.map((product) => {
      const visible = getProductPresentation(product.variants).variants
      const price = visible.length
        ? Math.min(
            ...visible.map(
              (variant) => getVariantPrice(product, variant).finalCents,
            ),
          )
        : null
      return [product.id, price] as const
    }),
  )
  matched.sort((a, b) => {
    const aPrice = finalPrices.get(a.id) ?? null
    const bPrice = finalPrices.get(b.id) ?? null
    if (query.order.startsWith('precio')) {
      if (aPrice === null) return bPrice === null ? 0 : 1
      if (bPrice === null) return -1
      return query.order === 'precio-asc' ? aPrice - bPrice : bPrice - aPrice
    }
    const aRecord = recordsById.get(a.id)
    const bRecord = recordsById.get(b.id)
    return (
      (aRecord?.popularity ?? Number.MAX_SAFE_INTEGER) -
      (bRecord?.popularity ?? Number.MAX_SAFE_INTEGER)
    )
  })
  const pages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE))
  const page = Math.min(query.page, pages)
  return {
    items: matched.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total: matched.length,
    page,
    pages,
  }
}
export interface CatalogReadService {
  getCatalog(query: CatalogQuery): Promise<
    ReturnType<typeof queryCatalog> & {
      brands: Brand[]
      availableTotal: number
      genders: ReturnType<typeof getCatalogGenders>
      families: ReadonlyArray<(typeof OLFACTORY_FAMILIES)[number]>
      features: StoreFeatures
    }
  >
  getBrands(): Promise<Brand[]>
  getBrandPreviews(): Promise<
    Array<Brand & { previewImage: string | undefined }>
  >
  getProduct(slug: string): Promise<
    | {
        product: Product
        detail: StorefrontProductRecord['detail']
        brand: Brand | undefined
        recommendations: Product[]
        brands: Brand[]
      }
    | undefined
  >
  suggest(
    search: string,
  ): Promise<Array<Product & { brand: Brand | undefined }>>
}

export const catalogService: CatalogReadService = {
  async getCatalog(query: CatalogQuery) {
    const snapshot = await localStorefrontRepository.readSnapshot()
    const publishedFamilies = new Set(
      snapshot.products.flatMap((record) =>
        getProductOlfactoryFamilies(record.product),
      ),
    )
    return {
      ...queryCatalog(
        query,
        snapshot.products.map((record) => record.product),
        snapshot.products,
        snapshot.brands,
      ),
      brands: snapshot.brands,
      availableTotal: snapshot.products.length,
      features: snapshot.features,
      genders: getCatalogGenders(),
      families: OLFACTORY_FAMILIES.filter((family) =>
        publishedFamilies.has(family.value),
      ),
    }
  },
  async getBrands() {
    return (await localStorefrontRepository.readSnapshot()).brands
  },
  async getBrandPreviews() {
    const snapshot = await localStorefrontRepository.readSnapshot()
    return snapshot.brands.map((brand) => ({
      ...brand,
      previewImage: snapshot.products.find(
        (record) => record.product.brandId === brand.id,
      )?.product.image,
    }))
  },
  async getProduct(slug: string) {
    const snapshot = await localStorefrontRepository.readSnapshot()
    const record = snapshot.products.find((item) => item.product.slug === slug)
    if (!record) return undefined
    const { product, detail } = record
    const products = snapshot.products.map((item) => item.product)
    const brands = snapshot.brands
    return {
      product,
      detail,
      brand: brands.find((brand) => brand.id === product.brandId),
      recommendations: getProductRecommendations(
        product,
        detail.recommendationIds,
        products,
      ),
      brands,
    }
  },
  async suggest(search: string) {
    const snapshot = await localStorefrontRepository.readSnapshot()
    const brands = snapshot.brands
    const query = readCatalogQuery(new URLSearchParams({ q: search }), brands)
    return queryCatalog(
      query,
      snapshot.products.map((record) => record.product),
      snapshot.products,
      brands,
    )
      .items.slice(0, 5)
      .map((product) => ({
        ...product,
        brand: brands.find((brand) => brand.id === product.brandId),
      }))
  },
}
