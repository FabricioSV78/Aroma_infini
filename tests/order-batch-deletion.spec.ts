import { expect, test, type Page } from '@playwright/test'
import {
  seedWorkflowOrders,
  workflowOperator,
  workflowSnapshot,
} from './order-workflow-fixtures'

async function prepareBatches(page: Page, count = 10) {
  const references = await seedWorkflowOrders(page, count)
  const firstSize = count > 20 ? 25 : 3
  const batches = await page.evaluate(
    async ({ references, firstSize, operator }) => {
      const module = '/src/services/admin-service.ts'
      const { adminService } = (await import(
        module
      )) as typeof import('../src/services/admin-service')
      adminService.setOrderStatus(references.at(-1)!, 'preparing', operator)
      const first = adminService.createOrderBatch(
        'Despacho Lima',
        references.slice(0, firstSize),
        operator,
      )
      const second = adminService.createOrderBatch(
        'Despacho Callao',
        references.slice(firstSize, firstSize + 2),
        operator,
      )
      if (first.kind !== 'saved' || second.kind !== 'saved')
        throw new Error('No se pudieron preparar los lotes de la prueba.')
      await adminService.flush()
      return [first.batch, second.batch]
    },
    { references, firstSize, operator: workflowOperator },
  )
  await page.reload()
  return { references, batches }
}

test('eliminar un lote conserva todos los pedidos, su historial, el inventario y los demás lotes', async ({
  page,
}) => {
  const { references, batches } = await prepareBatches(page)
  const before = await workflowSnapshot(page)
  expect(before.orderHistory).toHaveLength(1)
  const result = await page.evaluate(async (id) => {
    const module = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      module
    )) as typeof import('../src/services/admin-service')
    const result = adminService.deleteOrderBatch(id)
    await adminService.flush()
    return result
  }, batches[0].id)
  expect(result.kind).toBe('saved')
  const after = await workflowSnapshot(page)
  expect(after).toEqual({
    ...before,
    revision: before.revision + 1,
    orderBatches: [batches[1]],
  })
  await page.reload()
  expect(await workflowSnapshot(page)).toEqual(after)
  const reassigned = await page.evaluate(
    async ({ references, operator }) => {
      const module = '/src/services/admin-service.ts'
      const { adminService } = (await import(
        module
      )) as typeof import('../src/services/admin-service')
      const result = adminService.createOrderBatch(
        'Nueva agrupación',
        references.slice(0, 3),
        operator,
      )
      await adminService.flush()
      return result
    },
    { references, operator: workflowOperator },
  )
  expect(reassigned.kind).toBe('saved')
  if (reassigned.kind !== 'saved') throw new Error(reassigned.message)
  expect(reassigned.batch.orderReferences).toEqual(references.slice(0, 3))
  const final = await workflowSnapshot(page)
  expect(final.orders).toEqual(before.orders)
  expect(final.products).toEqual(before.products)
  expect(final.orderHistory).toEqual(before.orderHistory)
  expect(final.orderBatches).toHaveLength(2)
  expect(final.orderBatches[0]).toEqual(batches[1])
})

test('un lote inexistente o ya eliminado no vuelve a guardar ni modifica los datos', async ({
  page,
}) => {
  const { batches } = await prepareBatches(page)
  const results = await page.evaluate(async (id) => {
    const module = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      module
    )) as typeof import('../src/services/admin-service')
    const deleted = adminService.deleteOrderBatch(id)
    await adminService.flush()
    const before = structuredClone(adminService.getSnapshot())
    const missing = adminService.deleteOrderBatch('lote-inexistente')
    const repeated = adminService.deleteOrderBatch(id)
    await adminService.flush()
    return {
      deleted,
      missing,
      repeated,
      before,
      after: structuredClone(adminService.getSnapshot()),
    }
  }, batches[0].id)
  expect(results.deleted.kind).toBe('saved')
  expect(results.missing.kind).toBe('validation')
  expect(results.repeated.kind).toBe('validation')
  expect(results.after).toEqual(results.before)
  expect(await workflowSnapshot(page)).toEqual(results.before)
})

