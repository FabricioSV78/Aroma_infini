import {
  brands as fixtureBrands,
  products as fixtureProducts,
} from '../mocks/home'
import { getProductDetail } from '../mocks/product-details'
import { readAdminState, writeAdminState } from './admin-persistence'
import { formatBrandName } from '../utils/brand-name'
import {
  getPeruDepartmentLabel,
  getPeruDistrictLabel,
  getPeruProvinceOptions,
  getPeruProvinceLabel,
  isValidPeruLocation,
  peruDepartments,
} from '../content/peru'
import type {
  Brand,
  Product,
  ProductDetail,
  ProductVariant,
} from '../types/catalog'

export type AdminGender = 'hombre' | 'mujer' | 'unisex'
export type HomeMediaKey = AdminGender | 'featured'
export type HomeMedia = Record<HomeMediaKey, string | null>
export type AdminOrderStatus =
  'received' | 'preparing' | 'shipped' | 'delivered'
export type AdminOrderPaymentStatus =
  'pending' | 'approved' | 'rejected' | 'refunded'
export type AdminPromotionType = 'percent' | 'fixed'

export interface AdminBrand extends Brand {
  active: boolean
}

export interface AdminProduct {
  product: Product
  detail: ProductDetail
  active: boolean
  featured: boolean
  gender: AdminGender
  popularity: number
  newest: number
  lowStockThreshold: number
}

export interface AdminOrderLine {
  variantId: string
  brand: string
  name: string
  ml: number
  quantity: number
  unitPriceCents: number
}

export interface AdminOrder {
  reference: string
  customerId: string
  customerName: string
  customerEmail: string
  placedAt: string
  status: AdminOrderStatus
  paymentStatus: AdminOrderPaymentStatus
  lines: AdminOrderLine[]
  subtotalCents: number
  discountCents: number
  shippingCents: number
  totalCents: number
  promotionCode: string | null
  paymentProvider: 'mercado-pago'
  deliveryMethod: 'courier' | 'motorizado'
  address: {
    department: string
    province: string
    district: string
    street: string
  }
}

export interface ApprovedCheckoutOrderInput {
  reference: string
  placedAt: string
  lines: AdminOrderLine[]
  contact: {
    firstName: string
    lastName: string
    email: string
    phone: string
  }
  address: {
    department: string
    province: string
    district: string
    street: string
  }
  deliveryMethod: 'courier' | 'motorizado'
  paymentProvider: 'mercado-pago'
  subtotalCents: number
  discountCents: number
  shippingCents: number
  totalCents: number
  promotionCode: string | null
}

export interface AdminCustomer {
  id: string
  name: string
  email: string
  phone: string
}

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

export interface AdminShippingZone {
  id: string
  name: string
  department: string
  province: string | null
  district: string | null
  courierFeeCents: number
  motorizadoFeeCents: number | null
  estimate: string
  active: boolean
}

export interface AdminShippingSettings {
  freeThresholdCents: number
  nationalCourierFeeCents: number
  nationalEstimate: string
  zones: AdminShippingZone[]
}

export interface AdminState {
  products: AdminProduct[]
  brands: AdminBrand[]
  orders: AdminOrder[]
  customers: AdminCustomer[]
  promotions: AdminPromotion[]
  shipping: AdminShippingSettings
  featuredOrder: string[]
  homeMedia: HomeMedia
  revision: number
}

export type AdminSaveResult =
  { kind: 'saved' } | { kind: 'validation'; message: string }

const metadata: Record<
  string,
  Pick<AdminProduct, 'gender' | 'featured' | 'popularity' | 'newest'>
> = {
  neroli: { gender: 'unisex', featured: false, popularity: 5, newest: 8 },
  iris: { gender: 'unisex', featured: false, popularity: 6, newest: 7 },
  figue: { gender: 'unisex', featured: false, popularity: 7, newest: 6 },
  santal: { gender: 'unisex', featured: false, popularity: 8, newest: 5 },
  cedre: {
    gender: 'hombre',
    featured: true,
    popularity: 1,
    newest: 3,
  },
  petale: {
    gender: 'mujer',
    featured: false,
    popularity: 2,
    newest: 4,
  },
  sillage: {
    gender: 'unisex',
    featured: true,
    popularity: 3,
    newest: 2,
  },
  ambre: {
    gender: 'unisex',
    featured: false,
    popularity: 4,
    newest: 1,
  },
}

function cloneVariant(variant: ProductVariant): ProductVariant {
  return { ...variant }
}

