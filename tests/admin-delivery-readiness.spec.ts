import { expect, test } from '@playwright/test'
import {
  adminService,
  hasCompleteOrderDelivery,
} from '../src/services/admin-service'

test.afterEach(() => adminService.reset())

test('Un pedido solo se puede enviar cuando contacto y ubicación están completos', () => {
  const reference = 'AI-200926-01'
  const original = adminService
    .getSnapshot()
    .orders.find((order) => order.reference === reference)!
  expect(hasCompleteOrderDelivery(original)).toBe(false)

  const details = {
    customerName: 'Ana Pérez',
    customerEmail: 'ana@example.invalid',
    phone: '999888777',
    street: 'Calle Los Olivos 123',
    department: 'lima',
    province: '1501',
    district: '150122',
  }
  expect(
    adminService.saveOrderDelivery(reference, { ...details, district: '' }),
  ).toMatchObject({ kind: 'validation' })
  expect(adminService.setOrderStatus(reference, 'shipped')).toMatchObject({
    kind: 'validation',
  })

  expect(adminService.saveOrderDelivery(reference, details)).toMatchObject({
    kind: 'saved',
  })
  const completed = adminService
    .getSnapshot()
    .orders.find((order) => order.reference === reference)!
  expect(completed.address).toMatchObject({
    department: 'lima',
    province: '1501',
    district: '150122',
  })
  expect(hasCompleteOrderDelivery(completed)).toBe(true)
  expect(adminService.setOrderStatus(reference, 'shipped')).toMatchObject({
    kind: 'saved',
  })
})
