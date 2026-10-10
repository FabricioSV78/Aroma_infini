import { expect, test } from '@playwright/test'
import { resolveCart } from '../src/services/commerce-service'
import {
  createCheckoutDraft,
  createMockOrder,
} from '../src/services/checkout-service'
import { adminService } from '../src/services/admin-service'

test.afterEach(() => adminService.reset())

test('El pedido conserva el contacto y la dirección históricos aunque el cliente vuelva a comprar', () => {
  const cart = resolveCart([{ variantId: 'cedre-50', quantity: 1 }])
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
    street: 'Av. Central 123',
    reference: 'Frente al parque',
  }
  draft.alternateRecipient = { name: 'Luis Prueba', dni: '123' }
  expect(createMockOrder(cart, draft)).toBeNull()

  draft.alternateRecipient = { name: ' Luis Prueba ', dni: '12345678' }
  const first = createMockOrder(cart, draft)!
  expect(adminService.recordApprovedCheckout(first).kind).toBe('saved')
  expect(adminService.getSnapshot().orders[0]).toMatchObject({
    contactPhone: '912345678',
    alternateRecipient: { name: 'Luis Prueba', dni: '12345678' },
    address: {
      province: 'Lima',
      district: 'Miraflores',
      reference: 'Frente al parque',
    },
  })

  draft.contact.phone = '923456789'
  draft.address = {
    department: 'arequipa',
    province: '0401',
    district: '040103',
    street: 'Calle Nueva 456',
    reference: '',
  }
  draft.deliveryMethod = 'courier'
  draft.alternateRecipient = null
  const second = createMockOrder(cart, draft)!
  expect(adminService.recordApprovedCheckout(second).kind).toBe('saved')
  const state = adminService.getSnapshot()
  expect(
    state.orders.find((item) => item.reference === first.reference),
  ).toMatchObject({
    contactPhone: '912345678',
    alternateRecipient: { name: 'Luis Prueba' },
    address: { province: 'Lima', district: 'Miraflores' },
  })
  expect(
    state.orders.find((item) => item.reference === second.reference),
  ).toMatchObject({
    contactPhone: '923456789',
    alternateRecipient: null,
    address: { province: 'Arequipa' },
  })
  expect(
    state.customers.find((item) => item.email === draft.contact.email)?.phone,
  ).toBe('923456789')
})

