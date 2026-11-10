import type { Brand, Product, ProductAudience, ProductDetail } from './catalog'
import type { OlfactoryFamilyDefinition } from '../domain/olfactory-family'
import type {
  CustomerContact,
  CustomerRecord,
  DeliveryAddress,
  DeliveryMethod,
  OrderStatus,
  OrderTotals,
  PaymentProvider,
  PaymentStatus,
  PurchasedLine,
} from './commerce'
import type {
  HomeContent,
  HomeMedia as SharedHomeMedia,
  HomeMediaKey as SharedHomeMediaKey,
} from './home'
import type { ShippingSettings, ShippingZone } from './shipping'
import type { OrderHistoryEntry } from './order-workflow'
import type { BrandRegistrationPreview } from '../domain/brand-registration'
import type { StoreFeatures } from '../domain/store-features'
import type { AlternateRecipient } from '../services/shipping-recipient'

/** Shared contracts for the local admin snapshot and its future data adapter. */
export type AdminGender = ProductAudience

export type HomeMediaKey = SharedHomeMediaKey

export type HomeMedia = SharedHomeMedia

export type AdminOrderStatus = OrderStatus

export type AdminOrderPaymentStatus = PaymentStatus

export type AdminPromotionType = 'percent' | 'fixed'

export interface AdminBrand extends Brand {
  active: boolean
  /** Server revision used to reject stale administrative edits. */
  version?: number
}

export type BatchBrandSaveResult =
  | { kind: 'saved'; created: AdminBrand[]; preview: BrandRegistrationPreview }
  | { kind: 'validation'; message: string }

export interface AdminProduct {
  product: Product
  detail: ProductDetail
  active: boolean
  gender: AdminGender | null
  popularity: number
  newest: number
  lowStockThreshold: number
  /** Server revision, never an authorization or a public catalog field. */
  version?: number
}

export type AdminOrderLine = PurchasedLine

export interface AdminOrder extends OrderTotals {
  id?: string
  version?: number
  /** A development simulation never confirms a real payment. */
  simulation?: boolean
  reference: string
  customerId: string
  customerName: string
  customerEmail: string
  contactPhone?: string
  alternateRecipient?: AlternateRecipient | null
  placedAt: string
  status: AdminOrderStatus
  paymentStatus: AdminOrderPaymentStatus
  lines: AdminOrderLine[]
  promotionCode: string | null
  paymentProvider: PaymentProvider
  deliveryMethod: DeliveryMethod
  address: DeliveryAddress
}

export interface ApprovedCheckoutOrderInput extends OrderTotals {
  simulation?: boolean
  reference: string
  placedAt: string
  lines: AdminOrderLine[]
  contact: CustomerContact
  address: DeliveryAddress
  alternateRecipient?: AlternateRecipient | null
  deliveryMethod: DeliveryMethod
  paymentProvider: PaymentProvider
  promotionCode: string | null
}

export type AdminCustomer = CustomerRecord

export interface AdminPromotion {
  /** Remote revision used for optimistic administrative changes. */
  version?: number
  id: string
  code: string
  active: boolean
  type: AdminPromotionType
  value: number
  minimumCents: number
  startsAt: string
  endsAt: string
  usageLimit: number | null
  used: number
}

export type AdminShippingZone = ShippingZone

export type AdminShippingSettings = ShippingSettings

export interface AdminState {
  shippingVersion?: number
  /** Optimistic revision of the published remote Home; zero means unconfigured. */
  homeVersion?: number
  homeSettingsVersion?: number
  /** Managed reference vocabulary, independent of product classification. */
  olfactoryFamilies?: OlfactoryFamilyDefinition[]
  /** One-time catalog registration, independent of later merchant edits. */
  catalogVersion?: number
  /** One-time local demonstration data, independent of later order edits. */
  demoOrdersVersion?: number
  /** Next automatic product code; persisted atomically to avoid reusing codes. */
  nextProductSku?: number
  /** Next automatic presentation SKU in the isolated local catalog adapter. */
  nextVariantSku?: number
  products: AdminProduct[]
  brands: AdminBrand[]
  orders: AdminOrder[]
  orderHistory: OrderHistoryEntry[]
  customers: AdminCustomer[]
  promotions: AdminPromotion[]
  shipping: AdminShippingSettings
  homeMedia: HomeMedia
  homeContent: HomeContent
  features: StoreFeatures
  revision: number
}

export type AdminSaveResult =
  { kind: 'saved' } | { kind: 'validation'; message: string }
