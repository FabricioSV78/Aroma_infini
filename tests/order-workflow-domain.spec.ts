import { expect, test } from '@playwright/test'
import {
  getOrderTransitionError,
  hasCompleteOrderDelivery,
  isOrderAttention,
  ORDER_STATUSES,
} from '../src/domain/order-workflow'
import type { AdminOrder } from '../src/services/admin-service'

function order(
  status: AdminOrder['status'] = 'received',
  paymentStatus: AdminOrder['paymentStatus'] = 'approved',
) {
  return {
    customerName: 'Ana Pérez',
    customerEmail: 'ana@example.invalid',
    contactPhone: '999888777',
    status,
    paymentStatus,
    address: {
      department: 'lima',
      province: '1501',
      district: '150122',
      street: 'Calle Los Olivos 123',
    },
  }
}

test('las transiciones conservan los cuatro estados y solo admiten pasos contiguos', () => {
  expect(ORDER_STATUSES).toEqual([
    'received',
    'preparing',
    'shipped',
    'delivered',
  ])
  for (const [fromIndex, from] of ORDER_STATUSES.entries()) {
    for (const [toIndex, to] of ORDER_STATUSES.entries()) {
      const result = getOrderTransitionError(order(from), to)
      if (Math.abs(fromIndex - toIndex) <= 1) expect(result).toBeNull()
      else expect(result).toMatch(/paso a la vez/)
    }
  }
})

test('los estados de pago no se convierten en estados de preparación ni autorizan avances', () => {
  for (const payment of ['pending', 'rejected', 'refunded'] as const) {
    for (const current of ORDER_STATUSES) {
      for (const next of ORDER_STATUSES) {
        const result = getOrderTransitionError(order(current, payment), next)
        if (current === next) expect(result).toBeNull()
        else expect(result).toMatch(/pago debe estar aprobado/)
      }
    }
  }
})

test('enviar exige cada dato real de contacto y destino, con teléfono heredado compatible', () => {
  const complete = order('preparing')
  expect(hasCompleteOrderDelivery(complete)).toBe(true)
  for (const key of [
    'customerName',
    'customerEmail',
    'contactPhone',
  ] as const) {
    const incomplete = { ...complete, [key]: '' }
    expect(hasCompleteOrderDelivery(incomplete), key).toBe(false)
    expect(getOrderTransitionError(incomplete, 'shipped')).toMatch(
      /Completa el nombre, contacto/,
    )
  }
  for (const key of ['street', 'department', 'province', 'district'] as const) {
    const incomplete = {
      ...complete,
      address: { ...complete.address, [key]: '' },
    }
    expect(hasCompleteOrderDelivery(incomplete), key).toBe(false)
    expect(getOrderTransitionError(incomplete, 'shipped')).toMatch(
      /Completa el nombre, contacto/,
    )
  }
  const legacy = { ...complete, contactPhone: undefined }
  expect(hasCompleteOrderDelivery(legacy, '999888777')).toBe(true)
  expect(getOrderTransitionError(legacy, 'shipped', '999888777')).toBeNull()
  expect(
    hasCompleteOrderDelivery({ ...complete, customerName: 'Cliente 01' }),
  ).toBe(false)
  expect(
    hasCompleteOrderDelivery({
      ...complete,
      address: { ...complete.address, street: 'Dirección registrada' },
    }),
  ).toBe(false)
})

test('requieren atención solo los pedidos abiertos con pagos o datos pendientes', () => {
  expect(isOrderAttention(order())).toBe(false)
  expect(isOrderAttention(order('received', 'pending'))).toBe(true)
  expect(isOrderAttention({ ...order(), contactPhone: '' })).toBe(true)
  expect(
    isOrderAttention({ ...order('delivered', 'refunded'), contactPhone: '' }),
  ).toBe(false)
})