test('la eliminación se confirma, permite cancelar y conserva los otros filtros al quitar solo el lote', async ({
  page,
}) => {
  const { references, batches } = await prepareBatches(page, 50)
  const batch = batches[0]
  await expect(
    page.getByRole('button', { name: /^Eliminar lote / }),
  ).toHaveCount(0)
  await page.goto(
    `/admin/pedidos?q=AI-TEST&preparacion=received&desde=2026-10-20&lote=${batch.id}&page=2`,
  )
  await page
    .getByRole('checkbox', {
      name: `Seleccionar pedido ${references[20]}`,
      exact: true,
    })
    .check()
  const before = await workflowSnapshot(page)
  const remove = page.getByRole('button', {
    name: `Eliminar lote ${batch.name}`,
    exact: true,
  })
  await remove.click()
  const dialog = page.getByRole('alertdialog', {
    name: 'Eliminar lote',
    exact: true,
  })
  await expect(dialog).toContainText(batch.name)
  await expect(dialog).toContainText(/pedidos.*conserv|conserv.*pedidos/i)
  await expect(dialog.getByLabel('Responsable de los cambios')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  expect(await workflowSnapshot(page)).toEqual(before)
  expect(new URL(page.url()).searchParams.get('lote')).toBe(batch.id)
  await expect(page.locator('.admin-order-selection-bar')).toBeVisible()
  await remove.click()
  await dialog
    .getByRole('button', { name: 'Eliminar lote', exact: true })
    .evaluate((button) => {
      ;(button as HTMLButtonElement).click()
      ;(button as HTMLButtonElement).click()
    })
  await expect(dialog).not.toBeVisible()
  await expect
    .poll(async () => (await workflowSnapshot(page)).orderBatches.length)
    .toBe(1)
  const params = new URL(page.url()).searchParams
  expect(params.get('lote')).toBeNull()
  expect(params.get('page')).toBeNull()
  expect(params.get('q')).toBe('AI-TEST')
  expect(params.get('preparacion')).toBe('received')
  expect(params.get('desde')).toBe('2026-10-20')
  await expect(page.locator('.admin-order-selection-bar')).toHaveCount(0)
  const filter = page.getByRole('combobox', {
    name: 'Lote de trabajo',
    exact: true,
  })
  await expect(filter.locator(`option[value="${batch.id}"]`)).toHaveCount(0)
  await expect(filter.locator(`option[value="${batches[1].id}"]`)).toHaveCount(
    1,
  )
  const after = await workflowSnapshot(page)
  expect(after.orders).toEqual(before.orders)
  expect(after.orderHistory).toEqual(before.orderHistory)
  expect(after.products).toEqual(before.products)
  await page.reload()
  expect((await workflowSnapshot(page)).orderBatches).toEqual([batches[1]])
})

test('el diálogo permite recorrer las acciones con teclado, cancelar con Escape y confirmar', async ({
  page,
}) => {
  const { batches } = await prepareBatches(page)
  const batch = batches[0]
  await page.goto(`/admin/pedidos?lote=${batch.id}`)
  const remove = page.getByRole('button', {
    name: `Eliminar lote ${batch.name}`,
    exact: true,
  })
  await remove.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('alertdialog', {
    name: 'Eliminar lote',
    exact: true,
  })
  await expect(dialog).toBeVisible()
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press('Tab')
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(remove).toBeFocused()
  expect((await workflowSnapshot(page)).orderBatches).toHaveLength(2)
  await page.keyboard.press('Enter')
  await dialog
    .getByRole('button', { name: 'Eliminar lote', exact: true })
    .focus()
  await page.keyboard.press('Enter')
  await expect(dialog).not.toBeVisible()
  await expect
    .poll(async () => (await workflowSnapshot(page)).orderBatches.length)
    .toBe(1)
})

test('si falla el almacenamiento, reintentar guarda la eliminación sin tocar pedidos ni duplicar cambios', async ({
  page,
}) => {
  const { batches } = await prepareBatches(page)
  await page.goto(`/admin/pedidos?lote=${batches[0].id}`)
  const before = await workflowSnapshot(page)
  await page.evaluate(async () => {
    const module = '/src/services/admin-persistence.ts'
    const { localAdminStateRepository } = (await import(
      module
    )) as typeof import('../src/services/admin-persistence')
    const originalWrite = localAdminStateRepository.write
    localAdminStateRepository.write = async () => {
      localAdminStateRepository.write = originalWrite
      throw new DOMException(
        'Fallo provocado por la prueba.',
        'QuotaExceededError',
      )
    }
  })
  await page
    .getByRole('button', {
      name: `Eliminar lote ${batches[0].name}`,
      exact: true,
    })
    .click()
  const dialog = page.getByRole('alertdialog', {
    name: 'Eliminar lote',
    exact: true,
  })
  await dialog
    .getByRole('button', { name: 'Eliminar lote', exact: true })
    .click()
  await expect(dialog).not.toBeVisible()
  const failure = page.locator('.admin-notice-dialog')
  await expect(failure).toHaveAttribute('role', 'alertdialog')
  expect(await workflowSnapshot(page)).toEqual(before)
  const inMemory = await page.evaluate(async () => {
    const module = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      module
    )) as typeof import('../src/services/admin-service')
    return structuredClone(adminService.getSnapshot())
  })
  expect(inMemory.orderBatches).toEqual([batches[1]])
  await failure
    .getByRole('button', { name: 'Reintentar guardado', exact: true })
    .click()
  await expect(failure).not.toBeVisible()
  expect(await workflowSnapshot(page)).toEqual(inMemory)
  await page.reload()
  const after = await workflowSnapshot(page)
  expect(after).toEqual(inMemory)
  expect(after.orders).toEqual(before.orders)
  expect(after.orderHistory).toEqual(before.orderHistory)
  expect(after.products).toEqual(before.products)
})

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`la acción discreta y la confirmación son operables a ${viewport.width} × ${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    const { batches } = await prepareBatches(page)
    const batch = batches[0]
    await page.goto(`/admin/pedidos?lote=${batch.id}`)
    const remove = page.getByRole('button', {
      name: `Eliminar lote ${batch.name}`,
      exact: true,
    })
    await expect(remove).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    const actionBox = await remove.boundingBox()
    expect(actionBox?.height).toBeGreaterThanOrEqual(44)
    await remove.scrollIntoViewIfNeeded()
    await page.screenshot({
      path: `artifacts/order-workflow/delete-batch-action-${viewport.name}.png`,
      animations: 'disabled',
    })
    await remove.click()
    const dialog = page.getByRole('alertdialog', {
      name: 'Eliminar lote',
      exact: true,
    })
    await expect(dialog).toBeVisible()
    const bounds = await dialog.boundingBox()
    expect(bounds).not.toBeNull()
    if (bounds) {
      expect(bounds.x).toBeGreaterThanOrEqual(0)
      expect(bounds.y).toBeGreaterThanOrEqual(0)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1)
    }
    await page.screenshot({
      path: `artifacts/order-workflow/delete-batch-confirm-${viewport.name}.png`,
      animations: 'disabled',
    })
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
    expect((await workflowSnapshot(page)).orderBatches).toHaveLength(2)
  })
}