function cloneProduct(product: Product): Product {
  return { ...product, variants: product.variants.map(cloneVariant) }
}

function cloneDetail(detail: ProductDetail): ProductDetail {
  return {
    ...detail,
    notes: {
      top: [...detail.notes.top],
      heart: [...detail.notes.heart],
      base: [...detail.notes.base],
    },
    gallery: detail.gallery.map((image) => ({ ...image })),
    recommendationIds: [...detail.recommendationIds],
  }
}

export function createAdminProductDetail(
  product: Product,
  description = 'Descubre el carácter de esta fragancia y sus notas principales.',
): ProductDetail {
  return {
    type: 'Eau de Parfum',
    shortDescription: description,
    description,
    notes: { top: [], heart: [], base: [] },
    intensity: 'Moderada',
    intensityLevel: 2,
    occasion: 'Por definir',
    season: 'Todo el año',
    gallery: [
      {
        image: product.image,
        alt: `Frasco de ${product.name}`,
        framing: 'full',
      },
      ...(product.image
        ? [
            {
              image: `${product.image}-alternate`,
              alt: `Vista alternativa de ${product.name}`,
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
      active: true,
      featured: productMetadata.featured,
      gender: productMetadata.gender,
      popularity: productMetadata.popularity,
      newest: productMetadata.newest,
      lowStockThreshold: 2,
    }
  })
  return {
    products: productRecords,
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
          department: 'callao',
          province: '0701',
          district: null,
          courierFeeCents: 2000,
          motorizadoFeeCents: 1500,
          estimate: 'Hasta 48 horas',
          active: true,
        },
        {
          id: 'zone-arequipa',
          name: 'Arequipa',
          department: 'arequipa',
          province: null,
          district: null,
          courierFeeCents: 3500,
          motorizadoFeeCents: null,
          estimate: 'Hasta 5 días',
          active: true,
        },
      ],
    },
    featuredOrder: ['sillage', 'cedre'],
    homeMedia: { hombre: null, mujer: null, unisex: null, featured: null },
    revision: 0,
  }
}

let state = createInitialState()
const listeners = new Set<() => void>()
let persistenceQueue: Promise<void> = Promise.resolve()
let hydrationPromise: Promise<void> | undefined

export function hydrateAdminStore() {
  hydrationPromise ??= (async () => {
    try {
      const saved = await readAdminState()
      if (
        !saved ||
        !Array.isArray(saved.products) ||
        !Array.isArray(saved.featuredOrder)
      )
        return
      const initial = createInitialState()
      state = {
        ...initial,
        ...saved,
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
          return { ...record, product, detail: { ...record.detail, gallery } }
        }),
        brands: (saved.brands ?? initial.brands).map((brand) => ({
          ...brand,
          name: formatBrandName(brand.name),
        })),
        shipping: {
          ...initial.shipping,
          ...saved.shipping,
          zones: Array.isArray(saved.shipping?.zones)
            ? saved.shipping.zones
            : initial.shipping.zones,
        },
        homeMedia: {
          hombre: saved.homeMedia?.hombre ?? null,
          mujer: saved.homeMedia?.mujer ?? null,
          unisex: saved.homeMedia?.unisex ?? null,
          featured: saved.homeMedia?.featured ?? null,
        },
      }
      listeners.forEach((listener) => listener())
    } catch {
      // The storefront remains available when browser storage is unavailable.
    }
  })()
  return hydrationPromise
}

function persist(snapshot: AdminState) {
  persistenceQueue = persistenceQueue
    .catch(() => undefined)
    .then(() => writeAdminState(snapshot))
}

function commit(update: (current: AdminState) => AdminState) {
  state = { ...update(state), revision: state.revision + 1 }
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
  const override = shipping.zones
    .filter(
      (zone) =>
        zone.active &&
        normalizeKey(zone.department) === normalizedDepartment &&
        (!zone.province || zone.province === province) &&
        (!zone.district || zone.district === district),
    )
    .sort(
      (left, right) =>
        Number(Boolean(right.district)) - Number(Boolean(left.district)) ||
        Number(Boolean(right.province)) - Number(Boolean(left.province)),
    )[0]
  if (override) return override
  if (!peruDepartments.some((item) => item.value === normalizedDepartment))
    return undefined
  return {
    id: 'national',
    name: 'Todo el Perú',
    department: normalizedDepartment,
    province: null,
    district: null,
    courierFeeCents: shipping.nationalCourierFeeCents,
    motorizadoFeeCents: null,
    estimate: shipping.nationalEstimate,
    active: true,
  } satisfies AdminShippingZone
}

