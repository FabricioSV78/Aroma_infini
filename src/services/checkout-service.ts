import type { ResolvedCart } from './commerce-service'
import {
  getPromotionByCode,
  getShippingSettings,
  getShippingZoneForAddress,
} from './admin-service'
import { getPeruDepartmentLabel, peruDepartments } from '../content/peru'
import {
  isValidAlternateRecipient,
  type AlternateRecipient,
} from './shipping-recipient'

export { isValidAlternateRecipient } from './shipping-recipient'

export type CheckoutMode = 'guest' | 'demo-account'
export type DeliveryMethod = 'courier' | 'motorizado'
export type PaymentScenario = 'approved' | 'rejected' | 'error'
export type AppliedPromotion = string

export interface CheckoutContact {
  firstName: string
  lastName: string
  email: string
  phone: string
}

export interface CheckoutAddress {
  department: string
  province: string
  district: string
  street: string
  reference: string
}

export interface CheckoutDraft {
  mode: CheckoutMode
  contact: CheckoutContact
  address: CheckoutAddress
  alternateRecipient: AlternateRecipient | null
  deliveryMethod: DeliveryMethod
  promotionInput: string
  appliedPromotion: AppliedPromotion | null
}

export interface MockOrderLine {
  variantId: string
  productSlug: string
  image: string
  name: string
  brand: string
  ml: number
  quantity: number
  unitPriceCents: number
}

export interface MockOrder {
  reference: string
  mode: CheckoutMode
  placedAt: string
  lines: MockOrderLine[]
  contact: CheckoutContact
  address: CheckoutAddress
  alternateRecipient: AlternateRecipient | null
  deliveryMethod: DeliveryMethod
  paymentProvider: 'mercado-pago'
  promotionCode: AppliedPromotion | null
  subtotalCents: number
  discountCents: number
  shippingCents: number
  totalCents: number
}

export interface DeliveryZoneOption {
  value: string
  label: string
}

export type ShippingQuote =
  | { kind: 'pending' }
  | { kind: 'unavailable' }
  | {
      kind: 'quoted'
      region: 'capital' | 'province'
      feeCents: number
      estimate: string
      free: boolean
    }

export type PromotionResult =
  | {
      kind: 'applied'
      code: AppliedPromotion
      discountCents: number
      message: string
    }
  | {
      kind:
        | 'empty'
        | 'not-found'
        | 'inactive'
        | 'not-started'
        | 'expired'
        | 'limit-reached'
        | 'minimum-not-met'
        | 'error'
      message: string
    }

export function createCheckoutDraft(): CheckoutDraft {
  return {
    mode: 'guest',
    contact: { firstName: '', lastName: '', email: '', phone: '' },
    address: {
      department: '',
      province: '',
      district: '',
      street: '',
      reference: '',
    },
    alternateRecipient: null,
    deliveryMethod: 'courier',
    promotionInput: '',
    appliedPromotion: null,
  }
}

