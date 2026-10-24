import type {
  DeliveryAddress,
  OrderStatus,
  PaymentStatus,
} from '../types/commerce'

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'received',
  'preparing',
  'shipped',
  'delivered',
]

interface OrderWorkflowData {
  customerName: string
  customerEmail: string
  contactPhone?: string
  address: DeliveryAddress
  status: OrderStatus
  paymentStatus: PaymentStatus
}

export function hasCompleteOrderDelivery(
  order: OrderWorkflowData,
  legacyPhone?: string,
): boolean {
  const phone = (order.contactPhone?.trim() || legacyPhone || '').trim()
  const address = order.address
  return Boolean(
    order.customerName.trim().length >= 2 &&
    !/^Cliente \d+$/i.test(order.customerName.trim()) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.customerEmail.trim()) &&
    /^[+\d\s()-]{9,20}$/.test(phone) &&
    address.street?.trim().length >= 5 &&
    !['Dirección registrada', 'DirecciÃ³n registrada'].includes(
      address.street.trim(),
    ) &&
    address.department?.trim() &&
    address.province?.trim() &&
    address.district?.trim(),
  )
}

/** Fulfilment steps are deliberately separate from payment status. */
export function getOrderTransitionError(
  order: OrderWorkflowData,
  target: OrderStatus,
  legacyPhone?: string,
): string | null {
  const currentIndex = ORDER_STATUSES.indexOf(order.status)
  const nextIndex = ORDER_STATUSES.indexOf(target)
  if (currentIndex < 0 || nextIndex < 0)
    return 'El estado del pedido no es válido.'
  if (order.status === target) return null
  if (order.paymentStatus !== 'approved')
    return 'El pago debe estar aprobado antes de preparar el pedido.'
  if (Math.abs(currentIndex - nextIndex) !== 1)
    return 'Actualiza el pedido un paso a la vez.'
  if (target === 'shipped' && !hasCompleteOrderDelivery(order, legacyPhone))
    return 'Completa el nombre, contacto y ubicación de entrega antes de marcar el pedido como enviado.'
  return null
}

export function isOrderAttention(
  order: OrderWorkflowData,
  legacyPhone?: string,
): boolean {
  return (
    order.status !== 'delivered' &&
    (order.paymentStatus !== 'approved' ||
      !hasCompleteOrderDelivery(order, legacyPhone))
  )
}
