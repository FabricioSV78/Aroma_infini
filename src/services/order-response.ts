import type { AdminOrder, AdminOrderStatus } from '../types/admin'
import type { AccountOrder } from '../types/account'
import type { OrderHistoryEntry } from '../types/order-workflow'
import { ORDER_STATUSES } from '../domain/order-workflow'
import { UserFacingError } from './admin-messages'

/** Validates private order responses without initializing administrative state. */
export function invalidOrderResponse(): never {
  throw new UserFacingError(
    'orders-response',
    'No pudimos verificar los pedidos. Vuelve a cargar la página.',
  )
}
export function orderResponseObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalidOrderResponse()
  return value as Record<string, unknown>
}
export function orderResponseText(value: unknown, max = 1000): string {
  if (typeof value !== 'string' || value.length > max) invalidOrderResponse()
  return value
}
export function orderResponseInteger(value: unknown, minimum = 0): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum
  )
    invalidOrderResponse()
  return value
}
function date(value: unknown): string {
  const result = orderResponseText(value, 64)
  if (!Number.isFinite(Date.parse(result))) invalidOrderResponse()
  return result
}
export function orderResponseUuid(value: unknown): string {
  const result = orderResponseText(value, 36)
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(result))
    invalidOrderResponse()
  return result
}
function status(value: unknown): AdminOrderStatus {
  if (!ORDER_STATUSES.includes(value as AdminOrderStatus))
    invalidOrderResponse()
  return value as AdminOrderStatus
}
function totals(source: Record<string, unknown>) {
  const result = {
    subtotalCents: orderResponseInteger(source.subtotalCents),
    discountCents: orderResponseInteger(source.discountCents),
    shippingCents: orderResponseInteger(source.shippingCents),
    totalCents: orderResponseInteger(source.totalCents),
  }
  if (
    result.discountCents > result.subtotalCents ||
    result.totalCents !==
      result.subtotalCents - result.discountCents + result.shippingCents
  )
    invalidOrderResponse()
  return result
}
function lines(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100)
    invalidOrderResponse()
  return value.map((value) => {
    const source = orderResponseObject(value)
    const price = orderResponseInteger(source.unitPriceCents, 1)
    const original =
      source.originalUnitPriceCents == null
        ? undefined
        : orderResponseInteger(source.originalUnitPriceCents, price)
    return {
      variantId: orderResponseUuid(source.variantId),
      name: orderResponseText(source.name, 160),
      brand: orderResponseText(source.brand, 160),
      ml: source.ml === null ? null : orderResponseInteger(source.ml, 1),
      ...(source.variantLabel == null
        ? {}
        : { variantLabel: orderResponseText(source.variantLabel, 160) }),
      quantity: orderResponseInteger(source.quantity, 1),
      unitPriceCents: price,
      ...(original == null ? {} : { originalUnitPriceCents: original }),
      ...(typeof source.productSlug === 'string'
        ? { productSlug: orderResponseText(source.productSlug, 160) }
        : {}),
      ...(typeof source.image === 'string'
        ? { image: orderResponseText(source.image, 2048) }
        : {}),
    }
  })
}
function address(value: unknown) {
  const source = orderResponseObject(value)
  return {
    department: orderResponseText(source.department, 100),
    province: orderResponseText(source.province, 100),
    district: orderResponseText(source.district, 100),
    street: orderResponseText(source.street, 500),
    ...(source.reference == null
      ? {}
      : { reference: orderResponseText(source.reference, 500) }),
  }
}
function payment(value: unknown) {
  if (!['pending', 'approved', 'rejected', 'refunded'].includes(String(value)))
    invalidOrderResponse()
  return value as AdminOrder['paymentStatus']
}
export function parseAdminOrder(value: unknown): AdminOrder {
  const source = orderResponseObject(value)
  if (
    source.paymentProvider !== 'mercado-pago' ||
    !['courier', 'motorizado'].includes(String(source.deliveryMethod)) ||
    typeof source.simulation !== 'boolean' ||
    (source.simulation && source.paymentStatus !== 'pending')
  )
    invalidOrderResponse()
  const orderLines = lines(source.lines)
  const amount = totals(source)
  if (
    orderLines.reduce(
      (sum, line) => sum + line.quantity * line.unitPriceCents,
      0,
    ) !== amount.subtotalCents
  )
    invalidOrderResponse()
  const recipient =
    source.alternateRecipient == null
      ? null
      : orderResponseObject(source.alternateRecipient)
  return {
    id: orderResponseUuid(source.id),
    version: orderResponseInteger(source.version, 1),
    simulation: source.simulation,
    reference: orderResponseText(source.reference, 64),
    customerId: orderResponseText(source.customerId, 64),
    customerName: orderResponseText(source.customerName, 200),
    customerEmail: orderResponseText(source.customerEmail, 254),
    contactPhone: orderResponseText(source.contactPhone, 30),
    placedAt: date(source.placedAt),
    status: status(source.status),
    paymentStatus: payment(source.paymentStatus),
    lines: orderLines,
    promotionCode:
      source.promotionCode === null
        ? null
        : orderResponseText(source.promotionCode, 80),
    paymentProvider: 'mercado-pago',
    deliveryMethod: source.deliveryMethod as AdminOrder['deliveryMethod'],
    address: address(source.address),
    alternateRecipient: recipient
      ? {
          name: orderResponseText(recipient.name, 160),
          dni: orderResponseText(recipient.dni, 20),
        }
      : null,
    ...amount,
  }
}
export function parseOrderHistory(value: unknown): OrderHistoryEntry {
  const source = orderResponseObject(value),
    operator = orderResponseObject(source.operator)
  if (
    operator.verified !== true ||
    !['individual', 'bulk'].includes(String(source.source))
  )
    invalidOrderResponse()
  return {
    id: orderResponseUuid(source.id),
    reference: orderResponseText(source.reference, 64),
    fromStatus: status(source.fromStatus),
    toStatus: status(source.toStatus),
    changedAt: date(source.changedAt),
    operationId: orderResponseUuid(source.operationId),
    source: source.source as OrderHistoryEntry['source'],
    operator: {
      name: orderResponseText(operator.name, 254),
      id: operator.id === null ? null : orderResponseUuid(operator.id),
      verified: true,
    },
  }
}
export function parseAccountOrder(
  value: unknown,
  userId: string,
): AccountOrder {
  const source = orderResponseObject(value),
    location = orderResponseObject(source.address),
    paid = orderResponseObject(source.payment)
  if (
    source.userId !== userId ||
    paid.provider !== 'mercado-pago' ||
    !['courier', 'motorizado'].includes(String(source.deliveryMethod)) ||
    typeof source.simulation !== 'boolean' ||
    (source.simulation && paid.status !== 'pending')
  )
    invalidOrderResponse()
  const orderLines = lines(source.lines).map((line) => ({
    ...line,
    productSlug: orderResponseText(line.productSlug, 160),
    image: orderResponseText(line.image, 2048),
  }))
  const amount = totals(source)
  if (
    orderLines.reduce(
      (sum, line) => sum + line.quantity * line.unitPriceCents,
      0,
    ) !== amount.subtotalCents
  )
    invalidOrderResponse()
  return {
    userId,
    ...(source.id == null ? {} : { id: orderResponseUuid(source.id) }),
    ...(source.version == null
      ? {}
      : { version: orderResponseInteger(source.version, 1) }),
    simulation: source.simulation,
    reference: orderResponseText(source.reference, 64),
    placedAt: date(source.placedAt),
    status: status(source.status),
    lines: orderLines,
    deliveryMethod: source.deliveryMethod as AccountOrder['deliveryMethod'],
    address: {
      ...address(location),
      id: typeof location.id === 'string' ? location.id : '',
      label: typeof location.label === 'string' ? location.label : '',
      recipient: orderResponseText(location.recipient, 200),
      reference:
        typeof location.reference === 'string' ? location.reference : '',
    },
    payment: { provider: 'mercado-pago', status: payment(paid.status) },
    ...amount,
  }
}
