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

/** Terminal outcomes are not additional fulfilment steps. */
export const ALL_ORDER_STATUSES: readonly OrderStatus[] = [
  ...ORDER_STATUSES,
  'cancelled',
  'expired',
]
export const ORDER_ACTION_STATUSES: readonly OrderStatus[] = [
  ...ORDER_STATUSES,
  'cancelled',
]

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return status === 'cancelled' || status === 'expired'
}

interface OrderWorkflowData {
  simulation?: boolean
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
  if (
    !ALL_ORDER_STATUSES.includes(order.status) ||
    !ALL_ORDER_STATUSES.includes(target)
  )
    return 'El estado del pedido no es válido.'
  if (order.status === target) return null
  if (isTerminalOrderStatus(order.status))
    return 'Un pedido cancelado o vencido no se puede reabrir.'
  if (target === 'expired')
    return 'El vencimiento de la reserva lo registra automáticamente el sistema.'
  if (target === 'cancelled')
    return order.simulation === true &&
      order.paymentStatus === 'pending' &&
      (order.status === 'received' || order.status === 'preparing')
      ? null
      : 'Solo se pueden cancelar pedidos pendientes que todavía no se enviaron.'
  const currentIndex = ORDER_STATUSES.indexOf(order.status)
  const nextIndex = ORDER_STATUSES.indexOf(target)
  if (order.paymentStatus !== 'approved' && order.simulation !== true)
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
    !isTerminalOrderStatus(order.status) &&
    (order.paymentStatus !== 'approved' ||
      !hasCompleteOrderDelivery(order, legacyPhone))
  )
}
