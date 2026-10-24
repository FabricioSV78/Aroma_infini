import type { Product, ProductDiscount, ProductVariant } from '../types/catalog'

export type ProductDiscountStatus =
  'none' | 'inactive' | 'scheduled' | 'active' | 'expired' | 'invalid'

function time(value: string): number | null {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : Number.NaN
}

/** Validate an offer against every active presentation, including sold-out ones. */
export function validateProductDiscount(
  discount: ProductDiscount | null | undefined,
  variants: readonly ProductVariant[],
): string | null {
  if (discount == null) return null
  if (
    typeof discount.active !== 'boolean' ||
    !['percent', 'fixed'].includes(discount.type) ||
    !Number.isInteger(discount.value) ||
    (discount.type === 'percent' &&
      (discount.value < 1 || discount.value > 99)) ||
    (discount.type === 'fixed' && discount.value < 1)
  )
    return 'El descuento debe ser un porcentaje entre 1 y 99 o un importe positivo en céntimos.'

  if (
    typeof discount.startsAt !== 'string' ||
    typeof discount.endsAt !== 'string'
  )
    return 'Revisa las fechas del descuento.'
  const start = time(discount.startsAt)
  const end = time(discount.endsAt)
  if (Number.isNaN(start) || Number.isNaN(end))
    return 'Revisa las fechas del descuento.'
  if (start !== null && end !== null && start >= end)
    return 'La fecha final del descuento debe ser posterior al inicio.'

  const activeVariants = variants.filter((variant) => variant.active !== false)
  if (!activeVariants.length)
    return 'Activa una presentación antes de configurar el descuento.'
  if (
    activeVariants.some((variant) => {
      const reduction =
        discount.type === 'percent'
          ? Math.round((variant.priceCents * discount.value) / 100)
          : discount.value
      return (
        !Number.isSafeInteger(variant.priceCents) ||
        variant.priceCents <= 0 ||
        reduction <= 0 ||
        reduction >= variant.priceCents
      )
    })
  )
    return 'El descuento debe reducir el precio sin dejar en cero ninguna presentación activa.'
  return null
}

export function getProductDiscountStatus(
  discount: ProductDiscount | null | undefined,
  now: number | Date = Date.now(),
  variants?: readonly ProductVariant[],
): ProductDiscountStatus {
  if (!discount) return 'none'
  if (
    (variants && validateProductDiscount(discount, variants)) ||
    !Number.isInteger(discount.value) ||
    !['percent', 'fixed'].includes(discount.type) ||
    (discount.type === 'percent' &&
      (discount.value < 1 || discount.value > 99)) ||
    (discount.type === 'fixed' && discount.value < 1) ||
    typeof discount.active !== 'boolean' ||
    typeof discount.startsAt !== 'string' ||
    typeof discount.endsAt !== 'string'
  )
    return 'invalid'
  const start = time(discount.startsAt)
  const end = time(discount.endsAt)
  if (Number.isNaN(start) || Number.isNaN(end)) return 'invalid'
  if (!discount.active) return 'inactive'
  const timestamp = now instanceof Date ? now.getTime() : now
  if (!Number.isFinite(timestamp)) return 'invalid'
  if (start !== null && timestamp < start) return 'scheduled'
  if (end !== null && timestamp >= end) return 'expired'
  return 'active'
}

export interface VariantPrice {
  originalCents: number
  finalCents: number
  discountCents: number
  discountActive: boolean
}

/** One source of truth for storefront, cart, checkout and order validation. */
export function getVariantPrice(
  product: Product,
  variant: Pick<ProductVariant, 'priceCents' | 'active'>,
  now: number | Date = Date.now(),
): VariantPrice {
  const originalCents = variant.priceCents
  if (
    variant.active === false ||
    getProductDiscountStatus(product.discount, now, product.variants) !==
      'active'
  )
    return {
      originalCents,
      finalCents: originalCents,
      discountCents: 0,
      discountActive: false,
    }

  const discount = product.discount!
  const discountCents =
    discount.type === 'percent'
      ? Math.round((originalCents * discount.value) / 100)
      : discount.value
  if (discountCents <= 0 || discountCents >= originalCents)
    return {
      originalCents,
      finalCents: originalCents,
      discountCents: 0,
      discountActive: false,
    }
  return {
    originalCents,
    finalCents: originalCents - discountCents,
    discountCents,
    discountActive: true,
  }
}
