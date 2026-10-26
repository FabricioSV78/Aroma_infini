import { expect, test } from '@playwright/test'
import {
  seedWorkflowOrders,
  workflowOperator,
  workflowSnapshot,
} from './order-workflow-fixtures'

for (const count of [10, 50, 100]) {
  test(`${count} pedidos se actualizan una sola vez sin alterar pago, importes ni inventario`, async ({
    page,
  }) => {
    const references = await seedWorkflowOrders(page, count)
    const before = await workflowSnapshot(page)
    const result = await page.evaluate(
      async ({ selected, operator }) => {
        const module = '/src/services/admin-service.ts'
        const { adminService } = (await import(
          module
        )) as typeof import('../src/services/admin-service')
        const updated = adminService.bulkSetOrderStatus(
          [...selected, selected[0], ` ${selected[0]} `],
          'preparing',
          operator,
          Object.fromEntries(
            selected.map((reference) => [reference, 'received' as const]),
          ),
        )
        await adminService.flush()
        return updated
      },
      { selected: references, operator: workflowOperator },
    )
    expect(result.kind).toBe('updated')
    if (result.kind !== 'updated') throw new Error(result.message)
    expect(result.updated).toEqual(references)
    expect(result.errors).toEqual([])
    expect(result.skipped).toEqual([])
    const after = await workflowSnapshot(page)
    expect(after.orders).toHaveLength(count)
    expect(new Set(after.orders.map((order) => order.reference)).size).toBe(
      count,
    )
    expect(after.revision).toBe(before.revision + 1)
    expect(
      after.orders.map((order) => ({ ...order, status: 'received' })),
    ).toEqual(before.orders)
    expect(after.products).toEqual(before.products)
    expect(after.customers).toEqual(before.customers)
    expect(after.orderHistory).toHaveLength(count)
    expect(new Set(after.orderHistory.map((entry) => entry.id)).size).toBe(
      count,
    )
    for (const entry of after.orderHistory) {
      expect(entry).toMatchObject({
        fromStatus: 'received',
        toStatus: 'preparing',
        source: 'bulk',
        operationId: result.operationId,
        operator: workflowOperator,
      })
      expect(Number.isFinite(Date.parse(entry.changedAt))).toBe(true)
    }
    await page.reload()
    const persisted = await workflowSnapshot(page)
    expect(persisted.orders).toEqual(after.orders)
    expect(persisted.orderHistory).toEqual(after.orderHistory)
    const repeated = await page.evaluate(
      async ({ selected, operator }) => {
        const module = '/src/services/admin-service.ts'
        const { adminService } = (await import(
          module
        )) as typeof import('../src/services/admin-service')
        const updated = adminService.bulkSetOrderStatus(
          selected,
          'preparing',
          operator,
        )
        await adminService.flush()
        return updated
      },
      { selected: references, operator: workflowOperator },
    )
    expect(repeated.kind).toBe('updated')
    if (repeated.kind !== 'updated') throw new Error(repeated.message)
    expect(repeated.updated).toEqual([])
    expect(repeated.skipped).toHaveLength(count)
    const unchanged = await workflowSnapshot(page)
    expect(unchanged.revision).toBe(after.revision)
    expect(unchanged.orderHistory).toEqual(after.orderHistory)
  })
}

