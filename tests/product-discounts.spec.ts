import { expect, test } from '@playwright/test'
import type { ProductDiscount } from '../src/types/catalog'
import { adminService } from '../src/services/admin-service'
import { resolveCart } from '../src/services/commerce-service'
import {
  createCheckoutDraft,
  createMockOrder,
  evaluatePromotion,
} from '../src/services/checkout-service'
import {
  getProductDiscountStatus,
  getVariantPrice,
  validateProductDiscount,
} from '../src/services/product-discounts'

const offer: ProductDiscount = {
  active: true,
  type: 'percent',
  value: 20,
  startsAt: '',
  endsAt: '',
}

function product() {
  return adminService
    .getSnapshot()
    .products.find((record) => record.product.id === 'cedre')!.product
}

function checkoutDraft() {
  const draft = createCheckoutDraft()
  draft.contact = {
    firstName: 'Ana',
    lastName: 'Prueba',
    email: 'ana@ejemplo.invalid',
    phone: '912345678',
  }
  draft.address = {
    department: 'lima',
    province: '1501',
    district: '150122',
    street: 'Avenida de prueba 123',
    reference: '',
  }
  draft.deliveryMethod = 'motorizado'
  return draft
}

test.afterEach(() => adminService.reset())

test('La oferta usa el precio base de cada presentación y conserva céntimos enteros', () => {
  expect(adminService.saveProductDiscount('cedre', offer).kind).toBe('saved')
  const [small, large] = product().variants
  expect(getVariantPrice(product(), small)).toEqual({
    originalCents: 39000,
    finalCents: 31200,
    discountCents: 7800,
    discountActive: true,
  })
  expect(getVariantPrice(product(), large)).toEqual({
    originalCents: 59000,
    finalCents: 47200,
    discountCents: 11800,
    discountActive: true,
  })
  expect(
    getVariantPrice(
      {
        ...product(),
        variants: [{ ...small, priceCents: 101 }],
        discount: { ...offer, value: 17 },
      },
      { ...small, priceCents: 101 },
    ),
  ).toMatchObject({ finalCents: 84, discountCents: 17 })
})

test('La vigencia, pausa y validación evitan rebajas inválidas', () => {
  const first = product().variants[0]
  expect(
    validateProductDiscount(
      { ...offer, type: 'fixed', value: 39000 },
      product().variants,
    ),
  ).not.toBeNull()
  expect(
    validateProductDiscount({ ...offer, value: 100 }, product().variants),
  ).not.toBeNull()
  expect(
    validateProductDiscount({ ...offer, value: 0 }, product().variants),
  ).not.toBeNull()
  expect(
    adminService.saveProductDiscount('cedre', {
      ...offer,
      type: 'fixed',
      value: 39000,
    }).kind,
  ).toBe('validation')
  expect(getVariantPrice(product(), first).finalCents).toBe(39000)

  const scheduled: ProductDiscount = {
    ...offer,
    startsAt: '2030-01-02T00:00:00.000Z',
    endsAt: '2030-01-03T00:00:00.000Z',
  }
  const before = Date.parse('2030-01-01T00:00:00.000Z')
  const during = Date.parse('2030-01-02T12:00:00.000Z')
  const after = Date.parse('2030-01-03T00:00:00.000Z')
  expect(getProductDiscountStatus(scheduled, before, product().variants)).toBe(
    'scheduled',
  )
  expect(getProductDiscountStatus(scheduled, during, product().variants)).toBe(
    'active',
  )
  expect(getProductDiscountStatus(scheduled, after, product().variants)).toBe(
    'expired',
  )
  expect(
    getProductDiscountStatus({ ...scheduled, active: false }, during),
  ).toBe('inactive')
  expect(
    getVariantPrice({ ...product(), discount: scheduled }, first, before)
      .finalCents,
  ).toBe(39000)
  expect(
    getVariantPrice({ ...product(), discount: scheduled }, first, during)
      .finalCents,
  ).toBe(31200)
  expect(
    getVariantPrice({ ...product(), discount: scheduled }, first, after)
      .finalCents,
  ).toBe(39000)
})

test('Carrito y pedido usan precio final; el pedido conserva base y revalida cambios', () => {
  expect(adminService.saveProductDiscount('cedre', offer).kind).toBe('saved')
  const cart = resolveCart([{ variantId: 'cedre-50', quantity: 2 }])
  expect(cart).toMatchObject({
    subtotalCents: 62400,
    productDiscountCents: 15600,
  })
  const order = createMockOrder(cart, checkoutDraft())!
  expect(order.lines[0]).toMatchObject({
    unitPriceCents: 31200,
    originalUnitPriceCents: 39000,
  })
  expect(order).toMatchObject({ subtotalCents: 62400, discountCents: 0 })
  expect(adminService.recordApprovedCheckout(order).kind).toBe('saved')
  expect(adminService.getSnapshot().orders[0].lines[0]).toMatchObject({
    unitPriceCents: 31200,
    originalUnitPriceCents: 39000,
  })
  expect(product().variants[0].stock).toBe(3)

  const staleCart = resolveCart([{ variantId: 'cedre-100', quantity: 1 }])
  const staleOrder = createMockOrder(staleCart, checkoutDraft())!
  expect(adminService.saveProductDiscount('cedre', null).kind).toBe('saved')
  expect(adminService.recordApprovedCheckout(staleOrder).kind).toBe(
    'validation',
  )
  expect(product().variants[1].stock).toBe(3)
})

test('Un código no puede acumularse con una oferta de producto', () => {
  expect(adminService.saveProductDiscount('cedre', offer).kind).toBe('saved')
  expect(
    adminService.savePromotion({
      id: 'test-coupon',
      code: 'PRUEBA10',
      active: true,
      type: 'percent',
      value: 10,
      minimumCents: 0,
      startsAt: '',
      endsAt: '',
      usageLimit: null,
      used: 0,
    }).kind,
  ).toBe('saved')
  const cart = resolveCart([{ variantId: 'cedre-50', quantity: 1 }])
  expect(evaluatePromotion('PRUEBA10', cart.subtotalCents, true).kind).toBe(
    'incompatible',
  )
  const draft = checkoutDraft()
  draft.appliedPromotion = 'PRUEBA10'
  expect(createMockOrder(cart, draft)).toBeNull()
  const order = createMockOrder(cart, checkoutDraft())!
  order.promotionCode = 'PRUEBA10'
  order.discountCents = 3120
  order.totalCents -= 3120
  expect(adminService.recordApprovedCheckout(order).kind).toBe('validation')
  expect(product().variants[0].stock).toBe(5)
})
