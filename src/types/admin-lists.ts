import type { AdminBrand, AdminCustomer, AdminOrder, AdminProduct } from './admin'
import type { StoreFeatures } from '../domain/store-features'
export interface AdminProductList {
  ownerId: string
  accessRevision: number
  products: AdminProduct[]
  brands: AdminBrand[]
  features: StoreFeatures
  total: number
  summary: { products: number; stock: number; alerts: number; soldOut: number }
}
export type AdminOrderSelection = Pick<AdminOrder,
  'reference' | 'version' | 'status' | 'simulation' | 'paymentStatus' |
  'customerId' | 'customerName' | 'customerEmail' | 'contactPhone' | 'address'>
/** Fulfilment counters deliberately exclude cancelled/expired terminal orders. */
export type AdminOrderOperationalCounts = Record<
  'received' | 'preparing' | 'shipped' | 'delivered', number
>
export interface AdminOrderList {
  ownerId: string
  accessRevision: number
  orders: AdminOrder[]
  total: number
  customer: AdminCustomer | null
  counts: AdminOrderOperationalCounts
}
export interface AdminCustomerList {
  ownerId: string
  accessRevision: number
  customers: (AdminCustomer & { province: string; district: string; orderCount: number })[]
  total: number
}
export interface AdminDashboardData {
  ownerId: string
  accessRevision: number
  stock: number
  alertCount: number
  outAlertCount: number
  alerts: { productId: string; productName: string; variantId: string; ml: number | null; variantLabel?: string; stock: number; threshold: number }[]
  recentOrders: AdminOrder[]
  toPrepare: number
  counts: AdminOrderOperationalCounts
}
