import {
  brands as fixtureBrands,
  products as fixtureProducts,
} from '../mocks/home'
import { getProductDetail } from '../mocks/product-details'
import {
  getPeruDepartmentLabel,
  getPeruDistrictLabel,
  getPeruProvinceOptions,
  getPeruProvinceLabel,
  isValidPeruLocation,
} from '../content/peru'
import type {
  Brand,
  Product,
  ProductDetail,
  ProductVariant,
} from '../types/catalog'

export type AdminGender = 'hombre' | 'mujer' | 'unisex'
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
  revision: number
}

export type AdminSaveResult =
  { kind: 'saved' } | { kind: 'validation'; message: string }

const metadata: Record<
  string,
  Pick<AdminProduct, 'gender' | 'featured' | 'popularity' | 'newest'>
> = {
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
  description = 'Descripción temporal pendiente de contenido comercial aprobado.',
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
        alt: `Vista conceptual de ${product.name}; imagen temporal`,
        framing: 'full',
      },
      {
        image: `${product.image}-alternate`,
        alt: `Vista alternativa conceptual de ${product.name}; imagen temporal`,
        framing: 'full',
      },
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
        reference: 'AI-DEMO-NUEVO-210926',
        customerId: 'customer-demo-2',
        customerName: 'Camila Torres',
        customerEmail: 'camila@ejemplo.invalid',
        placedAt: '2026-09-21T15:15:00.000Z',
        status: 'received',
        paymentStatus: 'approved',
        lines: [
          {
            variantId: 'cedre-50',
            brand: 'ATELIER 01',
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
          street: 'Calle de demostración 210',
        },
      },
      {
        reference: 'AI-DEMO-PREPARANDO-200926',
        customerId: 'customer-demo-4',
        customerName: 'Luisa Mendoza',
        customerEmail: 'luisa@ejemplo.invalid',
        placedAt: '2026-09-20T21:15:00.000Z',
        status: 'preparing',
        paymentStatus: 'approved',
        lines: [
          {
            variantId: 'petale-100',
            brand: 'FORME',
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
          street: 'Avenida de demostración 560',
        },
      },
      {
        reference: 'AI-DEMO-A1B2C3D4E5F60708',
        customerId: 'customer-demo-1',
        customerName: 'Cliente Ejemplo',
        customerEmail: 'cliente@ejemplo.invalid',
        placedAt: '2026-09-09T15:30:00.000Z',
        status: 'shipped',
        paymentStatus: 'approved',
        lines: [
          {
            variantId: 'petale-50',
            brand: 'FORME',
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
          street: 'Avenida de ejemplo 123',
        },
      },
      {
        reference: 'AI-DEMO-ENTREGADO-150926',
        customerId: 'customer-demo-2',
        customerName: 'Camila Torres',
        customerEmail: 'camila@ejemplo.invalid',
        placedAt: '2026-09-15T17:00:00.000Z',
        status: 'delivered',
        paymentStatus: 'approved',
        lines: [
          {
            variantId: 'sillage-75',
            brand: 'STUDIO SILLAGE',
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
          street: 'Calle de demostración 45',
        },
      },
    ],
    customers: [
      {
        id: 'customer-demo-1',
        name: 'Cliente Ejemplo',
        email: 'cliente@ejemplo.invalid',
        phone: '912345678',
      },
      {
        id: 'customer-demo-2',
        name: 'Camila Torres',
        email: 'camila@ejemplo.invalid',
        phone: '923456781',
      },
      {
        id: 'customer-demo-4',
        name: 'Luisa Mendoza',
        email: 'luisa@ejemplo.invalid',
        phone: '945678123',
      },
    ],
    promotions: [
      {
        id: 'promo-demo10',
        code: 'DEMO10',
        active: true,
        type: 'percent',
        value: 10,
        minimumCents: 0,
        startsAt: '',
        endsAt: '',
        usageLimit: null,
        used: 0,
      },
      {
        id: 'promo-minimo500',
        code: 'MINIMO500',
        active: true,
        type: 'percent',
        value: 10,
        minimumCents: 50000,
        startsAt: '',
        endsAt: '',
        usageLimit: null,
        used: 0,
      },
      {
        id: 'promo-inactivo',
        code: 'INACTIVO',
        active: false,
        type: 'percent',
        value: 10,
        minimumCents: 0,
        startsAt: '',
        endsAt: '',
        usageLimit: null,
        used: 0,
      },
      {
        id: 'promo-proximo',
        code: 'PROXIMO',
        active: true,
        type: 'percent',
        value: 10,
        minimumCents: 0,
        startsAt: '2099-01-01T00:00',
        endsAt: '',
        usageLimit: null,
        used: 0,
      },
      {
        id: 'promo-vencido',
        code: 'VENCIDO',
        active: true,
        type: 'percent',
        value: 10,
        minimumCents: 0,
        startsAt: '',
        endsAt: '2020-01-01T00:00',
        usageLimit: null,
        used: 0,
      },
      {
        id: 'promo-limite',
        code: 'LIMITE',
        active: true,
        type: 'percent',
        value: 10,
        minimumCents: 0,
        startsAt: '',
        endsAt: '',
        usageLimit: 1,
        used: 1,
      },
    ],
    shipping: {
      freeThresholdCents: 45000,
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
          name: 'Arequipa · ejemplo',
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
    revision: 0,
  }
}

let state = createInitialState()
const listeners = new Set<() => void>()

function commit(update: (current: AdminState) => AdminState) {
  state = { ...update(state), revision: state.revision + 1 }
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
  zones: AdminShippingZone[],
  department: string,
  province = '',
  district = '',
) {
  const normalizedDepartment = normalizeKey(department)
  return zones
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
    listeners.forEach((listener) => listener())
  },
  saveProduct(record: AdminProduct): AdminSaveResult {
    const product = record.product
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
  saveBrand(brand: AdminBrand): AdminSaveResult {
    const normalized = {
      ...brand,
      name: brand.name.trim(),
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
      !/^AI-DEMO-[A-F0-9]{16}$/.test(order.reference) ||
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
      state.shipping.zones,
      order.address.department,
      order.address.province,
      order.address.district,
    )
    const expectedShippingCents = deliveryZone
      ? order.subtotalCents >= state.shipping.freeThresholdCents
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
      new Set(zoneIds).size !== zoneIds.length ||
      new Set(coverageKeys).size !== coverageKeys.length ||
      shipping.zones.some(
        (zone) =>
          !zone.id.trim() ||
          !zone.name.trim() ||
          !zone.department.trim() ||
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
  return resolveShippingZone(
    state.shipping.zones,
    department,
    province,
    district,
  )
}
