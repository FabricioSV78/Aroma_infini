import type {
  AccountAddress,
  AccountProfile,
  AccountOrderStatus,
} from '../types/account'
export type {
  AccountAddress,
  AccountData,
  AccountOrder,
  AccountOrderLine,
  AccountOrderStatus,
  AccountProfile,
  AccountRepository,
} from '../types/account'

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

export function emptyAccountProfile(): AccountProfile {
  return { firstName: '', lastName: '', email: '', phone: '' }
}
export function emptyAccountAddress(): AccountAddress {
  return {
    id: '',
    label: '',
    recipient: '',
    department: '',
    province: '',
    district: '',
    street: '',
    reference: '',
  }
}
