import { expect, test } from '@playwright/test'
import {
  parseAdminOrder,
  parseAccountOrder,
  parseOrderHistory,
} from '../src/services/order-response'
import { getOrderTransitionError } from '../src/domain/order-workflow'

const owner = '00000000-0000-4000-8000-000000000001'
function order() {
  return {
    id: owner,
    version: 1,
    simulation: true,
    reference: 'AI-0123456789ABCDEF0123456789ABCDEF',
    customerId: owner,
    customerName: 'Ana Torres',
    customerEmail: 'ana@example.invalid',
    contactPhone: '912345678',
    placedAt: '2026-10-29T12:00:00Z',
    status: 'received',
    paymentStatus: 'pending',
    lines: [
      {
        variantId: owner,
        name: 'Perfume histórico',
        brand: 'Casa',
        ml: 50,
        quantity: 2,
        unitPriceCents: 10000,
        originalUnitPriceCents: 12000,
        productSlug: 'perfume-historico',
        image: '/images/cedre-480.webp',
      },
    ],
    promotionCode: null,
    paymentProvider: 'mercado-pago',
    deliveryMethod: 'courier',
    address: {
      department: 'lima',
      province: '1501',
      district: '150101',
      street: 'Avenida de prueba 123',
      reference: '',
    },
    subtotalCents: 20000,
    discountCents: 0,
    shippingCents: 1000,
    totalCents: 21000,
  }
}
test('Los pedidos de prueba conservan totales y precios históricos sin afirmar un pago aprobado', () => {
  const result = parseAdminOrder(order())
  expect(result.paymentStatus).toBe('pending')
  expect(result.simulation).toBe(true)
  expect(result.lines[0].originalUnitPriceCents).toBe(12000)
  expect(() =>
    parseAdminOrder({ ...order(), paymentStatus: 'approved' }),
  ).toThrow()
  expect(getOrderTransitionError(result, 'preparing')).toBeNull()
  expect(
    getOrderTransitionError({ ...result, simulation: false }, 'preparing'),
  ).toContain('pago debe estar aprobado')
  expect(getOrderTransitionError(result, 'delivered')).toContain('un paso')
})
test('Un DTO de pedido no puede cambiar el total ni ocultar la cantidad real de sus líneas', () => {
  expect(() => parseAdminOrder({ ...order(), totalCents: 1 })).toThrow()
  expect(() =>
    parseAdminOrder({ ...order(), subtotalCents: 10000, totalCents: 11000 }),
  ).toThrow()
  expect(() => parseAdminOrder({ ...order(), lines: [] })).toThrow()
  expect(() => parseAdminOrder({ ...order(), simulation: undefined })).toThrow()
})
test('El historial administrativo rechaza responsables no verificados', () => {
  const history = {
    id: owner,
    reference: order().reference,
    fromStatus: 'received',
    toStatus: 'preparing',
    changedAt: '2026-10-29T13:00:00Z',
    operator: { name: 'Operador', id: owner, verified: true },
    operationId: owner,
    source: 'bulk',
  }
  expect(parseOrderHistory(history).operator.id).toBe(owner)
  expect(() =>
    parseOrderHistory({
      ...history,
      operator: { ...history.operator, verified: false },
    }),
  ).toThrow()
  expect(
    parseOrderHistory({
      ...history,
      operator: { ...history.operator, id: null },
    }).operator,
  ).toEqual({ name: 'Operador', id: null, verified: true })
})
test('Mis pedidos verifica el UUID propietario y no relaciona compras por email', () => {
  const source = order()
  const account = {
    ...source,
    userId: owner,
    address: {
      ...source.address,
      id: owner,
      label: 'Entrega',
      recipient: 'Ana Torres',
    },
    payment: { provider: 'mercado-pago', status: 'pending' },
  }
  expect(parseAccountOrder(account, owner).reference).toBe(source.reference)
  expect(() =>
    parseAccountOrder(account, '00000000-0000-4000-8000-000000000002'),
  ).toThrow()
  expect(() =>
    parseAccountOrder(
      { ...account, lines: [{ ...source.lines[0], image: undefined }] },
      owner,
    ),
  ).toThrow()
})
