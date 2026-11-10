import type { Brand, ProductAudience, ProductType } from '../types/catalog'
import { isOlfactoryFamily, type OlfactoryFamily } from './olfactory-family'
import { isProductType } from './product-type'
import type { StoreFeatures } from './store-features'

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
export function parseCatalogQuery(
  params: URLSearchParams,
  brands: readonly Brand[],
  features: StoreFeatures,
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
