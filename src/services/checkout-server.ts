import type { CartItem } from '../types/catalog'
import type {
  CheckoutDraft,
  MockOrder,
  PromotionResult,
  ShippingQuote,
} from './checkout-service'
import { requireSupabaseClient } from './supabase-client'
import { mediaApiBaseUrl } from './asset-source'
import { UserFacingError } from './admin-messages'
import { canSimulateCheckout } from './runtime-environment'

export interface ServerCheckoutQuote {
  lines: MockOrder['lines']
  subtotalCents: number
  productDiscountCents: number
  discountCents: number
  shipping: ShippingQuote
  promotion: PromotionResult | null
  totalCents: number | null
  quoteHash: string
  simulation: true
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new UserFacingError(
      'checkout-response',
      'No pudimos verificar el resumen del pedido. Vuelve a intentar.',
    )
  return value as Record<string, unknown>
}
function amount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new UserFacingError(
      'checkout-response',
      'No pudimos verificar los importes del pedido.',
    )
  return value
}
function text(value: unknown, max = 2048): string {
  if (typeof value !== 'string' || value.length > max)
    throw new UserFacingError(
      'checkout-response',
      'No pudimos verificar los datos del pedido.',
    )
  return value
}
function lines(value: unknown): MockOrder['lines'] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100)
    throw new UserFacingError(
      'checkout-response',
      'No pudimos verificar los productos del pedido.',
    )
  const seen = new Set<string>()
  return value.map((entry) => {
    const line = object(entry),
      variantId = text(line.variantId, 36)
    if (
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(variantId) ||
      seen.has(variantId) ||
      amount(line.quantity) < 1 ||
      amount(line.quantity) > 999
    )
      throw new UserFacingError(
        'checkout-response',
        'Revisa las presentaciones de tu selección.',
      )
    seen.add(variantId)
    const original =
      line.originalUnitPriceCents === undefined
        ? undefined
        : amount(line.originalUnitPriceCents)
    const current = amount(line.unitPriceCents)
    if (
      current < 1 ||
      (original !== undefined && original < current) ||
      !Number.isSafeInteger(current * amount(line.quantity)) ||
      (original !== undefined &&
        !Number.isSafeInteger(original * amount(line.quantity))) ||
      (line.ml !== null && amount(line.ml) < 1)
    )
      throw new UserFacingError(
        'checkout-response',
        'No pudimos verificar los precios del pedido.',
      )
    return {
      variantId,
      name: text(line.name, 160),
      brand: text(line.brand, 160),
      productSlug: text(line.productSlug, 160),
      image: text(line.image),
      ml: line.ml === null ? null : amount(line.ml),
      quantity: amount(line.quantity),
      unitPriceCents: current,
      ...(line.variantLabel == null
        ? {}
        : { variantLabel: text(line.variantLabel, 160) }),
      ...(original === undefined ? {} : { originalUnitPriceCents: original }),
    }
  })
}
function sumLines(items: MockOrder['lines'], original = false): number {
  const total = items.reduce(
    (sum, line) =>
      sum +
      (original
        ? (line.originalUnitPriceCents ?? line.unitPriceCents)
        : line.unitPriceCents) *
        line.quantity,
    0,
  )
  return amount(total)
}
function shipping(value: unknown): ShippingQuote {
  const data = object(value)
  if (data.kind === 'pending' || data.kind === 'unavailable')
    return { kind: data.kind }
  if (
    data.kind !== 'quoted' ||
    !['capital', 'province'].includes(String(data.region)) ||
    typeof data.free !== 'boolean' ||
    (data.free && amount(data.feeCents) !== 0)
  )
    throw new UserFacingError(
      'checkout-response',
      'No pudimos verificar la entrega del pedido.',
    )
  return {
    kind: 'quoted',
    region: data.region as 'capital' | 'province',
    feeCents: amount(data.feeCents),
    free: data.free,
    estimate: text(data.estimate, 160),
  }
}
function promotion(value: unknown): PromotionResult | null {
  if (value == null) return null
  const data = object(value),
    kind = text(data.kind, 30),
    message = text(data.message, 300)
  if (kind === 'applied')
    return {
      kind,
      code: text(data.code, 64),
      discountCents: amount(data.discountCents),
      message,
    }
  if (
    ![
      'empty',
      'not-found',
      'inactive',
      'not-started',
      'expired',
      'limit-reached',
      'minimum-not-met',
      'incompatible',
      'error',
    ].includes(kind)
  )
    throw new UserFacingError(
      'checkout-response',
      'No pudimos verificar el código de descuento.',
    )
  return { kind: kind as Exclude<PromotionResult['kind'], 'applied'>, message }
}
export function parseCheckoutQuote(value: unknown): ServerCheckoutQuote {
  const data = object(value),
    items = lines(data.lines),
    delivery = shipping(data.shipping),
    subtotal = amount(data.subtotalCents),
    discount = amount(data.discountCents),
    productDiscount = amount(data.productDiscountCents),
    coupon = promotion(data.promotion)
  const total = data.totalCents === null ? null : amount(data.totalCents)
  if (
    data.simulation !== true ||
    subtotal !== sumLines(items) ||
    productDiscount !== sumLines(items, true) - subtotal ||
    discount > subtotal ||
    discount !== (coupon?.kind === 'applied' ? coupon.discountCents : 0) ||
    (productDiscount > 0 && coupon?.kind === 'applied') ||
    (delivery.kind === 'quoted'
      ? total !== subtotal - discount + delivery.feeCents
      : total !== null)
  )
    throw new UserFacingError(
      'checkout-response',
      'Los importes del resumen no coinciden. Actualiza el pedido.',
    )
  const quoteHash = text(data.quoteHash, 128)
  if (!/^[a-f0-9]{32,128}$/i.test(quoteHash))
    throw new UserFacingError(
      'checkout-response',
      'No pudimos verificar la cotización.',
    )
  return {
    lines: items,
    shipping: delivery,
    subtotalCents: subtotal,
    productDiscountCents: productDiscount,
    discountCents: discount,
    totalCents: total,
    promotion: coupon,
    quoteHash,
    simulation: true,
  }
}
export function checkoutQuery(
  items: readonly CartItem[],
  draft: CheckoutDraft,
  code = draft.appliedPromotion,
) {
  return {
    p_lines: items.map(({ variantId, quantity }) => ({ variantId, quantity })),
    p_department: draft.address.department,
    p_province: draft.address.province,
    p_district: draft.address.district,
    p_delivery_method: draft.deliveryMethod,
    p_code: code || undefined,
  }
}
export async function requestCheckoutQuote(
  items: readonly CartItem[],
  draft: CheckoutDraft,
  code = draft.appliedPromotion,
  signal?: AbortSignal,
) {
  const request = requireSupabaseClient().rpc(
    'checkout_quote',
    checkoutQuery(items, draft, code),
  )
  const { data, error } = await (signal ? request.abortSignal(signal) : request)
  if (error)
    throw new UserFacingError(
      error.code === 'PT409' ? 'checkout-conflict' : 'checkout-quote',
      'No pudimos actualizar el resumen. Revisa disponibilidad, entrega y descuento, y vuelve a intentar.',
    )
  return parseCheckoutQuote(data)
}
export interface CheckoutOperation {
  operationId: string
  trackingToken: string
  checkout: Record<string, unknown>
}
export function createCheckoutOperation(
  items: readonly CartItem[],
  draft: CheckoutDraft,
  quote: ServerCheckoutQuote,
): CheckoutOperation {
  const token = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
  return {
    operationId: crypto.randomUUID(),
    trackingToken: token,
    checkout: {
      lines: items.map(({ variantId, quantity }) => ({ variantId, quantity })),
      contact: { ...draft.contact },
      address: { ...draft.address },
      alternateRecipient: draft.alternateRecipient
        ? { ...draft.alternateRecipient }
        : null,
      deliveryMethod: draft.deliveryMethod,
      promotionCode: draft.appliedPromotion,
      expectedQuoteHash: quote.quoteHash,
    },
  }
}
export async function submitSimulatedOrder(
  operation: CheckoutOperation,
  attachToAccount = false,
): Promise<MockOrder> {
  if (!canSimulateCheckout)
    throw new UserFacingError(
      'checkout-unavailable',
      'El pago en línea no está disponible en este momento.',
    )
  const client = requireSupabaseClient(),
    before = await client.auth.getSession()
  if (before.error)
    throw new UserFacingError(
      'checkout-session',
      'Vuelve a iniciar sesión antes de continuar.',
    )
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const originalToken = before.data.session?.access_token,
    ownerId = before.data.session?.user.id,
    token = attachToAccount ? originalToken : undefined,
    userId = attachToAccount ? ownerId : undefined
  if (attachToAccount && !userId)
    throw new UserFacingError(
      'checkout-session',
      'Inicia sesión para guardar el pedido en tu cuenta.',
    )
  if (token) headers.Authorization = `Bearer ${token}`
  let response: Response
  let value: unknown
  try {
    response = await fetch(`${mediaApiBaseUrl() || ''}/api/checkout/simulate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(operation),
      signal: AbortSignal.timeout(30000),
    })
    value = await response.json().catch(() => null)
  } catch {
    throw new UserFacingError(
      'checkout-network',
      'No pudimos confirmar la respuesta. Conservamos este intento para volver a consultarlo sin duplicar el pedido.',
    )
  }
  const after = await client.auth.getSession()
  if (!after.error && after.data.session?.user.id !== ownerId)
    throw new UserFacingError(
      'checkout-session',
      'Tu sesión cambió. Revisa Mis pedidos antes de volver a intentar.',
    )
  // The command may already have committed. A renewed token or an uncertain
  // session read must keep the same operation available for reconciliation.
  if (after.error || after.data.session?.access_token !== originalToken)
    throw new UserFacingError(
      'checkout-session-updated',
      'Tu sesión se actualizó. Vuelve a consultar este intento para confirmar el resultado sin duplicar el pedido.',
    )
  if (!response.ok) {
    const code =
      response.status === 409
        ? 'conflict'
        : response.status === 401
          ? 'session'
          : response.status === 429
            ? 'rate-limit'
            : [400, 422].includes(response.status)
              ? 'validation'
              : 'service'
    throw new UserFacingError(
      `checkout-${code}`,
      response.status === 409
        ? 'El resumen cambió. Actualízalo antes de confirmar nuevamente.'
        : 'No pudimos confirmar el pedido. Conservamos los datos para volver a intentar.',
    )
  }
  return parseSimulatedOrderResponse(value, operation, Boolean(userId))
}

/** Check the exact submitted selection before accepting a server confirmation. */
export function parseSimulatedOrderResponse(
  value: unknown,
  operation: CheckoutOperation,
  attachToAccount = false,
): MockOrder {
  const data = object(object(value).order),
    items = lines(data.lines),
    subtotal = amount(data.subtotalCents),
    discount = amount(data.discountCents),
    fee = amount(data.shippingCents),
    total = amount(data.totalCents)
  if (
    data.simulation !== true ||
    data.paymentStatus !== 'pending' ||
    data.paymentProvider !== 'mercado-pago' ||
    data.mode !== (attachToAccount ? 'demo-account' : 'guest') ||
    discount > subtotal ||
    total !== subtotal - discount + fee ||
    subtotal !== sumLines(items) ||
    !/^AI-(?:TEST-|SIM-)?[A-F0-9]{16,32}$/.test(text(data.reference, 64)) ||
    !Number.isFinite(Date.parse(text(data.placedAt, 64)))
  )
    throw new UserFacingError(
      'checkout-response',
      'No pudimos verificar la confirmación. Revisa el estado del pedido antes de repetirlo.',
    )
  const requested = linesRequested(operation.checkout.lines)
  if (
    requested.size !== items.length ||
    items.some((line) => requested.get(line.variantId) !== line.quantity)
  )
    throw new UserFacingError(
      'checkout-response',
      'La confirmación no corresponde a las presentaciones elegidas. Conservamos el intento para revisarlo.',
    )
  const contact = object(data.contact),
    address = object(data.address)
  const alternate =
    data.alternateRecipient == null ? null : object(data.alternateRecipient)
  if (data.deliveryMethod !== 'courier' && data.deliveryMethod !== 'motorizado')
    throw new UserFacingError(
      'checkout-response',
      'No pudimos verificar la entrega.',
    )
  return {
    reference: text(data.reference, 64),
    placedAt: text(data.placedAt, 64),
    mode: attachToAccount ? 'demo-account' : 'guest',
    lines: items,
    contact: {
      firstName: text(contact.firstName, 100),
      lastName: text(contact.lastName, 100),
      email: text(contact.email, 254),
      phone: text(contact.phone, 30),
    },
    address: {
      department: text(address.department, 100),
      province: text(address.province, 100),
      district: text(address.district, 100),
      street: text(address.street, 300),
      reference: text(address.reference ?? '', 300),
    },
    alternateRecipient: alternate
      ? { name: text(alternate.name, 160), dni: text(alternate.dni, 12) }
      : null,
    deliveryMethod: data.deliveryMethod,
    paymentProvider: 'mercado-pago',
    promotionCode:
      data.promotionCode == null ? null : text(data.promotionCode, 64),
    subtotalCents: subtotal,
    discountCents: discount,
    shippingCents: fee,
    totalCents: total,
    simulation: true,
    trackingToken: operation.trackingToken,
  }
}

function linesRequested(value: unknown): Map<string, number> {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100)
    throw new UserFacingError(
      'checkout-response',
      'No pudimos comprobar la selección enviada.',
    )
  const result = new Map<string, number>()
  for (const item of value) {
    const line = object(item),
      id = text(line.variantId, 36),
      quantity = amount(line.quantity)
    if (
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id) ||
      result.has(id) ||
      quantity < 1 ||
      quantity > 999
    )
      throw new UserFacingError(
        'checkout-response',
        'No pudimos comprobar la selección enviada.',
      )
    result.set(id, quantity)
  }
  return result
}
