import type {
  DeliveryAddress,
  DeliveryMethod,
  OrderStatus,
  OrderTotals,
  PaymentProvider,
  PaymentStatus,
  PurchasedLine,
} from './commerce'

export type AccountOrderStatus = OrderStatus

export interface AccountProfile {
  firstName: string
  lastName: string
  email: string
  phone: string
}

export interface AccountAddress extends DeliveryAddress {
  id: string
  label: string
  recipient: string
  reference: string
}

export interface AccountOrderLine extends PurchasedLine {
  productSlug: string
  image: string
}

export interface AccountOrder extends OrderTotals {
  id?: string
  version?: number
  simulation?: boolean
  userId: string
  reference: string
  placedAt: string
  status: AccountOrderStatus
  lines: AccountOrderLine[]
  deliveryMethod: DeliveryMethod
  address: AccountAddress
  payment: {
    provider: PaymentProvider
    status: PaymentStatus
  }
}

export interface AccountData {
  userId: string
  profile: AccountProfile
  address: AccountAddress | null
  orders: AccountOrder[]
  ordersAvailable?: boolean
}
export interface AccountRepository {
  readonly configured: boolean
  load(userId: string): Promise<AccountData>
  updateProfile(
    userId: string,
    profile: AccountProfile,
  ): Promise<AccountProfile>
  saveAddress(userId: string, address: AccountAddress): Promise<AccountAddress>
  removeAddress(userId: string): Promise<void>
}