function promotionDiscount(promotion: AdminPromotion, subtotalCents: number) {
  return promotion.type === 'percent'
    ? Math.round((subtotalCents * promotion.value) / 100)
    : Math.min(subtotalCents, Math.round(promotion.value * 100))
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
  saveProduct(record: AdminProduct): AdminSaveResult {
    const product = record.product
    if (!product.image || !record.detail.gallery[0]?.image)
      return {
        kind: 'validation',
        message: 'Selecciona o sube una fotografía principal.',
      }
    if (record.detail.gallery.some((view) => !view.alt.trim()))
      return {
        kind: 'validation',
        message: 'Describe cada fotografía de la galería.',
      }
    if (!product.name.trim() || !validSlug(product.slug))
      return {
        kind: 'validation',
        message: 'Completa el nombre y usa un slug válido.',
      }
    if (!record.detail.description.trim())
      return {
        kind: 'validation',
        message: 'La descripción es obligatoria.',
      }
    const duplicateSlug = state.products.some(
      (item) =>
        item.product.id !== product.id && item.product.slug === product.slug,
    )
    if (duplicateSlug)
      return { kind: 'validation', message: 'Ese slug ya está en uso.' }
    const brand = state.brands.find((item) => item.id === product.brandId)
    if (!brand || (record.active && !brand.active))
      return {
        kind: 'validation',
        message: 'Selecciona una marca disponible antes de publicar.',
      }
    const presentations = product.variants.map((variant) => variant.ml)
    const variantIds = product.variants.map((variant) => variant.id)
    const activeVariants = product.variants.filter(
      (variant) => variant.active !== false,
    )
    if (
      !product.variants.length ||
      new Set(presentations).size !== presentations.length ||
      new Set(variantIds).size !== variantIds.length ||
      !Number.isInteger(record.lowStockThreshold) ||
      record.lowStockThreshold < 0 ||
      product.variants.some(
        (variant) =>
          !Number.isInteger(variant.ml) ||
          !Number.isInteger(variant.priceCents) ||
          !Number.isInteger(variant.stock) ||
          variant.ml <= 0 ||
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
      featured: record.active && record.featured,
      product: cloneProduct({
        ...product,
        name: product.name.trim(),
        slug: product.slug.trim(),
        family: product.family.trim(),
      }),
      detail: cloneDetail(record.detail),
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
        featuredOrder: saved.featured
          ? current.featuredOrder.includes(product.id)
            ? current.featuredOrder
            : [...current.featuredOrder, product.id]
          : current.featuredOrder.filter((id) => id !== product.id),
      }
    })
    return { kind: 'saved' }
  },
  setProductActive(id: string, active: boolean): AdminSaveResult {
    const record = state.products.find((item) => item.product.id === id)
    if (!record)
      return { kind: 'validation', message: 'El producto ya no existe.' }
    const brand = state.brands.find(
      (item) => item.id === record.product.brandId,
    )
    const activeVariants = record.product.variants.filter(
      (variant) => variant.active !== false,
    )
    if (
      active &&
      (!brand?.active ||
        !activeVariants.length ||
        activeVariants.some((variant) => variant.priceCents <= 0))
    )
      return {
        kind: 'validation',
        message:
          'Revisa la marca y los precios de las presentaciones antes de activar.',
      }
    commit((current) => ({
      ...current,
      products: current.products.map((item) =>
        item.product.id === id
          ? { ...item, active, featured: active ? item.featured : false }
          : item,
      ),
      featuredOrder: active
        ? current.featuredOrder
        : current.featuredOrder.filter((item) => item !== id),
    }))
    return { kind: 'saved' }
  },
  setFeaturedOrder(ids: string[]) {
    const unique = [...new Set(ids)].filter((id) =>
      state.products.some((item) => item.product.id === id && item.active),
    )
    commit((current) => ({
      ...current,
      featuredOrder: unique,
      products: current.products.map((item) => ({
        ...item,
        featured: unique.includes(item.product.id),
      })),
    }))
  },
  saveHome(featuredOrder: string[], homeMedia: HomeMedia): AdminSaveResult {
    const unique = [...new Set(featuredOrder)]
    if (
      unique.length !== 2 ||
      !unique.every((id) =>
        state.products.some(
          (item) =>
            item.product.id === id &&
            item.active &&
            state.brands.some(
              (brand) => brand.id === item.product.brandId && brand.active,
            ),
        ),
      )
    ) {
      return {
        kind: 'validation',
        message: 'Selecciona dos productos activos diferentes para destacados.',
      }
    }
    commit((current) => ({
      ...current,
      featuredOrder: unique,
      homeMedia: { ...homeMedia },
      products: current.products.map((item) => ({
        ...item,
        featured: unique.includes(item.product.id),
      })),
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
      !order.contact.phone.trim() ||
      !order.address.department.trim() ||
      !order.address.province.trim() ||
      !order.address.district.trim() ||
      !isValidPeruLocation(
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
      return { line, record, variant, brand }
    })
    if (
      new Set(order.lines.map((line) => line.variantId)).size !==
        order.lines.length ||
      resolvedLines.some(
        ({ line, record, variant, brand }) =>
          !record ||
          !record.active ||
          !activeBrandIds.has(record.product.brandId) ||
          !variant ||
          variant.active === false ||
          !isPositiveInteger(line.quantity) ||
          variant.stock < line.quantity ||
          variant.priceCents !== line.unitPriceCents ||
          variant.ml !== line.ml ||
          record.product.name !== line.name ||
          brand?.name !== line.brand,
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
    const now = Date.now()
    const invalidPromotion = promotion
      ? !promotion.active ||
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
        department:
          deliveryZone?.name ??
          getPeruDepartmentLabel(order.address.department),
        province: getPeruProvinceLabel(order.address.province),
        district: getPeruDistrictLabel(order.address.district),
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
  setOrderStatus(reference: string, status: AdminOrderStatus): AdminSaveResult {
    const order = state.orders.find((item) => item.reference === reference)
    if (!order)
      return { kind: 'validation', message: 'El pedido ya no existe.' }
    if (order.paymentStatus !== 'approved')
      return {
        kind: 'validation',
        message: 'El pago debe estar aprobado antes de preparar el pedido.',
      }
    if (status === 'shipped') {
      const customer = state.customers.find(
        (item) => item.id === order.customerId,
      )
      if (
        !order.customerEmail ||
        order.customerEmail === '—' ||
        !customer?.phone ||
        customer.phone === '—' ||
        !order.address.street ||
        order.address.street === 'Dirección registrada'
      )
        return {
          kind: 'validation',
          message:
            'Completa el contacto y la dirección antes de marcar el pedido como enviado.',
        }
    }
    const statuses: AdminOrderStatus[] = [
      'received',
      'preparing',
      'shipped',
      'delivered',
    ]
    const currentIndex = statuses.indexOf(order.status)
    const nextIndex = statuses.indexOf(status)
    if (Math.abs(currentIndex - nextIndex) > 1)
      return {
        kind: 'validation',
        message: 'Actualiza el pedido un paso a la vez.',
      }
    commit((current) => ({
      ...current,
      orders: current.orders.map((order) =>
        order.reference === reference ? { ...order, status } : order,
      ),
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
    },
  ): AdminSaveResult {
    const order = state.orders.find((item) => item.reference === reference)
    if (!order)
      return { kind: 'validation', message: 'El pedido ya no existe.' }
    const name = details.customerName.trim()
    const email = normalizeEmail(details.customerEmail)
    const phone = details.phone.trim()
    const street = details.street.trim()
    if (
      name.length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !/^[+\d\s()-]{9,20}$/.test(phone) ||
      street.length < 5
    )
      return {
        kind: 'validation',
        message: 'Revisa el nombre, correo, teléfono y dirección de entrega.',
      }
    commit((current) => ({
      ...current,
      orders: current.orders.map((item) =>
        item.reference === reference
          ? {
              ...item,
              customerName: name,
              customerEmail: email,
              address: { ...item.address, street },
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
    (record) => record.active && activeBrands.has(record.product.brandId),
  )
}

export function getStoreProducts() {
  return getStoreProductRecords().map((record) => record.product)
}

export function getAdminProduct(id: string) {
  return state.products.find((record) => record.product.id === id)
}

export function getAdminOrder(reference: string) {
  return state.orders.find((order) => order.reference === reference)
}

export function getStoreProductBySlug(slug: string) {
  return getStoreProductRecords().find((record) => record.product.slug === slug)
}

export function getFeaturedProducts() {
  const records = getStoreProductRecords()
  return state.featuredOrder.flatMap((id) => {
    const record = records.find((item) => item.product.id === id)
    return record ? [record.product] : []
  })
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
