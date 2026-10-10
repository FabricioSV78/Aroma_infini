import { getDeliveryZoneLabel, type MockOrder } from './checkout-service'
import type { AdminOrderStatus } from './admin-service'

export type AccountOrderStatus = AdminOrderStatus

export interface AccountProfile {
  firstName: string
  lastName: string
  email: string
  phone: string
}

export interface AccountAddress {
  id: string
  label: string
  recipient: string
  department: string
  province: string
  district: string
  street: string
  reference: string
}

export interface AccountOrderLine {
  variantId: string
  productSlug: string
  image: string
  brand: string
  name: string
  ml: number
  quantity: number
  unitPriceCents: number
}

export interface AccountOrder {
  reference: string
  placedAt: string
  status: AccountOrderStatus
  lines: AccountOrderLine[]
  subtotalCents: number
  discountCents: number
  shippingCents: number
  totalCents: number
  deliveryMethod: 'courier' | 'motorizado'
  address: AccountAddress
  payment: {
    provider: 'mercado-pago'
    status: 'approved-demo'
  }
}

export const accountStatusLabels: Record<AccountOrderStatus, string> = {
  received: 'Recibido',
  preparing: 'En preparación',
  shipped: 'En camino',
  delivered: 'Entregado',
}

export const accountStatusOrder: AccountOrderStatus[] = [
  'received',
  'preparing',
  'shipped',
  'delivered',
]

export function createDemoProfile(): AccountProfile {
  return {
    firstName: 'Camila',
    lastName: 'Torres',
    email: '',
    phone: '',
  }
}

export function createDemoAddress(): AccountAddress {
  return {
    id: 'direccion-demo-principal',
    label: 'Principal',
    recipient: 'Camila Torres',
    department: 'lima',
    province: '1501',
    district: '150122',
    street: 'Dirección registrada',
    reference: '',
  }
}

export function createDemoOrders(): AccountOrder[] {
  return [
    {
      reference: 'AI-A1B2C3D4E5F60708',
      placedAt: '2026-09-09T15:30:00.000Z',
      status: 'shipped',
      lines: [
        {
          variantId: 'petale-50',
          productSlug: 'petale-nu',
          image: 'petale',
          brand: 'Forme',
          name: 'Pétale Nu',
          ml: 50,
          quantity: 1,
          unitPriceCents: 42000,
        },
      ],
      subtotalCents: 42000,
      discountCents: 0,
      shippingCents: 1500,
      totalCents: 43500,
      deliveryMethod: 'motorizado',
      address: createDemoAddress(),
      payment: { provider: 'mercado-pago', status: 'approved-demo' },
    },
  ]
}

export function accountOrderFromCheckout(
  order: MockOrder,
): AccountOrder | null {
  if (order.mode !== 'demo-account') return null
  return {
    reference: order.reference,
    placedAt: order.placedAt,
    status: 'received',
    lines: order.lines.map((line) => ({ ...line })),
    subtotalCents: order.subtotalCents,
    discountCents: order.discountCents,
    shippingCents: order.shippingCents,
    totalCents: order.totalCents,
    deliveryMethod: order.deliveryMethod,
    address: {
      id: `checkout-${order.reference}`,
      label: 'Entrega del pedido',
      recipient:
        order.alternateRecipient?.name ??
        `${order.contact.firstName} ${order.contact.lastName}`.trim(),
      ...order.address,
      department: getDeliveryZoneLabel(order.address.department),
    },
    payment: { provider: 'mercado-pago', status: 'approved-demo' },
  }
}
