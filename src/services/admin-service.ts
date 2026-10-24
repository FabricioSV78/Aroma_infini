import {
  brands as fixtureBrands,
  products as fixtureProducts,
} from '../mocks/home'
import { getProductDetail } from '../mocks/product-details'
import {
  createRegisteredCatalogProducts,
  registeredCatalogIds,
} from '../content/catalog-products'
import {
  createDefaultHomeContent,
  normalizeHomeContent,
  validateHomeContent,
} from '../content/home-editor'
import { localAdminStateRepository } from './admin-persistence'
import { getVariantPrice, validateProductDiscount } from './product-discounts'
import { productImageAlt, withGeneratedGalleryAlts } from './product-image-alt'
import {
  isValidAlternateRecipient,
  type AlternateRecipient,
} from './shipping-recipient'
import { formatBrandName } from '../utils/brand-name'
import { validateProductOlfactoryClassification } from '../domain/olfactory-family'
import { normalizeSku, isValidSku } from '../domain/product-identity'
import {
  hasProductMainImage,
  hasProductStock,
} from '../domain/product-publication'
import {
  getOrderTransitionError,
  ORDER_STATUSES,
} from '../domain/order-workflow'
export { hasCompleteOrderDelivery } from '../domain/order-workflow'
import {
  normalizeStoreFeatures,
  validateStoreFeatures,
  type StoreFeatures,
} from '../domain/store-features'
import {
  isPerfume,
  isProductType,
  validPresentation,
  variantKey,
} from '../domain/product-type'
import {
  getPeruDepartmentLabel,
  getPeruDistrictLabel,
  getPeruProvinceOptions,
  getPeruProvinceLabel,
  isCoveredDeliveryLocation,
  isValidPeruLocation,
  getDeliveryArea,
  CALLAO_DEPARTMENT,
  CALLAO_PROVINCE,
  peruDepartments,
} from '../content/peru'
import {
  getAreaBaseShipping,
  isShippingDestinationEnabled,
} from './shipping-rates'
import type {
  Brand,
  Product,
  ProductDiscount,
  ProductAudience,
  ProductDetail,
  ProductVariant,
} from '../types/catalog'
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
} from '../types/commerce'
import type {
  HomeContent,
  HomeMedia as SharedHomeMedia,
  HomeMediaKey as SharedHomeMediaKey,
} from '../types/home'
import type { ShippingSettings, ShippingZone } from '../types/shipping'
import type {
  BulkOrderStatusResult,
  CreateOrderBatchResult,
  OrderBatch,
  OrderBatchUpdate,
  OrderHistoryEntry,
  OrderOperator,
} from '../types/order-workflow'

export type AdminGender = ProductAudience
export type HomeMediaKey = SharedHomeMediaKey
export type HomeMedia = SharedHomeMedia
export type AdminOrderStatus = OrderStatus
export type AdminOrderPaymentStatus = PaymentStatus
export type AdminPromotionType = 'percent' | 'fixed'

export interface AdminBrand extends Brand {
  active: boolean
}

export interface AdminProduct {
  product: Product
  detail: ProductDetail
  active: boolean
  gender: AdminGender | null
  popularity: number
  newest: number
  lowStockThreshold: number
}

function withStockVisibility(record: AdminProduct): AdminProduct {
  return record.active && !hasProductStock(record.product)
    ? { ...record, active: false }
    : record
}

function deactivateSoldOutProducts(records: AdminProduct[]): AdminProduct[] {
  let changed = false
  const products = records.map((record) => {
    const next = withStockVisibility(record)
    if (next !== record) changed = true
    return next
  })
  return changed ? products : records
}

function normalizeProductType(record: AdminProduct): AdminProduct {
  record = withoutRetiredSelection(record)
  record = {
    ...record,
    detail: withoutRetiredConcentration(record.detail),
    product: {
      ...record.product,
      variants: record.product.variants.map((variant) =>
        variant.sku === undefined
          ? variant
          : { ...variant, sku: normalizeSku(variant.sku) || undefined },
      ),
    },
  }
  if (isPerfume(record.product))
    return { ...record, product: { ...record.product, productType: 'perfume' } }
  return {
    ...record,
    gender: null,
    product: {
      ...record.product,
      family: '',
      olfactoryFamily: null,
      olfactoryFamilies: [],
    },
    detail: {
      ...record.detail,
      olfactoryImage: null,
      notes: { top: [], heart: [], base: [] },
      intensity: null,
      intensityLevel: null,
      occasion: '',
      season: '',
    },
  }
}

export type AdminOrderLine = PurchasedLine

