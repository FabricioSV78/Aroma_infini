import type { Product } from '../types/catalog'
import { getProductPresentation } from './product-presentation'
import {
  getAdminProduct,
  getStoreBrands,
  getStoreProductBySlug,
  getStoreProducts,
} from './admin-service'

export type CatalogGender = 'hombre' | 'mujer' | 'unisex'

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
export const orders = [
  { value: 'novedades', label: 'Novedades' },
  { value: 'precio-asc', label: 'Precio: menor a mayor' },
  { value: 'precio-desc', label: 'Precio: mayor a menor' },
  { value: 'mas-vendidos', label: 'Más vendidos' },
] as const
export type CatalogOrder = (typeof orders)[number]['value']
// Clasificación y orden exclusivamente de muestra. No equivalen a ventas reales.
const metadata: Record<
  string,
  { gender: CatalogGender; newest: number; popular: number; featured: boolean }
> = {
  cedre: { gender: 'hombre', newest: 3, popular: 1, featured: true },
  petale: { gender: 'mujer', newest: 4, popular: 2, featured: false },
  sillage: { gender: 'unisex', newest: 2, popular: 3, featured: true },
  ambre: { gender: 'unisex', newest: 1, popular: 4, featured: false },
}
export const PAGE_SIZE = 12
export interface CatalogQuery {
  brands: string[]
  genders: CatalogGender[]
  min: string
  max: string
  order: CatalogOrder
  page: number
  search: string
  featured: boolean
}
function priceParam(value: string | null) {
  return value && /^\d+(\.\d{1,2})?$/.test(value) && Number(value) <= 1000000
    ? value
    : ''
}
export function readCatalogQuery(params: URLSearchParams): CatalogQuery {
  const brands = getStoreBrands()
  const genders = getCatalogGenders()
  let min = priceParam(params.get('min'))
  let max = priceParam(params.get('max'))
  const rawOrder = params.get('orden')
  if (min && max && Number(min) > Number(max)) [min, max] = [max, min]
  return {
    brands: [
      ...new Set(
        params
          .getAll('marca')
          .filter((slug) => brands.some((brand) => brand.slug === slug)),
      ),
    ],
    genders: [
      ...new Set(
        params
          .getAll('genero')
          .filter((value): value is CatalogGender =>
            genders.some((gender) => gender.value === value),
          ),
      ),
    ],
    min,
    max,
    order:
      orders.find((order) => order.value === rawOrder)?.value ?? 'novedades',
    page: Math.max(
      1,
      Math.min(100000, Number.parseInt(params.get('pagina') ?? '1', 10) || 1),
    ),
    search: (params.get('q') ?? '').trim().slice(0, 100),
    featured: params.get('seleccion') === 'destacados',
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
  source: Product[] = getStoreProducts(),
) {
  const brands = getStoreBrands()
  const matched = source.filter((product) => {
    const brand = brands.find((item) => item.id === product.brandId)
    const record = getAdminProduct(product.id)
    const details = record ?? metadata[product.id]
    const activeVariants = product.variants.filter(
      (variant) => variant.active !== false,
    )
    const available = activeVariants.filter((variant) => variant.stock > 0)
    const priceVariants = available.length ? available : activeVariants
    const priceMatch =
      (!query.min && !query.max) ||
      priceVariants.some(
        (variant) =>
          (!query.min ||
            variant.priceCents >= Math.round(Number(query.min) * 100)) &&
          (!query.max ||
            variant.priceCents <= Math.round(Number(query.max) * 100)),
      )
    return (
      (!query.brands.length || query.brands.includes(brand?.slug ?? '')) &&
      (!query.genders.length ||
        query.genders.includes(details?.gender ?? '')) &&
      (!query.featured || details?.featured) &&
      priceMatch &&
      (!query.search ||
        normalizeText(product.name + ' ' + (brand?.name ?? '')).includes(
          normalizeText(query.search),
        ))
    )
  })
  matched.sort((a, b) => {
    const aPrice = getProductPresentation(a.variants).priceCents
    const bPrice = getProductPresentation(b.variants).priceCents
    if (query.order.startsWith('precio')) {
      if (aPrice === null) return bPrice === null ? 0 : 1
      if (bPrice === null) return -1
      return query.order === 'precio-asc' ? aPrice - bPrice : bPrice - aPrice
    }
    const aRecord = getAdminProduct(a.id)
    const bRecord = getAdminProduct(b.id)
    return query.order === 'mas-vendidos'
      ? (aRecord?.popularity ?? metadata[a.id]?.popular ?? Infinity) -
          (bRecord?.popularity ?? metadata[b.id]?.popular ?? Infinity)
      : (bRecord?.newest ?? metadata[b.id]?.newest ?? 0) -
          (aRecord?.newest ?? metadata[a.id]?.newest ?? 0)
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
export const catalogService = {
  async getCatalog(query: CatalogQuery) {
    const brands = getStoreBrands()
    return { ...queryCatalog(query), brands, genders: getCatalogGenders() }
  },
  async getBrands() {
    return getStoreBrands()
  },
  async getProduct(slug: string) {
    const record = getStoreProductBySlug(slug)
    if (!record) return undefined
    const { product, detail } = record
    const products = getStoreProducts()
    const brands = getStoreBrands()
    return {
      product,
      detail,
      brand: brands.find((brand) => brand.id === product.brandId),
      recommendations: detail.recommendationIds
        .map((id) => products.find((item) => item.id === id))
        .filter((item): item is Product => Boolean(item)),
      brands,
    }
  },
  async suggest(search: string) {
    const brands = getStoreBrands()
    const query = readCatalogQuery(new URLSearchParams({ q: search }))
    return queryCatalog(query)
      .items.slice(0, 5)
      .map((product) => ({
        ...product,
        brand: brands.find((brand) => brand.id === product.brandId),
      }))
  },
}
