import { expect, test } from '@playwright/test'
import {
  adminService,
  applyRemoteCatalog,
  type ApprovedCheckoutOrderInput,
} from '../src/services/admin-service'
import type { StorefrontSnapshot } from '../src/services/storefront-repository'
import { getVariantPrice } from '../src/services/product-discounts'
import { quoteShipping } from '../src/services/checkout-service'

type PublicCatalog = Pick<
  StorefrontSnapshot,
  'products' | 'brands' | 'features'
>

function catalog(): PublicCatalog {
  const original = structuredClone(adminService.getSnapshot().products[0])
  const brand = {
    id: 'cfdeddb9-540d-4cb0-9809-8caf581f41c4',
    name: 'Marca del catálogo público de prueba',
    slug: 'marca-publica',
  }
  return {
    brands: [brand],
    features: { complementsEnabled: false },
    products: [
      {
        product: {
          ...original.product,
          id: '7871cdbd-98d6-4557-a5b2-71e4646d2d33',
          brandId: brand.id,
          name: 'Perfume del catálogo público de prueba',
          slug: 'perfume-publico',
          productType: 'perfume',
          discount: null,
          variants: [
            {
              id: '25cb4ad0-cd16-4f54-b43b-f89ac58680ba',
              ml: 50,
              priceCents: 12000,
              stock: 3,
              active: true,
            },
          ],
        },
        detail: original.detail,
        gender: 'unisex',
        popularity: 0,
        newest: 0,
      },
    ],
  }
}

function order(source: PublicCatalog): ApprovedCheckoutOrderInput {
  const product = source.products[0].product
  const variant = product.variants[0]
  const price = getVariantPrice(product, variant)
  const shipping = quoteShipping(
    'lima',
    'courier',
    price.finalCents,
    '1501',
    '150122',
  )
  if (shipping.kind !== 'quoted')
    throw new Error('Test shipping fixture is unavailable.')
  return {
    reference: `AI-${crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`,
    placedAt: new Date().toISOString(),
    contact: {
      firstName: 'Ana',
      lastName: 'Prueba',
      email: 'ana@example.invalid',
      phone: '912345678',
    },
    address: {
      department: 'lima',
      province: '1501',
      district: '150122',
      street: 'Dirección de prueba 123',
      reference: '',
    },
    deliveryMethod: 'courier',
    paymentProvider: 'mercado-pago',
    promotionCode: null,
    lines: [
      {
        variantId: variant.id,
        name: product.name,
        brand: source.brands[0].name,
        ml: variant.ml,
        quantity: 1,
        unitPriceCents: price.finalCents,
        ...(price.discountActive
          ? { originalUnitPriceCents: price.originalCents }
          : {}),
      },
    ],
    subtotalCents: price.finalCents,
    discountCents: 0,
    shippingCents: shipping.feeCents,
    totalCents: price.finalCents + shipping.feeCents,
  }
}

test.afterEach(() => adminService.reset())

test('Una compra simulada usa el catálogo público aunque no exista una caché administrativa', () => {
  const source = catalog()
  const checkout = order(source)
  applyRemoteCatalog({ products: [], brands: [], features: source.features })
  expect(adminService.recordApprovedCheckout(checkout, source).kind).toBe(
    'saved',
  )
  const snapshot = adminService.getSnapshot()
  expect(snapshot.products).toEqual([])
  expect(snapshot.brands).toEqual([])
  expect(
    snapshot.orders.find((entry) => entry.reference === checkout.reference)
      ?.lines,
  ).toEqual(checkout.lines)
  expect(source.products[0].product.variants[0].stock).toBe(3)
})

test('Simular la compra no consume stock de productos remotos cargados por el administrador', () => {
  const source = catalog()
  const checkout = order(source)
  applyRemoteCatalog({
    products: source.products.map((record) => ({
      ...record,
      active: true,
      lowStockThreshold: 2,
      version: 4,
    })),
    brands: source.brands.map((brand) => ({ ...brand, active: true })),
    features: source.features,
  })
  const before = adminService.getSnapshot().products
  expect(adminService.recordApprovedCheckout(checkout, source).kind).toBe(
    'saved',
  )
  expect(adminService.getSnapshot().products).toBe(before)
  expect(adminService.getSnapshot().products[0].product.variants[0].stock).toBe(
    3,
  )
  expect(adminService.getSnapshot().products[0].version).toBe(4)
})

test('Cambios de precio, stock, presentación o publicación rechazan la simulación sin registrar pedidos', () => {
  for (const change of [
    (source: PublicCatalog) => {
      source.products[0].product.variants[0].priceCents += 100
    },
    (source: PublicCatalog) => {
      source.products[0].product.variants[0].stock = 0
    },
    (source: PublicCatalog) => {
      source.products[0].product.variants[0].ml = 100
    },
    (source: PublicCatalog) => {
      source.products = []
    },
  ]) {
    const source = catalog()
    const checkout = order(source)
    const count = adminService.getSnapshot().orders.length
    change(source)
    expect(adminService.recordApprovedCheckout(checkout, source).kind).toBe(
      'validation',
    )
    expect(adminService.getSnapshot().orders).toHaveLength(count)
  }
})

test('La oferta mantiene el precio original de cada línea y rechaza un descuento manipulado', () => {
  const source = catalog()
  source.products[0].product.discount = {
    active: true,
    type: 'percent',
    value: 20,
    startsAt: '',
    endsAt: '',
  }
  const checkout = order(source)
  expect(checkout.lines[0]).toMatchObject({
    unitPriceCents: 9600,
    originalUnitPriceCents: 12000,
  })
  const changed = structuredClone(checkout)
  changed.lines[0].originalUnitPriceCents = 20000
  expect(adminService.recordApprovedCheckout(changed, source).kind).toBe(
    'validation',
  )
  expect(adminService.recordApprovedCheckout(checkout, source).kind).toBe(
    'saved',
  )
  expect(source.products[0].product.variants[0].stock).toBe(3)
})

test('La misma referencia de simulación no duplica el pedido ni el cliente', () => {
  const source = catalog()
  const checkout = order(source)
  expect(adminService.recordApprovedCheckout(checkout, source).kind).toBe(
    'saved',
  )
  const first = adminService.getSnapshot()
  expect(adminService.recordApprovedCheckout(checkout, source).kind).toBe(
    'saved',
  )
  expect(adminService.getSnapshot().orders).toBe(first.orders)
  expect(adminService.getSnapshot().customers).toBe(first.customers)
})

test('Un complemento no puede comprarse en la simulación cuando está deshabilitado públicamente', () => {
  const source = catalog()
  source.products[0].product.productType = 'complemento'
  const checkout = order(source)
  expect(adminService.recordApprovedCheckout(checkout, source).kind).toBe(
    'validation',
  )
  source.features.complementsEnabled = true
  expect(adminService.recordApprovedCheckout(checkout, source).kind).toBe(
    'saved',
  )
})
