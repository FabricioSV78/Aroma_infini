import { expect, test } from '@playwright/test'
import {
  DEVELOPMENT_SUPABASE_ORIGIN,
  STAGING_ORIGIN,
  permitsCheckoutSimulation,
  resolveRuntimeEnvironment,
} from '../src/domain/runtime-policy'
import {
  getCommercialCustomerRecords,
  getCommercialOrders,
} from '../src/features/admin/admin-utils'
import { orderDocumentPaymentLabel } from '../src/domain/order-documents'
import type { AdminOrder } from '../src/types/admin'
import { adminService } from '../src/services/admin-service'
import { resolveCart } from '../src/services/commerce-service'
import {
  createCheckoutDraft,
  createMockOrder,
} from '../src/services/checkout-service'

test('A built application defaults to production and cannot opt into development through a public value', () => {
  expect(resolveRuntimeEnvironment(undefined, 'production', false)).toBe(
    'production',
  )
  expect(resolveRuntimeEnvironment('development', 'production', false)).toBe(
    'production',
  )
  expect(resolveRuntimeEnvironment('production', 'development', true)).toBe(
    'production',
  )
  expect(resolveRuntimeEnvironment(undefined, 'staging', false)).toBe('staging')
})
test('Simulation requires the exact staging origin, explicit environment and development database together', () => {
  expect(
    permitsCheckoutSimulation(
      'staging',
      STAGING_ORIGIN,
      STAGING_ORIGIN,
      'true',
      DEVELOPMENT_SUPABASE_ORIGIN,
    ),
  ).toBe(true)
  for (const [environment, origin, declaration, enabled, database] of [
    [
      'production',
      STAGING_ORIGIN,
      STAGING_ORIGIN,
      'true',
      DEVELOPMENT_SUPABASE_ORIGIN,
    ],
    [
      undefined,
      STAGING_ORIGIN,
      STAGING_ORIGIN,
      'true',
      DEVELOPMENT_SUPABASE_ORIGIN,
    ],
    [
      'staging',
      'https://aromainfini.pe',
      STAGING_ORIGIN,
      'true',
      DEVELOPMENT_SUPABASE_ORIGIN,
    ],
    ['staging', STAGING_ORIGIN, undefined, 'true', DEVELOPMENT_SUPABASE_ORIGIN],
    [
      'staging',
      STAGING_ORIGIN,
      STAGING_ORIGIN,
      'false',
      DEVELOPMENT_SUPABASE_ORIGIN,
    ],
    [
      'staging',
      STAGING_ORIGIN,
      STAGING_ORIGIN,
      'true',
      'https://production.supabase.co',
    ],
    [
      'development',
      'https://aromainfini.pe',
      undefined,
      'true',
      DEVELOPMENT_SUPABASE_ORIGIN,
    ],
  ])
    expect(
      permitsCheckoutSimulation(
        environment,
        origin!,
        declaration,
        enabled,
        database,
      ),
    ).toBe(false)
  expect(
    permitsCheckoutSimulation(
      'development',
      'http://127.0.0.1:8787',
      undefined,
      'true',
      DEVELOPMENT_SUPABASE_ORIGIN,
    ),
  ).toBe(true)
})
test('Commercial metrics and customers exclude simulation while documents retain an explicit warning', () => {
  const simulated = {
    simulation: true,
    customerId: 'test-customer',
    paymentStatus: 'approved',
  } as AdminOrder
  const real = {
    simulation: false,
    customerId: 'real-customer',
    paymentStatus: 'pending',
  } as AdminOrder
  expect(getCommercialOrders([simulated, real])).toEqual([real])
  expect(
    getCommercialCustomerRecords(
      [
        {
          id: 'test-customer',
          name: 'Test',
          email: 't@example.invalid',
          phone: '',
        },
        {
          id: 'real-customer',
          name: 'Real',
          email: 'r@example.invalid',
          phone: '',
        },
      ],
      [simulated, real],
    ),
  ).toHaveLength(1)
  expect(orderDocumentPaymentLabel(simulated)).toBe('Prueba · sin cobro real')
  expect(orderDocumentPaymentLabel(real)).toBe('Pago pendiente')
})
test('The isolated local checkout also records a pending test without consuming stock or coupon uses', async () => {
  const state = adminService.getSnapshot()
  const product = state.products.find(
    (record) =>
      record.active &&
      record.product.variants.some((variant) => variant.stock > 0),
  )!
  const variant = product.product.variants.find((variant) => variant.stock > 0)!
  const draft = createCheckoutDraft()
  draft.contact = {
    firstName: 'Ana',
    lastName: 'Torres',
    email: 'ana@example.invalid',
    phone: '912345678',
  }
  draft.address = {
    department: 'lima',
    province: '1501',
    district: '150101',
    street: 'Calle de fixture 123',
    reference: '',
  }
  const order = createMockOrder(
    resolveCart([{ variantId: variant.id, quantity: 1 }]),
    draft,
  )
  expect(order?.simulation).toBe(true)
  expect(adminService.recordApprovedCheckout(order!)).toEqual({ kind: 'saved' })
  await adminService.flush().catch(() => {})
  const after = adminService.getSnapshot()
  expect(after.products).toEqual(state.products)
  expect(after.promotions).toEqual(state.promotions)
  expect(after.orders[0]).toMatchObject({
    simulation: true,
    paymentStatus: 'pending',
  })
})