test('El checkout opcional llega a Clientes y al resumen de envío tras recarga', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'aroma-infini:cart:v1',
      JSON.stringify({
        version: 1,
        items: [{ variantId: 'cedre-50', quantity: 1 }],
      }),
    )
  })
  await page.goto('/checkout')
  await page.getByLabel('Nombre', { exact: true }).fill('Ana')
  await page.getByLabel('Apellido').fill('Prueba')
  await page.getByLabel('Correo electrónico').fill('ana@ejemplo.invalid')
  await page.getByLabel('Celular').fill('912345678')
  await page.getByRole('button', { name: 'Continuar a entrega' }).click()

  const receiverToggle = page.getByRole('checkbox', {
    name: '¿Otra persona recibirá el pedido?',
  })
  await expect(receiverToggle).not.toBeChecked()
  await expect(page.getByLabel('DNI de quien recibe')).toHaveCount(0)
  await page.getByLabel('Departamento').selectOption('lima')
  await page.getByLabel('Provincia').selectOption('1501')
  await page.getByLabel('Distrito').selectOption('150122')
  await page.getByLabel('Dirección', { exact: true }).fill('Av. Central 123')
  await page.getByLabel('Referencia').fill('Frente al parque')
  await receiverToggle.check()
  await page.getByLabel('Nombre de quien recibe').fill('Luis Prueba')
  await page.getByLabel('DNI de quien recibe').fill('123')
  await page.getByRole('button', { name: 'Revisar selección' }).click()
  await expect(page.getByLabel('DNI de quien recibe')).toBeVisible()
  await page.getByLabel('DNI de quien recibe').fill('12345678')
  await page.getByRole('button', { name: 'Revisar selección' }).click()
  await expect(
    page.getByText('Recibe: Luis Prueba · DNI 12345678'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Guardar selección' }).click()
  await expect(
    page.getByRole('heading', { name: 'Tu selección quedó guardada.' }),
  ).toBeVisible()
  const reference = (await page
    .locator('.checkout-confirmation-tracking strong')
    .textContent())!.trim()

  await page.reload()
  await page.goto(`/admin/pedidos/${reference}`)
  await expect(
    page.getByText('Recibe: Luis Prueba · DNI 12345678'),
  ).toBeVisible()
  await page.getByText('Resumen de envío', { exact: true }).click()
  const sheet = page.locator('.admin-shipping-sheet')
  await expect(sheet).toContainText('Luis Prueba')
  await expect(sheet).toContainText('DNI: 12345678')
  await expect(sheet).toContainText('Cel.: 912345678')
  await expect(sheet).toContainText('Miraflores')
  await expect(sheet).toContainText('Lima · Lima')
  await expect(sheet).toContainText('Frente al parque')
  await expect(
    page.getByRole('button', { name: 'Imprimir resumen' }),
  ).toBeEnabled()

  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true)
  await page.emulateMedia({ media: 'print' })
  const printSize = await sheet.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      width: style.width,
      height: style.height,
      overflow: element.scrollHeight - element.clientHeight,
    }
  })
  expect(parseFloat(printSize.width)).toBeGreaterThan(370)
  expect(parseFloat(printSize.width)).toBeLessThan(390)
  expect(parseFloat(printSize.height)).toBeGreaterThan(560)
  expect(printSize.overflow).toBeLessThanOrEqual(1)
  await page.emulateMedia({ media: 'screen' })

  await page.goto('/admin/clientes')
  const customer = page.locator('tr', { hasText: 'ana@ejemplo.invalid' })
  await expect(customer).toContainText('Lima')
  await expect(customer).toContainText('Miraflores')

  await page.goto('/checkout')
  await page.getByLabel('Nombre', { exact: true }).fill('Ana')
  await page.getByLabel('Apellido').fill('Prueba')
  await page.getByLabel('Correo electrónico').fill('ana@ejemplo.invalid')
  await page.getByLabel('Celular').fill('923456789')
  await page.getByRole('button', { name: 'Continuar a entrega' }).click()
  await page.getByLabel('Departamento').selectOption('arequipa')
  await page.getByLabel('Provincia').selectOption('0401')
  await page.getByLabel('Distrito').selectOption('040103')
  const longStreet = 'W'.repeat(150)
  const longReference = 'W'.repeat(120)
  await page.getByLabel('Dirección', { exact: true }).fill(longStreet)
  await page.getByLabel('Referencia').fill(longReference)
  await receiverToggle.check()
  await page.getByLabel('Nombre de quien recibe').fill('Nombre temporal')
  await page.getByLabel('DNI de quien recibe').fill('87654321')
  await receiverToggle.uncheck()
  await expect(page.getByLabel('DNI de quien recibe')).toHaveCount(0)
  await page.getByRole('button', { name: 'Revisar selección' }).click()
  await expect(page.locator('.checkout-review-detail')).not.toContainText(
    'Nombre temporal',
  )
  await page.getByRole('button', { name: 'Guardar selección' }).click()
  await expect(
    page.getByRole('heading', { name: 'Tu selección quedó guardada.' }),
  ).toBeVisible()
  const secondReference = (await page
    .locator('.checkout-confirmation-tracking strong')
    .textContent())!.trim()

  await page.goto('/admin/clientes')
  const updatedCustomer = page.locator('tr', {
    hasText: 'ana@ejemplo.invalid',
  })
  await expect(updatedCustomer).toContainText('Arequipa')
  await expect(updatedCustomer).toContainText('Cayma')

  await page.goto(`/admin/pedidos/${reference}`)
  await page.getByText('Resumen de envío', { exact: true }).click()
  await expect(page.locator('.admin-shipping-sheet')).toContainText(
    'Cel.: 912345678',
  )
  await expect(page.locator('.admin-shipping-sheet')).toContainText(
    'Miraflores',
  )

  await page.goto(`/admin/pedidos/${secondReference}`)
  await page.getByText('Resumen de envío', { exact: true }).click()
  const longSheet = page.locator('.admin-shipping-sheet')
  await expect(longSheet).toContainText('Cel.: 923456789')
  await expect(longSheet).toContainText(longStreet)
  await expect(longSheet).toContainText(longReference)
  await expect(longSheet).not.toContainText('Nombre temporal')
  await page.emulateMedia({ media: 'print' })
  const longPrintOverflow = await longSheet.evaluate(
    (element) => element.scrollHeight - element.clientHeight,
  )
  expect(longPrintOverflow).toBeLessThanOrEqual(1)
})

test('El comprador puede dejar el receptor desactivado y los pedidos antiguos no imprimen datos faltantes', async ({
  page,
}) => {
  await page.goto('/admin/pedidos/AI-210926-01')
  await page.getByText('Resumen de envío', { exact: true }).click()
  await expect(page.locator('.admin-shipping-sheet')).toContainText(
    'Por completar',
  )
  await expect(
    page.getByRole('button', { name: 'Imprimir resumen' }),
  ).toBeDisabled()
})