test('errores parciales, estados obsoletos y pedidos inexistentes no afectan al resto', async ({
  page,
}) => {
  const references = await seedWorkflowOrders(page, 10, [
    { index: 0, status: 'preparing' },
    { index: 1, status: 'preparing', incompleteDelivery: true },
    { index: 3, status: 'shipped' },
    { index: 4, status: 'preparing', paymentStatus: 'pending' },
    { index: 5, status: 'preparing' },
    { index: 6, status: 'delivered' },
  ])
  const before = await workflowSnapshot(page)
  const result = await page.evaluate(
    async ({ references: all, operator }) => {
      const module = '/src/services/admin-service.ts'
      const { adminService } = (await import(
        module
      )) as typeof import('../src/services/admin-service')
      const selected = [...all.slice(0, 6), 'AI-INEXISTENTE']
      const expected = Object.fromEntries(
        adminService
          .getSnapshot()
          .orders.map((order) => [order.reference, order.status]),
      )
      expected[all[5]] = 'received'
      const updated = adminService.bulkSetOrderStatus(
        selected,
        'shipped',
        operator,
        expected,
      )
      await adminService.flush()
      return updated
    },
    { references, operator: workflowOperator },
  )
  expect(result.kind).toBe('updated')
  if (result.kind !== 'updated') throw new Error(result.message)
  expect(result.updated).toEqual([references[0]])
  expect(result.skipped.map((issue) => issue.reference)).toEqual([
    references[3],
  ])
  expect(result.errors.map((issue) => issue.reference)).toEqual([
    references[1],
    references[2],
    references[4],
    references[5],
    'AI-INEXISTENTE',
  ])
  expect(result.errors[0].message).toMatch(/datos|Completa/)
  expect(result.errors[1].message).toMatch(/paso a la vez/)
  expect(result.errors[2].message).toMatch(/pago/)
  expect(result.errors[3].message).toMatch(/cambió desde la selección/)
  const after = await workflowSnapshot(page)
  expect(after.orders[0].status).toBe('shipped')
  expect(after.orders.slice(1)).toEqual(before.orders.slice(1))
  expect(after.orderHistory).toHaveLength(1)
  expect(after.products).toEqual(before.products)
  const invalid = await page.evaluate(
    async ({ reference, operator }) => {
      const module = '/src/services/admin-service.ts'
      const { adminService } = (await import(
        module
      )) as typeof import('../src/services/admin-service')
      return adminService.bulkSetOrderStatus([reference], 'preparing', operator)
    },
    { reference: references[6], operator: workflowOperator },
  )
  expect(invalid).toMatchObject({ kind: 'updated', updated: [] })
  expect((await workflowSnapshot(page)).orderHistory).toEqual(
    after.orderHistory,
  )
})

test('la edición individual registra responsable y fecha sin duplicar cambios repetidos', async ({
  page,
}) => {
  const references = await seedWorkflowOrders(page, 10)
  const results = await page.evaluate(
    async ({ reference, operator }) => {
      const module = '/src/services/admin-service.ts'
      const { adminService } = (await import(
        module
      )) as typeof import('../src/services/admin-service')
      const invalid = adminService.setOrderStatus(reference, 'preparing', {
        ...operator,
        name: '',
      })
      const saved = adminService.setOrderStatus(
        reference,
        'preparing',
        operator,
      )
      const repeated = adminService.setOrderStatus(
        reference,
        'preparing',
        operator,
      )
      const jump = adminService.setOrderStatus(reference, 'delivered', operator)
      await adminService.flush()
      return { invalid, saved, repeated, jump }
    },
    { reference: references[0], operator: workflowOperator },
  )
  expect(results.invalid.kind).toBe('validation')
  expect(results.saved.kind).toBe('saved')
  expect(results.repeated.kind).toBe('saved')
  expect(results.jump.kind).toBe('validation')
  const after = await workflowSnapshot(page)
  expect(after.orderHistory).toHaveLength(1)
  expect(after.orderHistory[0]).toMatchObject({
    reference: references[0],
    source: 'individual',
    fromStatus: 'received',
    toStatus: 'preparing',
    operator: workflowOperator,
  })
  expect(
    after.orders.slice(1).every((order) => order.status === 'received'),
  ).toBe(true)
})

test('un snapshot anterior conserva pedidos y comienza con historial vacío', async ({
  page,
}) => {
  const references = await seedWorkflowOrders(page, 10)
  await page.evaluate(async () => {
    const module = '/src/services/admin-service.ts'
    const persistence = '/src/services/admin-persistence.ts'
    const { adminService } = (await import(
      module
    )) as typeof import('../src/services/admin-service')
    const { writeAdminState } = (await import(
      persistence
    )) as typeof import('../src/services/admin-persistence')
    await adminService.flush()
    const legacy = structuredClone(adminService.getSnapshot())
    Reflect.deleteProperty(legacy, 'orderBatches')
    Reflect.deleteProperty(legacy, 'orderHistory')
    await writeAdminState(legacy)
  })
  await page.reload()
  const restored = await page.evaluate(async () => {
    const module = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = (await import(
      module
    )) as typeof import('../src/services/admin-service')
    await hydrateAdminStore()
    return structuredClone(adminService.getSnapshot())
  })
  expect(restored.orders.map((order) => order.reference)).toEqual(references)
  expect(Reflect.has(restored, 'orderBatches')).toBe(false)
  expect(restored.orderHistory).toEqual([])
})
