import type { ResolvedCart } from './commerce-service'
import {
  adminService,
  getPromotionByCode,
  getShippingSettings,
  getShippingZoneForAddress,
} from './admin-service'
import {
  getPeruDepartmentLabel,
  getDeliveryArea,
  isCoveredDeliveryLocation,
  deliveryAreas,
  peruDepartments,
} from '../content/peru'
import { isShippingDestinationEnabled } from './shipping-rates'
import {
  isValidAlternateRecipient,
  type AlternateRecipient,
} from './shipping-recipient'
import type {
  CustomerContact,
  DeliveryAddress,
  DeliveryMethod as SharedDeliveryMethod,
  OrderTotals,
  PaymentProvider,
  PurchasedLine,
} from '../types/commerce'

export { isValidAlternateRecipient } from './shipping-recipient'

export type CheckoutMode = 'guest' | 'demo-account'
export type DeliveryMethod = SharedDeliveryMethod
export type PaymentScenario = 'approved' | 'rejected' | 'error'
export type AppliedPromotion = string

export type CheckoutContact = CustomerContact

export interface CheckoutAddress extends DeliveryAddress {
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

export interface MockOrderLine extends PurchasedLine {
  productSlug: string
  image: string
}

export interface MockOrder extends OrderTotals {
  reference: string
  mode: CheckoutMode
  placedAt: string
  lines: MockOrderLine[]
  contact: CheckoutContact
  address: CheckoutAddress
  alternateRecipient: AlternateRecipient | null
  deliveryMethod: DeliveryMethod
  paymentProvider: PaymentProvider
  promotionCode: AppliedPromotion | null
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
        | 'incompatible'
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
  const area = getDeliveryArea(normalized)
  if (
    !shipping.provinceShippingEnabled &&
    (!area || (province && province !== area.province))
  )
    return { kind: 'unavailable' }
  if (!province || !district) return { kind: 'pending' }
  if (!isShippingDestinationEnabled(shipping, normalized, province, district))
    return { kind: 'unavailable' }
  const isCapital = isCoveredDeliveryLocation(normalized, province, district)
  if (!isCapital && method === 'motorizado') return { kind: 'unavailable' }
  const zone = getShippingZoneForAddress(normalized, province, district)
  if (!zone) return { kind: 'unavailable' }
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
    region: isCapital ? 'capital' : 'province',
    feeCents,
    estimate: zone.estimate,
    free,
  }
}

export function getDeliveryZoneOptions(): DeliveryZoneOption[] {
  return getShippingSettings().provinceShippingEnabled
    ? peruDepartments
    : deliveryAreas.map((area) => ({
        value: area.department,
        label: area.label,
      }))
}

export function getDeliveryZoneLabel(department: string): string {
  return getPeruDepartmentLabel(department)
}

export function evaluatePromotion(
  rawCode: string,
  subtotalCents: number,
  hasProductDiscounts = false,
): PromotionResult {
  const code = rawCode.trim().toUpperCase()
  if (!code)
    return { kind: 'empty', message: 'Escribe un código de descuento.' }
  if (hasProductDiscounts)
    return {
      kind: 'incompatible',
      message: 'Los códigos no se combinan con perfumes en oferta.',
    }
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
    ? evaluatePromotion(
        draft.appliedPromotion,
        cart.subtotalCents,
        cart.productDiscountCents > 0,
      )
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
    productDiscountCents: cart.productDiscountCents,
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
  if (draft.appliedPromotion && cart.productDiscountCents > 0) return null
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
              variantLabel: line.variant.label,
              quantity: line.item.quantity,
              unitPriceCents: line.unitPriceCents,
              ...(line.unitPriceCents < line.originalUnitPriceCents
                ? { originalUnitPriceCents: line.originalUnitPriceCents }
                : {}),
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

/** Demo-only order write boundary; a verified server workflow replaces this later. */
export async function persistDemoCheckout(order: MockOrder): Promise<boolean> {
  const registration = adminService.recordApprovedCheckout(order)
  if (registration.kind === 'validation') return false
  // The in-memory order remains usable if private browsing blocks IndexedDB.
  await adminService.flush().catch(() => undefined)
  return true
}

export function simulatePayment(scenario: PaymentScenario) {
  return Promise.resolve(scenario)
}