function normalizeDepartment(department: string) {
  return department
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function quoteShipping(
  department: string,
  method: DeliveryMethod,
  subtotalCents: number,
  province = '',
  district = '',
): ShippingQuote {
  const normalized = normalizeDepartment(department)
  if (!normalized) return { kind: 'pending' }
  const shipping = getShippingSettings()
  const zone = getShippingZoneForAddress(normalized, province, district)
  if (!zone)
    return method === 'motorizado'
      ? { kind: 'unavailable' }
      : { kind: 'pending' }
  const region =
    normalized === 'lima' || normalized === 'callao' ? 'capital' : 'province'
  if (method === 'motorizado' && zone.motorizadoFeeCents === null)
    return { kind: 'unavailable' }

  const free =
    shipping.freeThresholdCents > 0 &&
    subtotalCents >= shipping.freeThresholdCents
  const feeCents = free
    ? 0
    : method === 'motorizado'
      ? (zone.motorizadoFeeCents ?? zone.courierFeeCents)
      : zone.courierFeeCents
  return {
    kind: 'quoted',
    region,
    feeCents,
    estimate: zone.estimate,
    free,
  }
}

export function getDeliveryZoneOptions(): DeliveryZoneOption[] {
  return peruDepartments
}

export function getDeliveryZoneLabel(department: string): string {
  return getPeruDepartmentLabel(department)
}

export function evaluatePromotion(
  rawCode: string,
  subtotalCents: number,
): PromotionResult {
  const code = rawCode.trim().toUpperCase()
  if (!code)
    return { kind: 'empty', message: 'Escribe un código de descuento.' }
  if (code === 'ERROR')
    return {
      kind: 'error',
      message: 'No se pudo validar el código. Inténtalo de nuevo.',
    }
  const promotion = getPromotionByCode(code)
  if (!promotion)
    return {
      kind: 'not-found',
      message: 'No encontramos ese código.',
    }
  if (!promotion.active)
    return { kind: 'inactive', message: 'Este código no está activo.' }
  const now = Date.now()
  if (promotion.startsAt && new Date(promotion.startsAt).getTime() > now)
    return {
      kind: 'not-started',
      message: 'Este código aún no está disponible.',
    }
  if (promotion.endsAt && new Date(promotion.endsAt).getTime() < now)
    return { kind: 'expired', message: 'Este código venció.' }
  if (promotion.usageLimit !== null && promotion.used >= promotion.usageLimit)
    return {
      kind: 'limit-reached',
      message: 'Este código alcanzó su límite de usos.',
    }
  if (subtotalCents < promotion.minimumCents)
    return {
      kind: 'minimum-not-met',
      message: `Este código requiere un subtotal de S/ ${promotion.minimumCents / 100}.`,
    }
  const discountCents =
    promotion.type === 'percent'
      ? Math.round((subtotalCents * promotion.value) / 100)
      : Math.min(subtotalCents, Math.round(promotion.value * 100))
  return {
    kind: 'applied',
    code,
    discountCents,
    message:
      promotion.type === 'percent'
        ? `Descuento aplicado: ${promotion.value} %.`
        : `Descuento aplicado: S/ ${promotion.value}.`,
  }
}

export function calculateCheckout(cart: ResolvedCart, draft: CheckoutDraft) {
  const promotion = draft.appliedPromotion
    ? evaluatePromotion(draft.appliedPromotion, cart.subtotalCents)
    : null
  const discountCents =
    promotion?.kind === 'applied' ? promotion.discountCents : 0
  // El umbral de envío gratis se calcula antes del descuento.
  const shipping = quoteShipping(
    draft.address.department,
    draft.deliveryMethod,
    cart.subtotalCents,
    draft.address.province,
    draft.address.district,
  )
  return {
    subtotalCents: cart.subtotalCents,
    discountCents,
    shipping,
    totalCents:
      shipping.kind === 'quoted'
        ? cart.subtotalCents - discountCents + shipping.feeCents
        : null,
  }
}

export function createMockOrder(
  cart: ResolvedCart,
  draft: CheckoutDraft,
): MockOrder | null {
  if (!cart.lines.length || cart.needsAttention) return null
  if (
    draft.alternateRecipient &&
    !isValidAlternateRecipient(draft.alternateRecipient)
  )
    return null
  const amount = calculateCheckout(cart, draft)
  if (amount.shipping.kind !== 'quoted' || amount.totalCents === null)
    return null
  return {
    reference: `AI-${crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`,
    mode: draft.mode,
    placedAt: new Date().toISOString(),
    lines: cart.lines.flatMap((line) =>
      line.kind === 'ready'
        ? [
            {
              variantId: line.item.variantId,
              productSlug: line.product.slug,
              image: line.product.image,
              name: line.product.name,
              brand: line.brand?.name ?? '',
              ml: line.variant.ml,
              quantity: line.item.quantity,
              unitPriceCents: line.variant.priceCents,
            },
          ]
        : [],
    ),
    contact: { ...draft.contact },
    address: { ...draft.address },
    alternateRecipient: draft.alternateRecipient
      ? {
          name: draft.alternateRecipient.name.trim(),
          dni: draft.alternateRecipient.dni.trim(),
        }
      : null,
    deliveryMethod: draft.deliveryMethod,
    paymentProvider: 'mercado-pago',
    promotionCode: amount.discountCents > 0 ? draft.appliedPromotion : null,
    subtotalCents: amount.subtotalCents,
    discountCents: amount.discountCents,
    shippingCents: amount.shipping.feeCents,
    totalCents: amount.totalCents,
  }
}

export function simulatePayment(scenario: PaymentScenario) {
  return new Promise<PaymentScenario>((resolve) => {
    window.setTimeout(() => resolve(scenario), 650)
  })
}