export interface AdminOrder extends OrderTotals {
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
  /** One-time catalog registration, independent of later merchant edits. */
  catalogVersion?: number
  products: AdminProduct[]
  brands: AdminBrand[]
  orders: AdminOrder[]
  orderBatches: OrderBatch[]
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

const metadata: Record<
  string,
  Pick<AdminProduct, 'gender' | 'popularity' | 'newest'>
> = {
  neroli: { gender: 'unisex', popularity: 5, newest: 8 },
  iris: { gender: 'unisex', popularity: 6, newest: 7 },
  figue: { gender: 'unisex', popularity: 7, newest: 6 },
  santal: { gender: 'unisex', popularity: 8, newest: 5 },
  cedre: {
    gender: 'hombre',
    popularity: 1,
    newest: 3,
  },
  petale: {
    gender: 'mujer',
    popularity: 2,
    newest: 4,
  },
  sillage: {
    gender: 'unisex',
    popularity: 3,
    newest: 2,
  },
  ambre: {
    gender: 'unisex',
    popularity: 4,
    newest: 1,
  },
}

function cloneVariant(variant: ProductVariant): ProductVariant {
  return { ...variant }
}

function cloneProduct(product: Product): Product {
  return {
    ...product,
    olfactoryFamilies: product.olfactoryFamilies
      ? [...product.olfactoryFamilies]
      : product.olfactoryFamilies,
    variants: product.variants.map(cloneVariant),
    discount: product.discount ? { ...product.discount } : product.discount,
  }
}

/** Remove the retired concentration without changing the product classification. */
function withoutRetiredConcentration(detail: ProductDetail): ProductDetail {
  const current = { ...detail }
  Reflect.deleteProperty(current, 'type')
  return current
}

function cloneDetail(detail: ProductDetail): ProductDetail {
  return {
    ...withoutRetiredConcentration(detail),
    notes: {
      top: [...detail.notes.top],
      heart: [...detail.notes.heart],
      base: [...detail.notes.base],
    },
    gallery: detail.gallery.map((image) => ({ ...image })),
    recommendationIds: [...detail.recommendationIds],
  }
}

function hasUnchangedDemoNotes(
  detail: ProductDetail,
  original?: ProductDetail,
): boolean {
  if (!original) return false
  return (['top', 'heart', 'base'] as const).every(
    (stage) =>
      detail.notes[stage].length === original.notes[stage].length &&
      detail.notes[stage].every(
        (note, index) => note === original.notes[stage][index],
      ),
  )
}

export function createAdminProductDetail(
  product: Product,
  description = isPerfume(product)
    ? 'Descubre el carácter de esta fragancia y sus notas principales.'
    : '',
): ProductDetail {
  return {
    shortDescription: description,
    description,
    olfactoryImage: null,
    notes: { top: [], heart: [], base: [] },
    intensity: isPerfume(product) ? 'Moderada' : null,
    intensityLevel: isPerfume(product) ? 2 : null,
    occasion: isPerfume(product) ? 'Por definir' : '',
    season: isPerfume(product) ? 'Todo el año' : '',
    gallery: [
      {
        image: product.image,
        alt: product.image ? productImageAlt(product.name, '', 0) : '',
        framing: 'full',
      },
      ...(product.image
        ? [
            {
              image: `${product.image}-alternate`,
              alt: productImageAlt(product.name, '', 1),
              framing: 'full' as const,
            },
          ]
        : []),
    ],
    recommendationIds: [],
  }
}

function createInitialState(): AdminState {
  const productRecords = fixtureProducts.map<AdminProduct>((product) => {
    const detail =
      getProductDetail(product) ?? createAdminProductDetail(product)
    const productMetadata = metadata[product.id]
    return {
      product: cloneProduct(product),
      detail: cloneDetail(detail),
      active: hasProductStock(product),
      gender: productMetadata.gender,
      popularity: productMetadata.popularity,
      newest: productMetadata.newest,
      lowStockThreshold: 2,
    }
  })
  return {
    catalogVersion: 1,
    products: [
      ...productRecords,
      ...createRegisteredCatalogProducts(productRecords),
    ],
    brands: fixtureBrands.map((brand) => ({ ...brand, active: true })),
    orders: [
      {
        reference: 'AI-210926-01',
        customerId: 'customer-demo-2',
        customerName: 'Cliente 02',
        customerEmail: '—',
        placedAt: '2026-09-21T15:15:00.000Z',
        status: 'received',
        paymentStatus: 'approved',
        lines: [
          {
            variantId: 'cedre-50',
            brand: 'Atelier 01',
            name: 'Bois Clair',
            ml: 50,
            quantity: 1,
            unitPriceCents: 39000,
          },
        ],
        subtotalCents: 39000,
        discountCents: 0,
        shippingCents: 2000,
        totalCents: 41000,
        promotionCode: null,
        paymentProvider: 'mercado-pago',
        deliveryMethod: 'courier',
        address: {
          department: 'Lima',
          province: 'Lima',
          district: 'San Isidro',
          street: 'Dirección registrada',
        },
      },
      {
        reference: 'AI-200926-01',
        customerId: 'customer-demo-4',
        customerName: 'Cliente 03',
        customerEmail: '—',
        placedAt: '2026-09-20T21:15:00.000Z',
        status: 'preparing',
        paymentStatus: 'approved',
        lines: [
          {
            variantId: 'petale-100',
            brand: 'Forme',
            name: 'Pétale Nu',
            ml: 100,
            quantity: 1,
            unitPriceCents: 62000,
          },
        ],
        subtotalCents: 62000,
        discountCents: 0,
        shippingCents: 0,
        totalCents: 62000,
        promotionCode: null,
        paymentProvider: 'mercado-pago',
        deliveryMethod: 'courier',
        address: {
          department: 'Lima',
          province: 'Lima',
          district: 'Miraflores',
          street: 'Dirección registrada',
        },
      },
      {
        reference: 'AI-A1B2C3D4E5F60708',
        customerId: 'customer-demo-1',
        customerName: 'Cliente 01',
        customerEmail: '—',
        placedAt: '2026-09-09T15:30:00.000Z',
        status: 'shipped',
        paymentStatus: 'approved',
        lines: [
          {
            variantId: 'petale-50',
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
        promotionCode: null,
        paymentProvider: 'mercado-pago',
        deliveryMethod: 'motorizado',
        address: {
          department: 'Lima',
          province: 'Lima',
          district: 'Miraflores',
          street: 'Dirección registrada',
        },
      },
      {
        reference: 'AI-150926-01',
        customerId: 'customer-demo-2',
        customerName: 'Cliente 02',
        customerEmail: '—',
        placedAt: '2026-09-15T17:00:00.000Z',
        status: 'delivered',
        paymentStatus: 'approved',
        lines: [
          {
            variantId: 'sillage-75',
            brand: 'Studio sillage',
            name: 'Vert Silence',
            ml: 75,
            quantity: 1,
            unitPriceCents: 48000,
          },
        ],
        subtotalCents: 48000,
        discountCents: 0,
        shippingCents: 2000,
        totalCents: 50000,
        promotionCode: null,
        paymentProvider: 'mercado-pago',
        deliveryMethod: 'courier',
        address: {
          department: 'Arequipa',
          province: 'Arequipa',
          district: 'Cayma',
          street: 'Dirección registrada',
        },
      },
    ],
    customers: [
      {
        id: 'customer-demo-1',
        name: 'Cliente 01',
        email: '—',
        phone: '—',
      },
      {
        id: 'customer-demo-2',
        name: 'Cliente 02',
        email: '—',
        phone: '—',
      },
      {
        id: 'customer-demo-4',
        name: 'Cliente 03',
        email: '—',
        phone: '—',
      },
    ],
    promotions: [],
    shipping: {
      freeThresholdCents: 45000,
      provinceShippingEnabled: false,
      nationalCourierFeeCents: 3500,
      nationalEstimate: 'Hasta 5 días',
      zones: [
        {
          id: 'zone-lima',
          name: 'Lima',
          department: 'lima',
          province: '1501',
          district: null,
          courierFeeCents: 2000,
          motorizadoFeeCents: 1500,
          estimate: 'Hasta 48 horas',
          active: true,
        },
        {
          id: 'zone-callao',
          name: 'Callao',
          department: CALLAO_DEPARTMENT,
          province: CALLAO_PROVINCE,
          district: null,
          courierFeeCents: 2000,
          motorizadoFeeCents: 1500,
          estimate: 'Hasta 48 horas',
          active: true,
        },
      ],
    },
    homeMedia: {
      hombre: null,
      mujer: null,
      unisex: null,
      complementos: null,
    },
    homeContent: createDefaultHomeContent(),
    features: normalizeStoreFeatures(),
    orderBatches: [],
    orderHistory: [],
    revision: 0,
  }
}

let state = createInitialState()
const listeners = new Set<() => void>()
let persistenceQueue: Promise<void> = Promise.resolve()
let hydrationPromise: Promise<void> | undefined

/** Drop the retired selection without resetting saved catalog or Home edits. */
function withoutRetiredSelection<T extends object>(value: T): T {
  const copy = { ...value }
  Reflect.deleteProperty(copy, 'featured')
  Reflect.deleteProperty(copy, 'featuredOrder')
  return copy
}

export function hydrateAdminStore() {
  hydrationPromise ??= (async () => {
    try {
      const saved = await localAdminStateRepository.read()
      if (!saved || !Array.isArray(saved.products)) {
        persist(state)
        await persistenceQueue
        return
      }
      const initial = createInitialState()
      state = {
        ...initial,
        ...withoutRetiredSelection(saved),
        catalogVersion: saved.catalogVersion ?? 0,
        orderBatches: Array.isArray(saved.orderBatches)
          ? saved.orderBatches
          : [],
        orderHistory: Array.isArray(saved.orderHistory)
          ? saved.orderHistory
          : [],
        products: saved.products.map((record) => {
          const legacyImages: Record<string, string> = {
            neroli: 'cedre',
            iris: 'petale',
            figue: 'sillage',
            santal: 'ambre',
          }
          const legacy = legacyImages[record.product.id]
          const product =
            legacy && record.product.image === legacy
              ? { ...record.product, image: record.product.id }
              : record.product
          const defaultRecord = initial.products.find(
            (item) => item.product.id === product.id,
          )
          const fixtureKeys = [product.id, legacy]
            .filter(Boolean)
            .flatMap((key) => [
              key,
              `${key}-alternate`,
              `${key}-detail`,
              `${key}-back`,
            ])
          const hasOnlyFixturePhotos =
            product.image === product.id &&
            record.detail.gallery.every((view) =>
              fixtureKeys.includes(view.image),
            )
          const gallery =
            hasOnlyFixturePhotos && defaultRecord
              ? cloneDetail(defaultRecord.detail).gallery
              : record.detail.gallery
                  .filter(
                    (view, index, views) =>
                      views.findIndex((item) => item.image === view.image) ===
                      index,
                  )
                  .filter(
                    (view) => !(legacy && view.image === `${legacy}-alternate`),
                  )
                  .map((view) =>
                    legacy && view.image === legacy
                      ? { ...view, image: product.image }
                      : view,
                  )
          return {
            ...withoutRetiredSelection(record),
            active: record.active && hasProductStock(product),
            product,
            detail: {
              ...withoutRetiredConcentration(record.detail),
              // Old records displayed a demo photo only while notes matched.
              // Preserve that exact visual before making the image editable.
              olfactoryImage:
                record.detail.olfactoryImage === undefined
                  ? hasUnchangedDemoNotes(record.detail, defaultRecord?.detail)
                    ? (defaultRecord?.detail.olfactoryImage ?? null)
                    : null
                  : record.detail.olfactoryImage,
              gallery,
            },
          }
        }),
        brands: (saved.brands ?? initial.brands).map((brand) => ({
          ...brand,
          name: formatBrandName(brand.name),
        })),
        shipping: {
          ...initial.shipping,
          ...saved.shipping,
          provinceShippingEnabled:
            saved.shipping?.provinceShippingEnabled === true,
          zones: (() => {
            const previous = Array.isArray(saved.shipping?.zones)
              ? saved.shipping.zones
              : initial.shipping.zones
            if (
              previous.some(
                (zone) =>
                  normalizeKey(zone.department) === CALLAO_DEPARTMENT &&
                  zone.province === CALLAO_PROVINCE &&
                  !zone.district,
              )
            )
              return previous
            const rate = getAreaBaseShipping(
              { ...initial.shipping, ...saved.shipping, zones: previous },
              CALLAO_DEPARTMENT,
            )
            return [
              ...previous,
              {
                id: 'zone-callao',
                name: 'Callao',
                department: CALLAO_DEPARTMENT,
                province: CALLAO_PROVINCE,
                district: null,
                ...rate,
                active: true,
              },
            ]
          })(),
        },
        homeMedia: {
          hombre: saved.homeMedia?.hombre ?? null,
          mujer: saved.homeMedia?.mujer ?? null,
          unisex: saved.homeMedia?.unisex ?? null,
          complementos: saved.homeMedia?.complementos ?? null,
        },
        homeContent: normalizeHomeContent(saved.homeContent),
        features: normalizeStoreFeatures(saved.features),
      }
      if (
        saved.products.some(
          (record) =>
            Object.hasOwn(record.detail, 'type') ||
            (record.active && !hasProductStock(record.product)),
        )
      ) {
        persist(state)
        await persistenceQueue.catch(() => undefined)
      }
      listeners.forEach((listener) => listener())
    } catch {
      // The storefront remains available when browser storage is unavailable.
    }
  })().then(completeCatalogRegistration)
  return hydrationPromise
}

async function completeCatalogRegistration() {
  if ((state.catalogVersion ?? 0) >= 1) return
  const existing = state.products.filter(
    ({ product }) => !/^pagination-sample-\d+$/.test(product.id),
  )
  const activeBrands = new Set(
    state.brands.filter((brand) => brand.active).map((brand) => brand.id),
  )
  const visibleCount = existing.filter(
    (record) =>
      record.active &&
      hasProductStock(record.product) &&
      hasProductMainImage(record) &&
      (isPerfume(record.product) || state.features.complementsEnabled) &&
      (activeBrands.has(record.product.brandId) ||
        (!isPerfume(record.product) && !record.product.brandId)),
  ).length
  const additions = createInitialState()
    .products.filter(
      ({ product }) =>
        registeredCatalogIds.has(product.id) &&
        activeBrands.has(product.brandId) &&
        !product.variants.some((variant) =>
          state.products.some((record) =>
            record.product.variants.some(
              (current) =>
                current.id === variant.id ||
                (variant.sku &&
                  current.sku &&
                  normalizeSku(current.sku) === normalizeSku(variant.sku)),
            ),
          ),
        ) &&
        !existing.some(
          (record) =>
            record.product.id === product.id ||
            record.product.slug.toLowerCase() === product.slug ||
            (record.product.brandId === product.brandId &&
              normalizeKey(record.product.name) === normalizeKey(product.name)),
        ),
    )
    .slice(0, Math.max(0, 15 - visibleCount))
  if (additions.length) {
    const result = adminService.saveProductsBatch(additions, state.revision)
    if (result.kind !== 'saved') throw new Error(result.message)
  }
  commit((current) => ({
    ...current,
    catalogVersion: 1,
    products: current.products.filter(
      ({ product }) => !/^pagination-sample-\d+$/.test(product.id),
    ),
  }))
  // A storage failure must not block the storefront. The rejected queue stays
  // available to flush/retryPersistence so a later save can report the error.
  await persistenceQueue.catch(() => undefined)
}

function persist(snapshot: AdminState) {
  persistenceQueue = persistenceQueue
    .catch(() => undefined)
    .then(() => localAdminStateRepository.write(snapshot))
}

function commit(update: (current: AdminState) => AdminState) {
  const next = update(state)
  state = {
    ...next,
    products: deactivateSoldOutProducts(next.products),
    revision: state.revision + 1,
  }
  persist(state)
  listeners.forEach((listener) => listener())
}

function validSlug(slug: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
}

function isNonNegativeInteger(value: number) {
  return Number.isInteger(value) && value >= 0
}

function isPositiveInteger(value: number) {
  return Number.isInteger(value) && value > 0
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function normalizeKey(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function resolveShippingZone(
  shipping: AdminShippingSettings,
  department: string,
  province = '',
  district = '',
) {
  const normalizedDepartment = normalizeKey(department)
  if (
    !isShippingDestinationEnabled(
      shipping,
      normalizedDepartment,
      province,
      district,
    )
  )
    return undefined
  const isCapital = isCoveredDeliveryLocation(
    normalizedDepartment,
    province,
    district,
  )
  const override = shipping.zones
    .filter(
      (zone) =>
        zone.active &&
        normalizeKey(zone.department) === normalizedDepartment &&
        (!zone.province || zone.province === province) &&
        (!zone.district || zone.district === district) &&
        // Una tarifa departamental futura de Lima no reemplaza su tarifa local.
        (!isCapital || Boolean(zone.province || zone.district)),
    )
    .sort(
      (left, right) =>
        Number(Boolean(right.district)) - Number(Boolean(left.district)) ||
        Number(Boolean(right.province)) - Number(Boolean(left.province)),
    )[0]
  if (override) return override
  const area = getDeliveryArea(normalizedDepartment)
  if (!isCapital)
    return {
      id: 'province-base',
      name: 'Provincias',
      department: normalizedDepartment,
      province: null,
      district: null,
      courierFeeCents: shipping.nationalCourierFeeCents,
      motorizadoFeeCents: null,
      estimate: shipping.nationalEstimate,
      active: true,
    } satisfies AdminShippingZone
  return {
    id: `${area!.department}-base`,
    name: area!.label,
    department: area!.department,
    province: area!.province,
    district: null,
    ...getAreaBaseShipping(shipping, area!.department),
    active: true,
  } satisfies AdminShippingZone
}

function promotionDiscount(promotion: AdminPromotion, subtotalCents: number) {
  return promotion.type === 'percent'
    ? Math.round((subtotalCents * promotion.value) / 100)
    : Math.min(subtotalCents, Math.round(promotion.value * 100))
}

function normalizeOrderOperator(
  operator: OrderOperator | undefined,
): OrderOperator | null {
  const name = typeof operator?.name === 'string' ? operator.name.trim() : ''
  if (name.length < 2 || name.length > 80 || /[\r\n\t]/.test(name)) return null
  return { name, verified: false, id: null }
}

function normalizeOrderReferences(references: string[]): string[] {
  return Array.isArray(references)
    ? [
        ...new Set(
          references
            .filter((reference) => typeof reference === 'string')
            .map((reference) => reference.trim())
            .filter(Boolean),
        ),
      ]
    : []
}

function validateBatchReferences(
  references: string[],
  archived: boolean,
  excludedBatchId?: string,
): string | null {
  if (!references.length) return 'Selecciona al menos un pedido para el lote.'
  const orderReferences = new Set(state.orders.map((order) => order.reference))
  const missing = references.filter(
    (reference) => !orderReferences.has(reference),
  )
  if (missing.length)
    return `Estos pedidos ya no existen: ${missing.join(', ')}.`
  if (archived) return null
  const requested = new Set(references)
  const conflicts = state.orderBatches.filter(
    (batch) =>
      batch.id !== excludedBatchId &&
      !batch.archived &&
      batch.orderReferences.some((reference) => requested.has(reference)),
  )
  if (conflicts.length)
    return `Hay pedidos asignados a otro lote activo (${conflicts.map((batch) => batch.name).join(', ')}). Selecciona pedidos sin lote para crear una agrupación nueva.`
  return null
}

function createOrderHistory(
  order: AdminOrder,
  toStatus: OrderStatus,
  operator: OrderOperator,
  operationId: string,
  source: OrderHistoryEntry['source'],
  changedAt: string,
): OrderHistoryEntry {
  return {
    id: crypto.randomUUID(),
    reference: order.reference,
    fromStatus: order.status,
    toStatus,
    changedAt,
    operator: { ...operator },
    operationId,
    source,
  }
}

export const adminService = {
  getSnapshot() {
    return state
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  reset() {
    state = createInitialState()
    persist(state)
    listeners.forEach((listener) => listener())
  },
  flush() {
    return persistenceQueue
  },
  retryPersistence(): Promise<void> {
    persist(state)
    return persistenceQueue
  },
  saveProduct(record: AdminProduct): AdminSaveResult {
    record = withStockVisibility(normalizeProductType(record))
    const product = record.product
    const perfume = isPerfume(product)
    if (!isProductType(product.productType))
      return {
        kind: 'validation',
        message: 'Selecciona un tipo de producto válido.',
      }
    const discountError = validateProductDiscount(
      product.discount,
      product.variants,
    )
    if (discountError) return { kind: 'validation', message: discountError }
    const olfactoryError = validateProductOlfactoryClassification(product)
    if (olfactoryError)
      return {
        kind: 'validation',
        message: olfactoryError,
      }
    if (record.active && !hasProductMainImage(record))
      return {
        kind: 'validation',
        message: 'Selecciona o sube una fotografía principal.',
      }
    if (!product.name.trim() || !validSlug(product.slug))
      return {
        kind: 'validation',
        message: 'Completa el nombre y usa un slug válido.',
      }
    if (
      !record.detail.shortDescription.trim() ||
      !record.detail.description.trim()
    )
      return {
        kind: 'validation',
        message: 'Completa las descripciones del producto.',
      }
    const duplicateSlug = state.products.some(
      (item) =>
        item.product.id !== product.id && item.product.slug === product.slug,
    )
    if (duplicateSlug)
      return { kind: 'validation', message: 'Ese slug ya está en uso.' }
    const previousRecord = state.products.find(
      (item) => item.product.id === product.id,
    )
    const recommendationIds = record.detail.recommendationIds
    if (
      !Array.isArray(recommendationIds) ||
      recommendationIds.length > 4 ||
      new Set(recommendationIds).size !== recommendationIds.length ||
      recommendationIds.includes(product.id) ||
      recommendationIds.some((id) => {
        const recommendation = state.products.find(
          (item) => item.product.id === id,
        )
        if (!recommendation) return true
        // An exhausted recommendation is hidden publicly, but its saved link
        // must not prevent editing this product or be lost during replenishment.
        if (previousRecord?.detail.recommendationIds.includes(id)) return false
        return (
          !recommendation.active ||
          ((isPerfume(recommendation.product) ||
            recommendation.product.brandId) &&
            !state.brands.some(
              (brand) =>
                brand.id === recommendation.product.brandId && brand.active,
            ))
        )
      })
    )
      return {
        kind: 'validation',
        message:
          'Elige hasta cuatro productos disponibles, sin repetir ni incluir este producto.',
      }
    const brand = state.brands.find((item) => item.id === product.brandId)
    if (
      (!brand && (perfume || product.brandId)) ||
      (record.active && brand && !brand.active)
    )
      return {
        kind: 'validation',
        message: 'Selecciona una marca disponible antes de publicar.',
      }
    const presentations = product.variants.map(variantKey)
    const variantIds = product.variants.map((variant) => variant.id)
    const otherVariantIds = new Set(
      state.products
        .filter((item) => item.product.id !== product.id)
        .flatMap((item) => item.product.variants.map((variant) => variant.id)),
    )
    const skus = new Set<string>()
    const otherSkus = new Set(
      state.products
        .filter((item) => item.product.id !== product.id)
        .flatMap((item) =>
          item.product.variants
            .map((variant) => normalizeSku(variant.sku ?? ''))
            .filter(Boolean),
        ),
    )
    for (const variant of product.variants) {
      const sku = normalizeSku(variant.sku ?? '')
      if (!sku) continue
      if (!isValidSku(sku) || skus.has(sku) || otherSkus.has(sku))
        return {
          kind: 'validation',
          message: `SKU ${sku}: usa un código único de hasta 64 letras, números, puntos, guiones o guiones bajos.`,
        }
      skus.add(sku)
    }
    const activeVariants = product.variants.filter(
      (variant) => variant.active !== false,
    )
    if (
      !product.variants.length ||
      new Set(presentations).size !== presentations.length ||
      new Set(variantIds).size !== variantIds.length ||
      variantIds.some((id) => otherVariantIds.has(id)) ||
      !Number.isInteger(record.lowStockThreshold) ||
      record.lowStockThreshold < 0 ||
      product.variants.some(
        (variant) =>
          !validPresentation(product, variant) ||
          !Number.isInteger(variant.priceCents) ||
          !Number.isInteger(variant.stock) ||
          variant.priceCents < 0 ||
          variant.stock < 0,
      )
    )
      return {
        kind: 'validation',
        message:
          'Revisa presentaciones duplicadas, identificadores, stock y umbral.',
      }
    if (
      record.active &&
      (!activeVariants.length ||
        activeVariants.some((variant) => variant.priceCents <= 0))
    )
      return {
        kind: 'validation',
        message:
          'Un producto visible necesita una presentación activa con precio mayor que cero.',
      }
    const saved: AdminProduct = {
      ...record,
      product: cloneProduct({
        ...product,
        name: product.name.trim(),
        slug: product.slug.trim(),
        family: product.family.trim(),
      }),
      detail: cloneDetail({
        ...record.detail,
        gallery: withGeneratedGalleryAlts(
          record.detail.gallery,
          product.name,
          brand?.name ?? '',
          previousRecord && {
            gallery: previousRecord.detail.gallery,
            productName: previousRecord.product.name,
            brandName:
              state.brands.find(
                (item) => item.id === previousRecord.product.brandId,
              )?.name ?? '',
          },
        ),
      }),
    }
    commit((current) => {
      const exists = current.products.some(
        (item) => item.product.id === product.id,
      )
      return {
        ...current,
        products: exists
          ? current.products.map((item) =>
              item.product.id === product.id ? saved : item,
            )
          : [...current.products, saved],
      }
    })
    return { kind: 'saved' }
  },
  saveProductDiscount(
    productId: string,
    discount: ProductDiscount | null,
  ): AdminSaveResult {
    const record = state.products.find((item) => item.product.id === productId)
    if (!record)
      return { kind: 'validation', message: 'No encontramos ese producto.' }
    const error = validateProductDiscount(discount, record.product.variants)
    if (error) return { kind: 'validation', message: error }
    commit((current) => ({
      ...current,
      products: current.products.map((item) =>
        item.product.id === productId
          ? {
              ...item,
              product: {
                ...item.product,
                discount: discount ? { ...discount } : null,
              },
            }
          : item,
      ),
    }))
    return { kind: 'saved' }
  },
  saveProductsBatch(
    records: readonly AdminProduct[],
    expectedRevision: number,
  ): AdminSaveResult {
    records = records.map((record) =>
      withStockVisibility(normalizeProductType(record)),
    )
    if (state.revision !== expectedRevision)
      return {
        kind: 'validation',
        message:
          'El catálogo cambió mientras revisabas el archivo. Vuelve a cargarlo para validar los datos actuales.',
      }
    if (!records.length)
      return {
        kind: 'validation',
        message: 'No hay productos válidos para importar.',
      }
    const existingSlugs = new Set(
      state.products.map((item) => item.product.slug.toLowerCase()),
    )
    const existingIds = new Set(state.products.map((item) => item.product.id))
    const existingNames = new Set(
      state.products.map(
        (item) => `${item.product.brandId}:${normalizeKey(item.product.name)}`,
      ),
    )
    const batchSlugs = new Set<string>()
    const batchIds = new Set<string>()
    const batchNames = new Set<string>()
    const variantIds = new Set(
      state.products.flatMap((item) =>
        item.product.variants.map((variant) => variant.id),
      ),
    )
    const skus = new Set(
      state.products.flatMap((item) =>
        item.product.variants
          .map((variant) => normalizeSku(variant.sku ?? ''))
          .filter(Boolean),
      ),
    )
    for (const record of records) {
      const product = record.product
      if (!isProductType(product.productType))
        return {
          kind: 'validation',
          message: 'Selecciona un tipo de producto válido.',
        }
      const discountError = validateProductDiscount(
        product.discount,
        product.variants,
      )
      if (discountError)
        return {
          kind: 'validation',
          message: `${product.name || product.slug}: ${discountError}`,
        }
      const slug = product.slug.toLowerCase()
      const nameKey = `${product.brandId}:${normalizeKey(product.name)}`
      const brand = state.brands.find((item) => item.id === product.brandId)
      if (
        !validSlug(product.slug) ||
        !product.name.trim() ||
        (isPerfume(product) && !product.family.trim()) ||
        !record.detail.description.trim()
      )
        return {
          kind: 'validation',
          message: `Revisa nombre, slug, familia y descripción de ${product.name || product.slug}.`,
        }
      if (validateProductOlfactoryClassification(product))
        return {
          kind: 'validation',
          message: `Revisa la familia olfativa y el perfil aromático breve de ${product.name || product.slug}.`,
        }
      if (
        existingSlugs.has(slug) ||
        batchSlugs.has(slug) ||
        existingIds.has(product.id) ||
        batchIds.has(product.id) ||
        existingNames.has(nameKey) ||
        batchNames.has(nameKey)
      )
        return {
          kind: 'validation',
          message: `El producto ${product.name} ya existe o está duplicado en el archivo.`,
        }
      if (
        (!brand && (isPerfume(product) || product.brandId)) ||
        (record.active && brand && !brand.active)
      )
        return {
          kind: 'validation',
          message: `La marca de ${product.name} no está disponible.`,
        }
      if (
        isPerfume(product) &&
        !['hombre', 'mujer', 'unisex'].includes(record.gender ?? '')
      )
        return {
          kind: 'validation',
          message: `El género de ${product.name} no es válido.`,
        }
      if (record.active && !hasProductMainImage(record))
        return {
          kind: 'validation',
          message: `${product.name} necesita una imagen antes de publicarse.`,
        }
      if (
        !isNonNegativeInteger(record.lowStockThreshold) ||
        !product.variants.length
      )
        return {
          kind: 'validation',
          message: `Revisa el umbral y las presentaciones de ${product.name}.`,
        }
      const sizes = new Set<string>()
      for (const variant of product.variants) {
        const sku = normalizeSku(variant.sku ?? '')
        if (sku && (!isValidSku(sku) || skus.has(sku)))
          return {
            kind: 'validation',
            message: `SKU ${sku} de ${product.name}: el código no es válido o ya está registrado.`,
          }
        if (
          !validPresentation(product, variant) ||
          !isPositiveInteger(variant.priceCents) ||
          !isNonNegativeInteger(variant.stock) ||
          sizes.has(variantKey(variant)) ||
          variantIds.has(variant.id)
        )
          return {
            kind: 'validation',
            message: `Revisa precios, tamaños y stock de ${product.name}.`,
          }
        sizes.add(variantKey(variant))
        variantIds.add(variant.id)
        if (sku) skus.add(sku)
      }
      batchSlugs.add(slug)
      batchIds.add(product.id)
      batchNames.add(nameKey)
    }
    const saved = records.map((record) => ({
      ...record,
      product: cloneProduct(record.product),
      detail: cloneDetail({
        ...record.detail,
        gallery: withGeneratedGalleryAlts(
          record.detail.gallery,
          record.product.name,
          state.brands.find((brand) => brand.id === record.product.brandId)
            ?.name ?? '',
        ),
      }),
    }))
    commit((current) => ({
      ...current,
      products: [...current.products, ...saved],
    }))
    return { kind: 'saved' }
  },
  setProductActive(id: string, active: boolean): AdminSaveResult {
    const record = state.products.find((item) => item.product.id === id)
    if (!record)
      return { kind: 'validation', message: 'El producto ya no existe.' }
    if (active && !hasProductStock(record.product))
      return {
        kind: 'validation',
        message:
          'Añade stock a una presentación activa antes de publicar el producto.',
      }
    return adminService.saveProduct({ ...record, active })
  },
  saveStoreFeatures(features: StoreFeatures): AdminSaveResult {
    const error = validateStoreFeatures(features)
    if (error) return { kind: 'validation', message: error }
    commit((current) => ({
      ...current,
      features: normalizeStoreFeatures(features),
    }))
    return { kind: 'saved' }
  },
  saveHome(
    homeMedia: HomeMedia,
    homeContent: HomeContent,
    features?: StoreFeatures,
  ): AdminSaveResult {
    const contentError = validateHomeContent(homeContent)
    if (contentError) return { kind: 'validation', message: contentError }
    const normalizedContent = normalizeHomeContent(homeContent)
    if (
      normalizedContent.featuredBrandId !== null &&
      normalizedContent.featuredBrandId !== state.homeContent.featuredBrandId &&
      !state.brands.some(
        (brand) =>
          brand.id === normalizedContent.featuredBrandId && brand.active,
      )
    )
      return {
        kind: 'validation',
        message: 'Selecciona una marca activa para destacarla.',
      }
    if (features !== undefined) {
      const featureError = validateStoreFeatures(features)
      if (featureError) return { kind: 'validation', message: featureError }
    }
    commit((current) => ({
      ...current,
      homeMedia: withoutRetiredSelection(homeMedia),
      homeContent: normalizedContent,
      features:
        features === undefined
          ? current.features
          : normalizeStoreFeatures(features),
    }))
    return { kind: 'saved' }
  },
  saveBrand(brand: AdminBrand): AdminSaveResult {
    const normalized = {
      ...brand,
      name: formatBrandName(brand.name),
      slug: brand.slug.trim(),
    }
    if (!normalized.name || !validSlug(normalized.slug))
      return {
        kind: 'validation',
        message: 'Completa el nombre y usa un slug válido.',
      }
    if (
      state.brands.some(
        (item) => item.id !== brand.id && item.slug === normalized.slug,
      )
    )
      return { kind: 'validation', message: 'Ese slug ya está en uso.' }
    commit((current) => {
      const exists = current.brands.some((item) => item.id === brand.id)
      return {
        ...current,
        brands: exists
          ? current.brands.map((item) =>
              item.id === brand.id ? normalized : item,
            )
          : [...current.brands, normalized],
      }
    })
    return { kind: 'saved' }
  },
  setBrandActive(id: string, active: boolean): AdminSaveResult {
    if (
      !active &&
      state.products.some((item) => item.active && item.product.brandId === id)
    )
      return {
        kind: 'validation',
        message: 'Desactiva primero los productos visibles de esta marca.',
      }
    commit((current) => ({
      ...current,
      brands: current.brands.map((item) =>
        item.id === id ? { ...item, active } : item,
      ),
    }))
    return { kind: 'saved' }
  },
  recordApprovedCheckout(order: ApprovedCheckoutOrderInput): AdminSaveResult {
    if (state.orders.some((item) => item.reference === order.reference))
      return { kind: 'saved' }

    const customerEmail = normalizeEmail(order.contact.email)
    const customerName =
      `${order.contact.firstName.trim()} ${order.contact.lastName.trim()}`.trim()
    if (
      !order.reference.trim() ||
      !/^AI-[A-F0-9]{16}$/.test(order.reference) ||
      !customerName ||
      !customerEmail ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) ||
      !/^9\d{8}$/.test(order.contact.phone.trim()) ||
      (order.alternateRecipient !== null &&
        order.alternateRecipient !== undefined &&
        !isValidAlternateRecipient(order.alternateRecipient)) ||
      !order.address.department.trim() ||
      !order.address.province.trim() ||
      !order.address.district.trim() ||
      !isShippingDestinationEnabled(
        state.shipping,
        order.address.department,
        order.address.province,
        order.address.district,
      ) ||
      !order.address.street.trim() ||
      Number.isNaN(Date.parse(order.placedAt)) ||
      !order.lines.length ||
      !isNonNegativeInteger(order.subtotalCents) ||
      !isNonNegativeInteger(order.discountCents) ||
      !isNonNegativeInteger(order.shippingCents) ||
      !isNonNegativeInteger(order.totalCents)
    )
      return {
        kind: 'validation',
        message: 'La compra aprobada contiene datos incompletos o inválidos.',
      }

    const activeBrandIds = new Set(
      state.brands.filter((brand) => brand.active).map((brand) => brand.id),
    )
    const now = Date.now()
    const resolvedLines = order.lines.map((line) => {
      const record = state.products.find((item) =>
        item.product.variants.some((variant) => variant.id === line.variantId),
      )
      const variant = record?.product.variants.find(
        (item) => item.id === line.variantId,
      )
      const brand = record
        ? state.brands.find((item) => item.id === record.product.brandId)
        : undefined
      const price =
        record && variant
          ? getVariantPrice(record.product, variant, now)
          : undefined
      return { line, record, variant, brand, price }
    })
    if (
      new Set(order.lines.map((line) => line.variantId)).size !==
        order.lines.length ||
      resolvedLines.some(
        ({ line, record, variant, brand, price }) =>
          !record ||
          !record.active ||
          (!isPerfume(record.product) && !state.features.complementsEnabled) ||
          ((isPerfume(record.product) || record.product.brandId) &&
            !activeBrandIds.has(record.product.brandId)) ||
          !variant ||
          variant.active === false ||
          !isPositiveInteger(line.quantity) ||
          variant.stock < line.quantity ||
          !price ||
          price.finalCents !== line.unitPriceCents ||
          (price.discountActive
            ? line.originalUnitPriceCents !== price.originalCents
            : line.originalUnitPriceCents !== undefined &&
              line.originalUnitPriceCents !== price.originalCents) ||
          variant.ml !== line.ml ||
          (variant.label ?? '') !== (line.variantLabel ?? '') ||
          record.product.name !== line.name ||
          (brand?.name ?? '') !== line.brand,
      )
    )
      return {
        kind: 'validation',
        message:
          'El precio, la presentación o el stock cambió. Revisa el carrito antes de continuar.',
      }

    const expectedSubtotal = order.lines.reduce(
      (total, line) => total + line.unitPriceCents * line.quantity,
      0,
    )
    const deliveryZone = resolveShippingZone(
      state.shipping,
      order.address.department,
      order.address.province,
      order.address.district,
    )
    const expectedShippingCents = deliveryZone
      ? order.deliveryMethod === 'motorizado' &&
        deliveryZone.motorizadoFeeCents === null
        ? null
        : state.shipping.freeThresholdCents > 0 &&
            order.subtotalCents >= state.shipping.freeThresholdCents
          ? 0
          : order.deliveryMethod === 'motorizado'
            ? deliveryZone.motorizadoFeeCents
            : deliveryZone.courierFeeCents
      : null
    if (
      expectedSubtotal !== order.subtotalCents ||
      order.discountCents > order.subtotalCents ||
      expectedShippingCents === null ||
      expectedShippingCents !== order.shippingCents ||
      order.totalCents !==
        order.subtotalCents - order.discountCents + order.shippingCents
    )
      return {
        kind: 'validation',
        message: 'Los importes de la compra ya no son válidos.',
      }

    const promotion = order.promotionCode
      ? state.promotions.find(
          (item) => item.code === order.promotionCode?.trim().toUpperCase(),
        )
      : null
    const hasProductDiscounts = resolvedLines.some(
      ({ price }) => price?.discountActive,
    )
    const invalidPromotion = promotion
      ? hasProductDiscounts ||
        !promotion.active ||
        order.subtotalCents < promotion.minimumCents ||
        (promotion.startsAt && new Date(promotion.startsAt).getTime() > now) ||
        (promotion.endsAt && new Date(promotion.endsAt).getTime() < now) ||
        (promotion.usageLimit !== null &&
          promotion.used >= promotion.usageLimit) ||
        promotionDiscount(promotion, order.subtotalCents) !==
          order.discountCents
      : order.promotionCode !== null || order.discountCents !== 0
    if (invalidPromotion)
      return {
        kind: 'validation',
        message: 'La promoción ya no está disponible. Revisa el total.',
      }

    const existingCustomer = state.customers.find(
      (customer) => normalizeEmail(customer.email) === customerEmail,
    )
    const customerId =
      existingCustomer?.id ??
      `customer-${order.reference.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
    const savedOrder: AdminOrder = {
      reference: order.reference,
      customerId,
      customerName,
      customerEmail,
      contactPhone: order.contact.phone.trim(),
      alternateRecipient: order.alternateRecipient
        ? {
            name: order.alternateRecipient.name.trim(),
            dni: order.alternateRecipient.dni.trim(),
          }
        : null,
      placedAt: order.placedAt,
      status: 'received',
      paymentStatus: 'approved',
      lines: order.lines.map((line) => ({ ...line })),
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      shippingCents: order.shippingCents,
      totalCents: order.totalCents,
      promotionCode: promotion?.code ?? null,
      paymentProvider: 'mercado-pago',
      deliveryMethod: order.deliveryMethod,
      address: {
        ...order.address,
        department: getPeruDepartmentLabel(order.address.department),
        province: getPeruProvinceLabel(order.address.province),
        district: getPeruDistrictLabel(order.address.district),
        reference: order.address.reference?.trim() ?? '',
      },
    }

    commit((current) => ({
      ...current,
      products: current.products.map((record) => ({
        ...record,
        product: {
          ...record.product,
          variants: record.product.variants.map((variant) => {
            const line = order.lines.find(
              (item) => item.variantId === variant.id,
            )
            return line
              ? { ...variant, stock: variant.stock - line.quantity }
              : variant
          }),
        },
      })),
      orders: [savedOrder, ...current.orders],
      customers: existingCustomer
        ? current.customers.map((customer) =>
            customer.id === existingCustomer.id
              ? {
                  ...customer,
                  name: customerName,
                  email: customerEmail,
                  phone: order.contact.phone.trim(),
                }
              : customer,
          )
        : [
            {
              id: customerId,
              name: customerName,
              email: customerEmail,
              phone: order.contact.phone.trim(),
            },
            ...current.customers,
          ],
      promotions: promotion
        ? current.promotions.map((item) =>
            item.id === promotion.id ? { ...item, used: item.used + 1 } : item,
          )
        : current.promotions,
    }))
    return { kind: 'saved' }
  },
  setOrderStatus(
    reference: string,
    status: AdminOrderStatus,
    operator?: OrderOperator,
  ): AdminSaveResult {
    const order = state.orders.find((item) => item.reference === reference)
    if (!order)
      return { kind: 'validation', message: 'El pedido ya no existe.' }
    const actor =
      operator === undefined
        ? {
            name: 'Administrador local (sin identificar)',
            verified: false as const,
            id: null,
          }
        : normalizeOrderOperator(operator)
    if (!actor)
      return {
        kind: 'validation',
        message: 'Indica el nombre del responsable (de 2 a 80 caracteres).',
      }
    const customer = state.customers.find(
      (item) => item.id === order.customerId,
    )
    const error = getOrderTransitionError(order, status, customer?.phone)
    if (error) return { kind: 'validation', message: error }
    if (order.status === status) return { kind: 'saved' }
    const history = createOrderHistory(
      order,
      status,
      actor,
      crypto.randomUUID(),
      'individual',
      new Date().toISOString(),
    )
    commit((current) => ({
      ...current,
      orders: current.orders.map((item) =>
        item.reference === reference ? { ...item, status } : item,
      ),
      orderHistory: [...current.orderHistory, history],
    }))
    return { kind: 'saved' }
  },
  bulkSetOrderStatus(
    references: string[],
    status: AdminOrderStatus,
    operator: OrderOperator,
    expectedStatuses?: Record<string, OrderStatus>,
  ): BulkOrderStatusResult {
    const actor = normalizeOrderOperator(operator)
    if (!actor)
      return {
        kind: 'validation',
        message: 'Indica el nombre del responsable (de 2 a 80 caracteres).',
      }
    if (!ORDER_STATUSES.includes(status))
      return { kind: 'validation', message: 'Selecciona un estado válido.' }
    const selectedReferences = normalizeOrderReferences(references)
    if (!selectedReferences.length)
      return { kind: 'validation', message: 'Selecciona al menos un pedido.' }
    const operationId = crypto.randomUUID()
    const result: Extract<BulkOrderStatusResult, { kind: 'updated' }> = {
      kind: 'updated',
      operationId,
      updated: [],
      skipped: [],
      errors: [],
    }
    const orders = new Map(
      state.orders.map((order) => [order.reference, order]),
    )
    const customerPhones = new Map(
      state.customers.map((customer) => [customer.id, customer.phone]),
    )
    const history: OrderHistoryEntry[] = []
    const changedAt = new Date().toISOString()
    for (const reference of selectedReferences) {
      const order = orders.get(reference)
      if (!order) {
        result.errors.push({ reference, message: 'El pedido ya no existe.' })
        continue
      }
      if (
        expectedStatuses &&
        (!Object.hasOwn(expectedStatuses, reference) ||
          expectedStatuses[reference] !== order.status)
      ) {
        result.errors.push({
          reference,
          message:
            'El estado cambió desde la selección. Revisa el pedido y vuelve a intentarlo.',
        })
        continue
      }
      if (order.status === status) {
        result.skipped.push({
          reference,
          message: 'El pedido ya está en ese estado.',
        })
        continue
      }
      const error = getOrderTransitionError(
        order,
        status,
        customerPhones.get(order.customerId),
      )
      if (error) {
        result.errors.push({ reference, message: error })
        continue
      }
      result.updated.push(reference)
      history.push(
        createOrderHistory(
          order,
          status,
          actor,
          operationId,
          'bulk',
          changedAt,
        ),
      )
    }
    if (result.updated.length) {
      const updated = new Set(result.updated)
      commit((current) => ({
        ...current,
        orders: current.orders.map((order) =>
          updated.has(order.reference) ? { ...order, status } : order,
        ),
        orderHistory: [...current.orderHistory, ...history],
      }))
    }
    return result
  },
  createOrderBatch(
    name: string,
    references: string[],
    operator: OrderOperator,
  ): CreateOrderBatchResult {
    const actor = normalizeOrderOperator(operator)
    if (!actor)
      return {
        kind: 'validation',
        message: 'Indica el nombre del responsable (de 2 a 80 caracteres).',
      }
    const batchName = name.trim()
    if (batchName.length < 2 || batchName.length > 80)
      return {
        kind: 'validation',
        message: 'El nombre del lote debe tener de 2 a 80 caracteres.',
      }
    const orderReferences = normalizeOrderReferences(references)
    const error = validateBatchReferences(orderReferences, false)
    if (error) return { kind: 'validation', message: error }
    const id = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const batch: OrderBatch = {
      id,
      code: `LOT-${createdAt.slice(0, 10).replaceAll('-', '')}-${id.slice(0, 8).toUpperCase()}`,
      name: batchName,
      orderReferences,
      createdAt,
      operator: actor,
      archived: false,
    }
    commit((current) => ({
      ...current,
      orderBatches: [...current.orderBatches, batch],
    }))
    return { kind: 'saved', batch }
  },
  updateOrderBatch(id: string, update: OrderBatchUpdate): AdminSaveResult {
    const batch = state.orderBatches.find((item) => item.id === id)
    if (!batch) return { kind: 'validation', message: 'El lote ya no existe.' }
    const name = update.name === undefined ? batch.name : update.name.trim()
    if (name.length < 2 || name.length > 80)
      return {
        kind: 'validation',
        message: 'El nombre del lote debe tener de 2 a 80 caracteres.',
      }
    if (update.archived !== undefined && typeof update.archived !== 'boolean')
      return { kind: 'validation', message: 'El estado del lote no es válido.' }
    const orderReferences =
      update.orderReferences === undefined
        ? batch.orderReferences
        : normalizeOrderReferences(update.orderReferences)
    const archived = update.archived ?? batch.archived
    const error = validateBatchReferences(orderReferences, archived, id)
    if (error) return { kind: 'validation', message: error }
    if (
      name === batch.name &&
      archived === batch.archived &&
      orderReferences.length === batch.orderReferences.length &&
      orderReferences.every(
        (reference, index) => reference === batch.orderReferences[index],
      )
    )
      return { kind: 'saved' }
    commit((current) => ({
      ...current,
      orderBatches: current.orderBatches.map((item) =>
        item.id === id ? { ...item, name, orderReferences, archived } : item,
      ),
    }))
    return { kind: 'saved' }
  },
  deleteOrderBatch(id: string): AdminSaveResult {
    if (!state.orderBatches.some((batch) => batch.id === id))
      return { kind: 'validation', message: 'El lote ya no existe.' }
    commit((current) => ({
      ...current,
      orderBatches: current.orderBatches.filter((batch) => batch.id !== id),
    }))
    return { kind: 'saved' }
  },
  saveOrderDelivery(
    reference: string,
    details: {
      customerName: string
      customerEmail: string
      phone: string
      street: string
      department?: string
      province?: string
      district?: string
    },
  ): AdminSaveResult {
    const order = state.orders.find((item) => item.reference === reference)
    if (!order)
      return { kind: 'validation', message: 'El pedido ya no existe.' }
    const name = details.customerName.trim()
    const email = normalizeEmail(details.customerEmail)
    const phone = details.phone.trim()
    const street = details.street.trim()
    const department = details.department?.trim() ?? order.address.department
    const province = details.province?.trim() ?? order.address.province
    const district = details.district?.trim() ?? order.address.district
    const unchangedLegacyLocation =
      department === order.address.department &&
      province === order.address.province &&
      district === order.address.district &&
      Boolean(department && province && district)
    if (
      name.length < 2 ||
      /^Cliente \d+$/i.test(name) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !/^[+\d\s()-]{9,20}$/.test(phone) ||
      street.length < 5 ||
      street === 'Dirección registrada'
    )
      return {
        kind: 'validation',
        message: 'Revisa el nombre, correo, teléfono y dirección exacta.',
      }
    if (
      !isShippingDestinationEnabled(
        state.shipping,
        department,
        province,
        district,
      ) &&
      !unchangedLegacyLocation
    )
      return {
        kind: 'validation',
        message: state.shipping.provinceShippingEnabled
          ? 'Selecciona un departamento, provincia y distrito válidos.'
          : 'Selecciona una zona y un distrito de Lima o Callao válidos.',
      }
    commit((current) => ({
      ...current,
      orders: current.orders.map((item) =>
        item.reference === reference
          ? {
              ...item,
              customerName: name,
              customerEmail: email,
              contactPhone: phone,
              address: {
                ...item.address,
                department,
                province,
                district,
                street,
              },
            }
          : item,
      ),
      customers: current.customers.some((item) => item.id === order.customerId)
        ? current.customers.map((item) =>
            item.id === order.customerId
              ? { ...item, name, email, phone }
              : item,
          )
        : [{ id: order.customerId, name, email, phone }, ...current.customers],
    }))
    return { kind: 'saved' }
  },
  savePromotion(promotion: AdminPromotion): AdminSaveResult {
    const code = promotion.code.trim().toUpperCase()
    if (!code || !Number.isFinite(promotion.value) || promotion.value <= 0)
      return {
        kind: 'validation',
        message: 'El código y un valor mayor que cero son obligatorios.',
      }
    if (promotion.type === 'percent' && promotion.value > 100)
      return {
        kind: 'validation',
        message: 'Un descuento porcentual no puede superar 100 %.',
      }
    if (
      !isNonNegativeInteger(promotion.minimumCents) ||
      !isNonNegativeInteger(promotion.used) ||
      (promotion.usageLimit !== null &&
        (!Number.isInteger(promotion.usageLimit) || promotion.usageLimit <= 0))
    )
      return {
        kind: 'validation',
        message: 'Revisa la compra mínima y el límite de usos.',
      }
    const startsAt = promotion.startsAt
      ? new Date(promotion.startsAt).getTime()
      : null
    const endsAt = promotion.endsAt
      ? new Date(promotion.endsAt).getTime()
      : null
    if (
      (startsAt !== null && !Number.isFinite(startsAt)) ||
      (endsAt !== null && !Number.isFinite(endsAt))
    )
      return {
        kind: 'validation',
        message: 'Revisa las fechas de vigencia.',
      }
    if (startsAt !== null && endsAt !== null && startsAt >= endsAt)
      return {
        kind: 'validation',
        message: 'La fecha final debe ser posterior a la inicial.',
      }
    if (
      state.promotions.some(
        (item) => item.id !== promotion.id && item.code === code,
      )
    )
      return { kind: 'validation', message: 'Ese código ya existe.' }
    const saved = { ...promotion, code }
    commit((current) => {
      const exists = current.promotions.some((item) => item.id === promotion.id)
      return {
        ...current,
        promotions: exists
          ? current.promotions.map((item) =>
              item.id === promotion.id ? saved : item,
            )
          : [...current.promotions, saved],
      }
    })
    return { kind: 'saved' }
  },
  setPromotionActive(id: string, active: boolean) {
    commit((current) => ({
      ...current,
      promotions: current.promotions.map((promotion) =>
        promotion.id === id ? { ...promotion, active } : promotion,
      ),
    }))
  },
  saveShipping(shipping: AdminShippingSettings): AdminSaveResult {
    const coverageKeys = shipping.zones.map(
      (zone) =>
        `${normalizeKey(zone.department)}:${zone.province ?? '*'}:${zone.district ?? '*'}`,
    )
    const zoneIds = shipping.zones.map((zone) => zone.id.trim())
    if (
      !isNonNegativeInteger(shipping.freeThresholdCents) ||
      typeof shipping.provinceShippingEnabled !== 'boolean' ||
      !isNonNegativeInteger(shipping.nationalCourierFeeCents) ||
      !shipping.nationalEstimate?.trim() ||
      new Set(zoneIds).size !== zoneIds.length ||
      new Set(coverageKeys).size !== coverageKeys.length ||
      shipping.zones.some(
        (zone) =>
          !zone.id.trim() ||
          !zone.name.trim() ||
          !zone.department.trim() ||
          !peruDepartments.some(
            (department) => department.value === normalizeKey(zone.department),
          ) ||
          (zone.province !== null &&
            !getPeruProvinceOptions(zone.department).some(
              (province) => province.value === zone.province,
            )) ||
          (zone.district !== null &&
            (!zone.province ||
              !isValidPeruLocation(
                zone.department,
                zone.province,
                zone.district,
              ))) ||
          !isNonNegativeInteger(zone.courierFeeCents) ||
          (zone.motorizadoFeeCents !== null &&
            !isNonNegativeInteger(zone.motorizadoFeeCents)) ||
          !zone.estimate.trim(),
      )
    )
      return {
        kind: 'validation',
        message:
          'Revisa la cobertura, los importes y los plazos. No repitas la misma combinación de departamento, provincia y distrito.',
      }
    commit((current) => ({
      ...current,
      shipping: {
        freeThresholdCents: shipping.freeThresholdCents,
        provinceShippingEnabled: shipping.provinceShippingEnabled,
        nationalCourierFeeCents: shipping.nationalCourierFeeCents,
        nationalEstimate: shipping.nationalEstimate.trim(),
        zones: shipping.zones.map((zone) => ({
          ...zone,
          id: zone.id.trim(),
          name: zone.name.trim(),
          department: normalizeKey(zone.department),
          estimate: zone.estimate.trim(),
        })),
      },
    }))
    return { kind: 'saved' }
  },
}

export function getStoreBrands() {
  return state.brands.filter((brand) => brand.active)
}

export function getStoreProductRecords() {
  const activeBrands = new Set(getStoreBrands().map((brand) => brand.id))
  return state.products.filter(
    (record) =>
      record.active &&
      hasProductStock(record.product) &&
      (isPerfume(record.product) || state.features.complementsEnabled) &&
      hasProductMainImage(record) &&
      (activeBrands.has(record.product.brandId) ||
        (!isPerfume(record.product) && !record.product.brandId)),
  )
}

export function getStoreProducts() {
  return getStoreProductRecords().map((record) => record.product)
}

export function getStoreFeatures() {
  return state.features
}

export function getStoreProductBySlug(slug: string) {
  return getStoreProductRecords().find((record) => record.product.slug === slug)
}

export function getPromotionByCode(code: string) {
  return state.promotions.find(
    (promotion) => promotion.code === code.trim().toUpperCase(),
  )
}

export function getShippingSettings() {
  return state.shipping
}

export function getShippingZoneForAddress(
  department: string,
  province = '',
  district = '',
) {
  return resolveShippingZone(state.shipping, department, province, district)
}
