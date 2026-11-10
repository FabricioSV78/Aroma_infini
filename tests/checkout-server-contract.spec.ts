import { expect, test } from '@playwright/test'
import {
  parseCheckoutQuote,
  parseSimulatedOrderResponse,
  type CheckoutOperation,
} from '../src/services/checkout-server'
import { UserFacingError } from '../src/services/admin-messages'

const variantId = '50000000-0000-4000-8000-000000000001'
function line() {
  return {
    variantId,
    productSlug: 'perfume-prueba',
    image: '/images/petale-960.webp',
    name: 'Perfume de prueba',
    brand: 'Casa de prueba',
    ml: 50,
    quantity: 2,
    unitPriceCents: 10000,
    originalUnitPriceCents: 12000,
  }
}
function quote() {
  return {
    lines: [line()],
    subtotalCents: 20000,
    productDiscountCents: 4000,
    discountCents: 0,
    shipping: {
      kind: 'quoted',
      region: 'capital',
      feeCents: 1000,
      estimate: 'Plazo de prueba',
      free: false,
    },
    promotion: null,
    totalCents: 21000,
    quoteHash: 'a'.repeat(64),
    simulation: true,
  }
}
function operation(): CheckoutOperation {
  return {
    operationId: '60000000-0000-4000-8000-000000000001',
    trackingToken: 'b'.repeat(64),
    checkout: { lines: [{ variantId, quantity: 2 }] },
  }
}
function confirmation() {
  return {
    order: {
      reference: 'AI-0123456789ABCDEF',
      placedAt: '2026-10-30T12:00:00.000Z',
      mode: 'guest',
      simulation: true,
      paymentStatus: 'pending',
      paymentProvider: 'mercado-pago',
      lines: [line()],
      contact: {
        firstName: 'Ana',
        lastName: 'Torres',
        email: 'ana@example.invalid',
        phone: '912345678',
      },
      address: {
        department: 'lima',
        province: '1501',
        district: '150101',
        street: 'Avenida de prueba 123',
        reference: '',
      },
      alternateRecipient: null,
      deliveryMethod: 'courier',
      promotionCode: null,
      subtotalCents: 20000,
      productDiscountCents: 4000,
      discountCents: 0,
      shippingCents: 1000,
      totalCents: 21000,
    },
  }
}

test('A canonical quote preserves precise cents and separately identifies product savings', () => {
  const parsed = parseCheckoutQuote(quote())
  expect(parsed.subtotalCents).toBe(20000)
  expect(parsed.productDiscountCents).toBe(4000)
  expect(parsed.totalCents).toBe(21000)
  expect(parsed.simulation).toBe(true)
})

test('Empty, duplicated, malformed or over-limit presentation lines cannot be accepted', () => {
  expect(() =>
    parseCheckoutQuote({
      ...quote(),
      lines: [],
      subtotalCents: 0,
      productDiscountCents: 0,
      totalCents: 1000,
    }),
  ).toThrow(UserFacingError)
  for (const change of [
    { variantId: '-'.repeat(36) },
    { quantity: 0 },
    { quantity: 1000 },
    { quantity: 1.5 },
    { unitPriceCents: 0 },
    { ml: 0 },
    {
      unitPriceCents: Number.MAX_SAFE_INTEGER,
      quantity: 2,
      originalUnitPriceCents: Number.MAX_SAFE_INTEGER,
    },
  ])
    expect(() =>
      parseCheckoutQuote({ ...quote(), lines: [{ ...line(), ...change }] }),
    ).toThrow(UserFacingError)
  expect(() =>
    parseCheckoutQuote({ ...quote(), lines: [line(), line()] }),
  ).toThrow(UserFacingError)
})

test('Quote totals, offer savings, free delivery and coupon amounts must agree', () => {
  expect(() =>
    parseCheckoutQuote({ ...quote(), subtotalCents: 20001 }),
  ).toThrow(UserFacingError)
  expect(() =>
    parseCheckoutQuote({ ...quote(), productDiscountCents: 0 }),
  ).toThrow(UserFacingError)
  expect(() =>
    parseCheckoutQuote({ ...quote(), discountCents: 1000, totalCents: 20000 }),
  ).toThrow(UserFacingError)
  expect(() =>
    parseCheckoutQuote({
      ...quote(),
      shipping: { ...quote().shipping, free: true },
    }),
  ).toThrow(UserFacingError)
  const withCoupon = {
    ...quote(),
    lines: [{ ...line(), originalUnitPriceCents: 10000 }],
    productDiscountCents: 0,
    discountCents: 1000,
    totalCents: 20000,
    promotion: {
      kind: 'applied',
      code: 'AHORRA',
      discountCents: 1000,
      message: 'Descuento de prueba.',
    },
  }
  expect(parseCheckoutQuote(withCoupon).discountCents).toBe(1000)
  expect(() =>
    parseCheckoutQuote({
      ...withCoupon,
      promotion: { ...withCoupon.promotion, discountCents: 999 },
    }),
  ).toThrow(UserFacingError)
  expect(() =>
    parseCheckoutQuote({
      ...withCoupon,
      lines: [line()],
      productDiscountCents: 4000,
    }),
  ).toThrow(UserFacingError)
})

test('An unavailable shipping quote has no final charge and a confirmed order requires its submitted selection', () => {
  expect(
    parseCheckoutQuote({
      ...quote(),
      shipping: { kind: 'unavailable' },
      totalCents: null,
    }).totalCents,
  ).toBeNull()
  expect(() =>
    parseCheckoutQuote({ ...quote(), shipping: { kind: 'unavailable' } }),
  ).toThrow(UserFacingError)
  const parsed = parseSimulatedOrderResponse(confirmation(), operation())
  expect(parsed.lines[0].variantId).toBe(variantId)
  expect(parsed.trackingToken).toBe(operation().trackingToken)
  expect(parsed.mode).toBe('guest')
  expect(parsed.simulation).toBe(true)
  const other = confirmation()
  other.order.lines[0].variantId = '50000000-0000-4000-8000-000000000002'
  expect(() => parseSimulatedOrderResponse(other, operation())).toThrow(
    UserFacingError,
  )
  expect(() =>
    parseSimulatedOrderResponse(confirmation(), {
      ...operation(),
      checkout: { lines: [{ variantId, quantity: 1 }] },
    }),
  ).toThrow(UserFacingError)
})

test('A malformed order cannot claim payment approval, another account mode or an excessive discount', () => {
  for (const change of [
    { paymentStatus: 'approved' },
    { paymentProvider: 'other-provider' },
    { mode: 'demo-account' },
    { discountCents: 20500, totalCents: 500 },
    { subtotalCents: 0, totalCents: 1000, lines: [] },
  ])
    expect(() =>
      parseSimulatedOrderResponse(
        { order: { ...confirmation().order, ...change } },
        operation(),
      ),
    ).toThrow(UserFacingError)
  expect(
    parseSimulatedOrderResponse(
      { order: { ...confirmation().order, mode: 'demo-account' } },
      operation(),
      true,
    ).mode,
  ).toBe('demo-account')
})
