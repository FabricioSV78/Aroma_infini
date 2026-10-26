import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { createAdditionalDemoOrders } from '../src/content/demo-orders'
import { adminService } from '../src/services/admin-service'
import { persistedAdminState } from './product-import-fixtures'

test('los pedidos de demostración completan 50 sin duplicar referencias ni tocar el inventario', () => {
  adminService.reset()
  const state = structuredClone(adminService.getSnapshot())
  const originals = state.orders.filter(
    (order) => !order.reference.startsWith('AI-DEMO-'),
  )
  const customers = state.customers.filter(
    (customer) => !customer.id.startsWith('order-demo-customer-'),
  )
  const added = createAdditionalDemoOrders(
    originals,
    customers,
    state.products,
    state.brands,
    state.shipping,
  )
  expect(added.orders).toHaveLength(46)
  expect(added.customers).toHaveLength(46)
  expect(
    new Set([...originals, ...added.orders].map((order) => order.reference))
      .size,
  ).toBe(50)
  expect(
    added.orders.every(
      (order) =>
        order.customerName.includes('demostración') &&
        order.customerEmail.endsWith('@example.invalid'),
    ),
  ).toBe(true)
  for (const order of added.orders) {
    expect(
      order.lines.reduce(
        (sum, line) => sum + line.quantity * line.unitPriceCents,
        0,
      ),
    ).toBe(order.subtotalCents)
    expect(order.totalCents).toBe(
      order.subtotalCents + order.shippingCents - order.discountCents,
    )
  }
  expect(
    createAdditionalDemoOrders(
      state.orders,
      state.customers,
      state.products,
      state.brands,
      state.shipping,
    ).orders,
  ).toEqual([])
  expect(adminService.getSnapshot()).toEqual(state)
})

test('el listado normal pagina 20, 20 y 10 pedidos y conserva la selección entre páginas', async ({
  page,
}) => {
  await mkdir('artifacts/orders-demo-pagination', { recursive: true })
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/admin/pedidos')
  const rows = page.locator('.admin-table--orders tbody tr')
  const pagination = page.getByRole('navigation', {
    name: 'Paginación de pedidos',
    exact: true,
  })
  await expect(rows).toHaveCount(20)
  await expect(pagination).toContainText('Mostrando 1–20 de 50 pedidos')
  await expect(pagination).toContainText('Página 1 de 3')
  const first = await rows
    .first()
    .locator('input[type="checkbox"]')
    .getAttribute('aria-label')
  await page.getByRole('checkbox', { name: first!, exact: true }).check()
  const references: string[] = []
  for (let index = 0; index < 3; index++) {
    await expect(rows).toHaveCount(index === 2 ? 10 : 20)
    references.push(
      ...(await rows
        .locator('input[type="checkbox"]')
        .evaluateAll((inputs) =>
          inputs.map((input) => input.getAttribute('aria-label')!),
        )),
    )
    await pagination.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: `artifacts/orders-demo-pagination/page-${index + 1}.png`,
      animations: 'disabled',
    })
    if (index < 2)
      await pagination
        .getByRole('button', { name: 'Siguiente', exact: true })
        .click()
  }
  expect(new Set(references).size).toBe(50)
  await expect(pagination).toContainText('Mostrando 41–50 de 50 pedidos')
  await expect(
    pagination.getByRole('button', { name: 'Siguiente', exact: true }),
  ).toBeDisabled()
  await rows.first().locator('input[type="checkbox"]').check()
  await page.getByRole('button', { name: 'Exportar PDF', exact: true }).click()
  await expect(
    page.getByRole('dialog', { name: 'Exportar PDF', exact: true }),
  ).toContainText('2 pedidos seleccionados')
  await page.keyboard.press('Escape')
  await pagination
    .getByRole('button', { name: 'Anterior', exact: true })
    .click()
  await pagination
    .getByRole('button', { name: 'Anterior', exact: true })
    .click()
  await expect(
    page.getByRole('checkbox', { name: first!, exact: true }),
  ).toBeChecked()
  const before = await persistedAdminState(page)
  await page.reload()
  await expect(rows).toHaveCount(20)
  expect((await persistedAdminState(page)).orders).toEqual(before.orders)
  await page.setViewportSize({ width: 390, height: 844 })
  await pagination.scrollIntoViewIfNeeded()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: 'artifacts/orders-demo-pagination/mobile.png',
    animations: 'disabled',
  })
})

test('una actualización de datos antigua agrega solo los pedidos faltantes y respeta los existentes', async ({
  page,
}) => {
  await page.goto('/admin/pedidos')
  await expect(page.locator('.admin-table--orders tbody tr')).toHaveCount(20)
  const before = await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const persistencePath = '/src/services/admin-persistence.ts'
    const { adminService } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    const { writeAdminState } = (await import(
      persistencePath
    )) as typeof import('../src/services/admin-persistence')
    await adminService.flush()
    const snapshot = structuredClone(adminService.getSnapshot())
    snapshot.orders = snapshot.orders.filter(
      (order) => !order.reference.startsWith('AI-DEMO-'),
    )
    snapshot.customers = snapshot.customers.filter(
      (customer) => !customer.id.startsWith('order-demo-customer-'),
    )
    Reflect.deleteProperty(snapshot, 'demoOrdersVersion')
    snapshot.orders[0].customerName = 'Nombre conservado por el administrador'
    await writeAdminState(snapshot)
    return snapshot
  })
  await page.reload()
  await expect(
    page.getByRole('navigation', {
      name: 'Paginación de pedidos',
      exact: true,
    }),
  ).toContainText('50 pedidos')
  const after = await persistedAdminState(page)
  expect(after.products).toEqual(before.products)
  expect(after.orderHistory).toEqual(before.orderHistory)
  for (const order of before.orders)
    expect(
      after.orders.find((item) => item.reference === order.reference),
    ).toEqual(order)
  expect(after.orders).toHaveLength(50)
  expect(after.revision).toBe(before.revision + 1)
  await page.reload()
  expect(await persistedAdminState(page)).toEqual(after)
})

test('la carga es de una sola vez y no repone pedidos tras cambios posteriores', async ({
  page,
}) => {
  await page.goto('/admin/pedidos')
  await expect(page.locator('.admin-table--orders tbody tr')).toHaveCount(20)
  await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const persistencePath = '/src/services/admin-persistence.ts'
    const { adminService } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    const { writeAdminState } = (await import(
      persistencePath
    )) as typeof import('../src/services/admin-persistence')
    await adminService.flush()
    const snapshot = structuredClone(adminService.getSnapshot())
    snapshot.orders = snapshot.orders.slice(0, 43)
    await writeAdminState(snapshot)
  })
  await page.reload()
  await expect(
    page.getByRole('navigation', {
      name: 'Paginación de pedidos',
      exact: true,
    }),
  ).toContainText('43 pedidos')
  expect((await persistedAdminState(page)).orders).toHaveLength(43)
})
