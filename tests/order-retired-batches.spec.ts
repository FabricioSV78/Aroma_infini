import { expect, test } from '@playwright/test'
import { seedWorkflowOrders, workflowSnapshot } from './order-workflow-fixtures'

test('retirar agrupaciones antiguas conserva pedidos, historial operativo e inventario', async ({
  page,
}) => {
  const references = await seedWorkflowOrders(page, 10)
  const before = await page.evaluate(async (references) => {
    const servicePath = '/src/services/admin-service.ts'
    const persistencePath = '/src/services/admin-persistence.ts'
    const { adminService } = (await import(
      servicePath
    )) as typeof import('../src/services/admin-service')
    const { writeAdminState } = (await import(
      persistencePath
    )) as typeof import('../src/services/admin-persistence')
    const result = adminService.setOrderStatus(references[0], 'preparing')
    if (result.kind !== 'saved') throw new Error(result.message)
    await adminService.flush()
    const snapshot = structuredClone(adminService.getSnapshot())
    const legacy = Object.assign(structuredClone(snapshot), {
      orderBatches: [
        {
          id: 'legacy-retired',
          code: 'LOT-ANTERIOR',
          name: 'Despacho anterior',
          orderReferences: references.slice(0, 5),
          createdAt: '2026-10-21T15:00:00Z',
          archived: false,
          operator: { id: null, verified: false, name: 'Operador anterior' },
        },
      ],
    })
    await writeAdminState(legacy)
    return snapshot
  }, references)
  await page.reload()
  await expect(page.locator('.admin-table--orders tbody tr')).toHaveCount(10)
  const after = await workflowSnapshot(page)
  expect(after.orders).toEqual(before.orders)
  expect(after.orderHistory).toEqual(before.orderHistory)
  expect(after.products).toEqual(before.products)
  expect(after.customers).toEqual(before.customers)
  expect(Reflect.has(after, 'orderBatches')).toBe(false)
  expect(
    await page.evaluate(async () => {
      const path = '/src/services/admin-service.ts'
      const { adminService } = (await import(
        path
      )) as typeof import('../src/services/admin-service')
      return ['createOrderBatch', 'updateOrderBatch', 'deleteOrderBatch'].some(
        (method) => typeof Reflect.get(adminService, method) === 'function',
      )
    }),
  ).toBe(false)
  await page.goto(`/admin/pedidos/${references[0]}`)
  const history = page.getByRole('region', {
    name: 'Historial del pedido',
    exact: true,
  })
  await expect(history).toContainText('Nuevo → En preparación')
  await expect(history).toContainText('Cambio individual')
  await expect(history).not.toContainText('Operador anterior')
  await expect(page.getByLabel('Responsable de los cambios')).toHaveCount(0)
})

test('las URLs retiradas no filtran pedidos y la selección ofrece únicamente acciones actuales', async ({
  page,
}) => {
  const references = await seedWorkflowOrders(page, 10)
  const before = await workflowSnapshot(page)
  await page.goto('/admin/pedidos?lote=legacy-retired&vista=lotes')
  await expect(page.locator('.admin-table--orders tbody tr')).toHaveCount(10)
  await expect(
    page.getByRole('combobox', { name: 'Lote de trabajo', exact: true }),
  ).toHaveCount(0)
  await page
    .getByRole('checkbox', {
      name: `Seleccionar pedido ${references[0]}`,
      exact: true,
    })
    .check()
  const actions = page.locator('.admin-order-selection-bar')
  await expect(
    actions.getByRole('button', { name: 'Cambiar estado', exact: true }),
  ).toBeVisible()
  await expect(
    actions.getByRole('button', { name: 'Exportar PDF', exact: true }),
  ).toBeVisible()
  await expect(
    actions.getByRole('button', { name: 'Quitar selección', exact: true }),
  ).toBeVisible()
  await expect(
    actions.getByRole('button', { name: 'Crear lote', exact: true }),
  ).toHaveCount(0)
  await expect(page.getByLabel('Responsable de los cambios')).toHaveCount(0)
  const after = await workflowSnapshot(page)
  expect(after.orders).toEqual(before.orders)
  expect(after.orderHistory).toEqual(before.orderHistory)
})
