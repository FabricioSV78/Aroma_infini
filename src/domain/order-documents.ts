import type { AdminOrder } from '../services/admin-service'
import type { CustomerRecord } from '../types/commerce'
import {
  getPeruDepartmentLabel,
  getPeruDistrictLabel,
  getPeruProvinceLabel,
} from '../content/peru'
import { ORDER_STATUSES } from './order-workflow'

export type OrderDocumentType = 'shipping' | 'summary'

export interface OrderDocumentIssue {
  reference: string
  message: string
}

export interface OrderDocumentInspection {
  total: number
  valid: AdminOrder[]
  issues: OrderDocumentIssue[]
}

export function documentText(value: string | undefined | null): string {
  return (value ?? '')
    .normalize('NFC')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Shipment identity is taken from the order snapshot, not the buyer's current name. */
export function getOrderDocumentRecipient(
  order: AdminOrder,
  customers: readonly CustomerRecord[],
) {
  const alternate = order.alternateRecipient
  const legacyPhone = customers.find(
    (customer) => customer.id === order.customerId,
  )?.phone
  return {
    name: documentText(alternate ? alternate.name : order.customerName),
    phone: documentText(order.contactPhone || legacyPhone),
    // Checkout collects this only to identify a different person receiving the order.
    dni:
      alternate && /^\d{8}$/.test(alternate.dni?.trim() ?? '')
        ? alternate.dni.trim()
        : '',
    street: documentText(order.address?.street),
    district: documentText(getPeruDistrictLabel(order.address?.district ?? '')),
    province: documentText(getPeruProvinceLabel(order.address?.province ?? '')),
    department: documentText(
      getPeruDepartmentLabel(order.address?.department ?? ''),
    ),
    reference: documentText(order.address?.reference),
  }
}

function shippingProblems(
  order: AdminOrder,
  customers: readonly CustomerRecord[],
) {
  const recipient = getOrderDocumentRecipient(order, customers)
  const missing: string[] = []
  if (recipient.name.length < 2 || /^Cliente \d+$/i.test(recipient.name))
    missing.push('nombre del destinatario')
  if (!/^[+\d\s()-]{9,20}$/.test(recipient.phone))
    missing.push('teléfono de contacto')
  if (
    recipient.street.length < 5 ||
    /^Direcci[oó]n registrada$/i.test(recipient.street)
  )
    missing.push('dirección de entrega')
  if (!recipient.district) missing.push('distrito')
  if (!recipient.province) missing.push('provincia')
  if (!recipient.department) missing.push('departamento')
  if (!['courier', 'motorizado'].includes(order.deliveryMethod))
    missing.push('modalidad de entrega')
  return missing.length ? `Revisa: ${missing.join(', ')}.` : null
}

function summaryProblems(order: AdminOrder) {
  if (!Number.isFinite(Date.parse(order.placedAt)))
    return 'Revisa la fecha del pedido.'
  if (
    !ORDER_STATUSES.includes(order.status) ||
    !['pending', 'approved', 'rejected', 'refunded'].includes(
      order.paymentStatus,
    )
  )
    return 'Revisa los estados de preparación y pago.'
  if (
    ![
      order.subtotalCents,
      order.discountCents,
      order.shippingCents,
      order.totalCents,
    ].every((amount) => Number.isSafeInteger(amount) && amount >= 0)
  )
    return 'Revisa los importes del pedido.'
  if (
    !order.lines.length ||
    order.lines.some(
      (line) =>
        !documentText(line.name) ||
        !Number.isSafeInteger(line.quantity) ||
        line.quantity <= 0 ||
        !Number.isSafeInteger(line.unitPriceCents) ||
        line.unitPriceCents < 0 ||
        !Number.isSafeInteger(line.quantity * line.unitPriceCents),
    )
  )
    return 'Revisa los productos, cantidades y precios del pedido.'
  return null
}

/** One unique order reference is one document. Never changes orders or their state. */
export function inspectOrderDocuments(
  orders: readonly AdminOrder[],
  customers: readonly CustomerRecord[],
  type: OrderDocumentType,
): OrderDocumentInspection {
  const unique = [
    ...new Map(orders.map((order) => [order.reference, order])).values(),
  ]
  const valid: AdminOrder[] = []
  const issues: OrderDocumentIssue[] = []
  for (const order of unique) {
    const message = !documentText(order.reference)
      ? 'Falta el número de pedido.'
      : type === 'shipping'
        ? shippingProblems(order, customers)
        : summaryProblems(order)
    if (message) issues.push({ reference: order.reference, message })
    else valid.push(order)
  }
  return { total: unique.length, valid, issues }
}

export function orderDocumentFilename(
  type: OrderDocumentType,
  now = new Date(),
): string {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    date.find((entry) => entry.type === name)?.value
  return `aroma-infini-${type === 'shipping' ? 'fichas-envio' : 'resumenes-pedidos'}-${part('year')}-${part('month')}-${part('day')}.pdf`
}
