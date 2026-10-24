import type { Product, ProductType, ProductVariant } from '../types/catalog'

export const PRODUCT_TYPES = [
  { value: 'perfume', label: 'Perfumes', singular: 'Perfume' },
  { value: 'complemento', label: 'Complementos', singular: 'Complemento' },
] as const

export function isProductType(value: unknown): value is ProductType {
  return PRODUCT_TYPES.some((item) => item.value === value)
}

export function getProductType(
  product: Pick<Product, 'productType'>,
): ProductType {
  return product.productType ?? 'perfume'
}

export function isPerfume(product: Pick<Product, 'productType'>) {
  return getProductType(product) === 'perfume'
}

export function variantLabel(variant: {
  ml: number | null
  label?: string
  variantLabel?: string
}) {
  return (
    variant.variantLabel?.trim() ||
    variant.label?.trim() ||
    (variant.ml ? `${variant.ml} ml` : 'Unidad')
  )
}

export function variantKey(variant: Pick<ProductVariant, 'ml' | 'label'>) {
  return variantLabel(variant)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function validPresentation(
  product: Pick<Product, 'productType'>,
  variant: ProductVariant,
) {
  return isPerfume(product)
    ? Number.isInteger(variant.ml) && (variant.ml ?? 0) > 0
    : variant.ml === null &&
        Boolean(variant.label?.trim()) &&
        variant.label!.trim().length <= 80
}
