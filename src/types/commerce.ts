/** Shared order and customer fields used by checkout, account and admin. */
export type DeliveryMethod = 'courier' | 'motorizado'

export type OrderStatus = 'received' | 'preparing' | 'shipped' | 'delivered'

export type PaymentStatus = 'pending' | 'approved' | 'rejected' | 'refunded'

export type PaymentProvider = 'mercado-pago'

export interface CustomerContact {
  firstName: string
  lastName: string
  email: string
  phone: string
}

export interface DeliveryAddress {
  department: string
  province: string
  district: string
  street: string
  reference?: string
}

export interface PurchasedLine {
  variantId: string
  brand: string
  name: string
  ml: number
  quantity: number
  unitPriceCents: number
}

export interface OrderTotals {
  subtotalCents: number
  discountCents: number
  shippingCents: number
  totalCents: number
}

export interface CustomerRecord {
  id: string
  name: string
  email: string
  phone: string
}
