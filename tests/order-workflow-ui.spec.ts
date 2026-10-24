import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  seedWorkflowOrders,
  workflowOperator,
  workflowSnapshot,
  workflowViewports,
} from './order-workflow-fixtures'

async function identifyOperator(page: Page | Locator) {
  await page
    .getByLabel('Responsable de los cambios')
    .fill(workflowOperator.name)
}

async function selectOrder(page: Page, reference: string) {
  await page
    .getByRole('checkbox', {
      name: `Seleccionar pedido ${reference}`,
      exact: true,
    })
    .check()
}

test('seleccionar los 100 filtrados exige confirmación, permite cancelar y no duplica cambios', async ({
  page,
}) => {
  const references = await seedWorkflowOrders(page, 100)
  await expect(
    page.getByRole('button', { name: 'Cambiar estado', exact: true }),
  ).toHaveCount(0)
  await expect(page.locator('.admin-table--orders tbody tr')).toHaveCount(20)
  await page
    .getByRole('checkbox', {
      name: 'Seleccionar pedidos de esta página',
      exact: true,
    })
    .check()
  await expect(
    page.locator(
      'input[type="checkbox"][aria-label^="Seleccionar pedido AI-"]:checked',
    ),
  ).toHaveCount(20)
  await page
    .getByRole('button', {
      name: 'Seleccionar los 100 pedidos filtrados',
      exact: true,
    })
    .click()
  await page
    .getByRole('button', { name: 'Cambiar estado', exact: true })
    .click()
  let dialog = page.getByRole('dialog', {
    name: 'Actualizar 100 pedidos',
    exact: true,
  })
  await expect(dialog).toBeVisible()
  await identifyOperator(dialog)
  await dialog.getByLabel('Nuevo estado').selectOption('preparing')
  expect((await workflowSnapshot(page)).orderHistory).toEqual([])
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
  expect(
    (await workflowSnapshot(page)).orders.every(
      (order) => order.status === 'received',
    ),
  ).toBe(true)
  await page
    .getByRole('button', { name: 'Cambiar estado', exact: true })
    .click()
  dialog = page.getByRole('dialog', {
    name: 'Actualizar 100 pedidos',
    exact: true,
  })
  await dialog.getByLabel('Nuevo estado').selectOption('preparing')
  await dialog
    .getByRole('button', { name: 'Confirmar actualización', exact: true })
    .evaluate((button) => {
      ;(button as HTMLButtonElement).click()
      ;(button as HTMLButtonElement).click()
    })
  await expect(dialog).not.toBeVisible()
  await expect
    .poll(async () => (await workflowSnapshot(page)).orderHistory.length)
    .toBe(100)
  const after = await workflowSnapshot(page)
  expect(after.orders.map((order) => order.reference)).toEqual(references)
  expect(after.orders.every((order) => order.status === 'preparing')).toBe(true)
  expect(after.orderHistory).toHaveLength(100)
  expect(
    after.orderHistory.every(
      (entry) => entry.operator.name === workflowOperator.name,
    ),
  ).toBe(true)
  await page.reload()
  expect((await workflowSnapshot(page)).orderHistory).toHaveLength(100)
})

test('las selecciones corresponden al filtro de fecha y estado, sin tocar pedidos ocultos', async ({
  page,
}) => {
  await seedWorkflowOrders(page, 50, [
    ...Array.from({ length: 15 }, (_, index) => ({
      index,
      placedAt: '2026-10-15T15:00:00.000Z',
    })),
    ...Array.from({ length: 10 }, (_, index) => ({
      index: index + 15,
      status: 'preparing' as const,
    })),
  ])
  await page.getByLabel('Estado del pedido').selectOption('received')
  await page.getByLabel('Desde', { exact: true }).fill('2026-10-20')
  await page.getByLabel('Hasta', { exact: true }).fill('2026-10-22')
  await page
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click()
  await page
    .getByRole('checkbox', {
      name: 'Seleccionar pedidos de esta página',
      exact: true,
    })
    .check()
  await page
    .getByRole('button', {
      name: 'Seleccionar los 25 pedidos filtrados',
      exact: true,
    })
    .click()
  await page
    .getByRole('button', { name: 'Cambiar estado', exact: true })
    .click()
  const dialog = page.getByRole('dialog', {
    name: 'Actualizar 25 pedidos',
    exact: true,
  })
  await identifyOperator(dialog)
  await dialog.getByLabel('Nuevo estado').selectOption('preparing')
  await dialog
    .getByRole('button', { name: 'Confirmar actualización', exact: true })
    .click()
  await expect(dialog).not.toBeVisible()
  const after = await workflowSnapshot(page)
  expect(
    after.orders.slice(0, 15).every((order) => order.status === 'received'),
  ).toBe(true)
  expect(
    after.orders.slice(15).every((order) => order.status === 'preparing'),
  ).toBe(true)
  expect(after.orderHistory).toHaveLength(25)
  await expect(
    page.getByRole('heading', { name: 'No encontramos pedidos', exact: true }),
  ).toBeVisible()
})

test('el resultado masivo identifica cada error y conserva los pedidos no válidos', async ({
  page,
}) => {
  const references = await seedWorkflowOrders(page, 10, [
    { index: 0, status: 'preparing' },
    { index: 1, status: 'preparing', incompleteDelivery: true },
    { index: 2, status: 'preparing', paymentStatus: 'pending' },
  ])
  for (const reference of references.slice(0, 3))
    await selectOrder(page, reference)
  await page
    .getByRole('button', { name: 'Cambiar estado', exact: true })
    .click()
  const dialog = page.getByRole('dialog', {
    name: 'Actualizar 3 pedidos',
    exact: true,
  })
  await identifyOperator(dialog)
  await dialog.getByLabel('Nuevo estado').selectOption('shipped')
  await dialog
    .getByRole('checkbox', {
      name: 'Confirmo que los pedidos ya fueron enviados',
      exact: true,
    })
    .check()
  await dialog
    .getByRole('button', { name: 'Confirmar actualización', exact: true })
    .click()
  await expect(dialog).not.toBeVisible()
  const after = await workflowSnapshot(page)
  expect(after.orders[0].status).toBe('shipped')
  expect(after.orders[1].status).toBe('preparing')
  expect(after.orders[2].status).toBe('preparing')
  expect(after.orderHistory).toHaveLength(1)
  const results = page.locator('.admin-order-bulk-report')
  await expect(results).toContainText(references[1])
  await expect(results).toContainText(references[2])
  await expect(results).toContainText(/pago/)
  await expect(results).toContainText(/entrega/)
  await results.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: 'artifacts/order-workflow/partial-errors.png',
    animations: 'disabled',
  })
})

test('el listado no muestra responsable ni atención y las URLs antiguas no filtran silenciosamente', async ({
  page,
}) => {
  const references = await seedWorkflowOrders(page, 10, [
    { index: 1, paymentStatus: 'pending' },
    { index: 2, incompleteDelivery: true },
    {
      index: 3,
      status: 'delivered',
      paymentStatus: 'refunded',
      incompleteDelivery: true,
    },
  ])
  await page.goto('/admin/pedidos?atencion=1')
  await expect(page.getByLabel('Responsable de los cambios')).toHaveCount(0)
  await expect(
    page.getByRole('checkbox', { name: 'Requiere atención', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByText('Registro local · identidad no verificada'),
  ).toHaveCount(0)
  await expect(
    page.getByText('Fechas de Lima · pago o datos de entrega pendientes'),
  ).toHaveCount(0)
  await expect(page.locator('.admin-table--orders tbody tr')).toHaveCount(10)
  await selectOrder(page, references[1])
  await expect(
    page.getByRole('button', { name: 'Cambiar estado', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Quitar selección', exact: true })
    .click()
  await expect(page.locator('.admin-table--orders tbody tr')).toHaveCount(10)
  await expect(
    page.getByRole('button', { name: 'Cambiar estado', exact: true }),
  ).toHaveCount(0)
  await page.getByLabel('Desde', { exact: true }).fill('2026-10-22')
  await page.getByLabel('Hasta', { exact: true }).fill('2026-10-20')
  await page
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText('fecha inicial')
  await expect(page.locator('.admin-table--orders tbody tr')).toHaveCount(10)
  expect((await workflowSnapshot(page)).orderHistory).toEqual([])
})

test('la selección persiste entre páginas y se limpia al filtrar o volver Atrás', async ({
  page,
}) => {
  const references = await seedWorkflowOrders(page, 50)
  await selectOrder(page, references[0])
  const pagination = page.getByRole('navigation', {
    name: 'Paginación de pedidos',
    exact: true,
  })
  await pagination
    .getByRole('button', { name: 'Siguiente', exact: true })
    .click()
  await expect(page).toHaveURL(/page=2/)
  await expect(page.locator('.admin-order-selection-bar')).toContainText(
    '1 pedido seleccionado',
  )
  await selectOrder(page, references[20])
  await expect(page.locator('.admin-order-selection-bar')).toContainText(
    '2 pedidos seleccionados',
  )
  await pagination
    .getByRole('button', { name: 'Anterior', exact: true })
    .click()
  await expect(
    page.getByRole('checkbox', {
      name: `Seleccionar pedido ${references[0]}`,
      exact: true,
    }),
  ).toBeChecked()
  await expect(page.locator('.admin-order-selection-bar')).toContainText(
    '2 pedidos seleccionados',
  )
  await page
    .getByRole('searchbox', { name: 'Buscar', exact: true })
    .fill(references[0])
  await page
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click()
  await expect(page.locator('.admin-table--orders tbody tr')).toHaveCount(1)
  await expect(page.locator('.admin-order-selection-bar')).toHaveCount(0)
  await selectOrder(page, references[0])
  await expect(page.locator('.admin-order-selection-bar')).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL('/admin/pedidos')
  await expect(page.locator('.admin-table--orders tbody tr')).toHaveCount(20)
  await expect(page.locator('.admin-order-selection-bar')).toHaveCount(0)
  await expect(
    page.getByRole('checkbox', {
      name: `Seleccionar pedido ${references[0]}`,
      exact: true,
    }),
  ).not.toBeChecked()
  expect((await workflowSnapshot(page)).orderHistory).toEqual([])
})

test('los lotes se crean desde pedidos y solo agrupan el filtro sin una interfaz independiente', async ({
  page,
}) => {
  const references = await seedWorkflowOrders(page, 10, [
    { index: 1, status: 'preparing' },
    { index: 2, status: 'shipped' },
    { index: 3, status: 'delivered' },
  ])
  await expect(page.getByLabel('Responsable de los cambios')).toHaveCount(0)
  const before = await workflowSnapshot(page)
  for (const reference of references.slice(0, 4))
    await selectOrder(page, reference)
  await page.getByRole('button', { name: 'Crear lote', exact: true }).click()
  const create = page.getByRole('dialog', {
    name: 'Crear lote de trabajo',
    exact: true,
  })
  await expect(create).toBeVisible()
  const responsible = create.getByLabel('Responsable de los cambios')
  await expect(responsible).toHaveValue('')
  await expect(page.getByLabel('Responsable de los cambios')).toHaveCount(1)
  await create.getByLabel('Nombre del lote').fill('Despacho Miraflores')
  await create.getByRole('button', { name: 'Crear lote', exact: true }).click()
  await expect(create).toBeVisible()
  expect(
    await responsible.evaluate(
      (input: HTMLInputElement) => input.validity.valueMissing,
    ),
  ).toBe(true)
  expect((await workflowSnapshot(page)).orderBatches).toEqual([])
  await responsible.fill('  ')
  await create.getByRole('button', { name: 'Crear lote', exact: true }).click()
  await expect(create.getByRole('alert')).toContainText(/responsable/i)
  await expect(responsible).toBeFocused()
  expect((await workflowSnapshot(page)).orderBatches).toEqual([])
  await identifyOperator(create)
  await create.getByRole('button', { name: 'Crear lote', exact: true }).click()
  await expect(create).not.toBeVisible()
  await expect(page.getByLabel('Responsable de los cambios')).toHaveCount(0)
  await expect
    .poll(async () => (await workflowSnapshot(page)).orderBatches.length)
    .toBe(1)
  const stored = await workflowSnapshot(page)
  expect(stored.orders).toEqual(before.orders)
  expect(stored.orderHistory).toEqual([])
  const batch = stored.orderBatches[0]
  expect(batch).toMatchObject({
    name: 'Despacho Miraflores',
    orderReferences: references.slice(0, 4),
    operator: workflowOperator,
  })
  await expect(
    page.getByRole('link', { name: /^Lotes de trabajo/ }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: 'Lotes de trabajo', exact: true }),
  ).toHaveCount(0)

  for (const reference of references.slice(4, 6))
    await selectOrder(page, reference)
  await page.getByRole('button', { name: 'Crear lote', exact: true }).click()
  await expect(create.getByLabel('Responsable de los cambios')).toHaveValue(
    workflowOperator.name,
  )
  await create.getByLabel('Nombre del lote').fill('Despacho Callao')
  await create.getByRole('button', { name: 'Crear lote', exact: true }).click()
  await expect(create).not.toBeVisible()
  await expect
    .poll(async () => (await workflowSnapshot(page)).orderBatches.length)
    .toBe(2)
  const secondBatch = (await workflowSnapshot(page)).orderBatches[1]
  const batchFilter = page.getByRole('combobox', {
    name: 'Lote de trabajo',
    exact: true,
  })
  await expect(batchFilter.locator(`option[value="${batch.id}"]`)).toHaveText(
    `Despacho Miraflores · ${batch.code}`,
  )
  await batchFilter.selectOption(secondBatch.id)
  await page
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click()
  await expect(page.locator('.admin-table--orders tbody tr')).toHaveCount(2)
  for (const reference of references.slice(4, 6))
    await expect(
      page.getByRole('checkbox', {
        name: `Seleccionar pedido ${reference}`,
        exact: true,
      }),
    ).toBeVisible()

  await batchFilter.selectOption(batch.id)
  await page
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click()
  await expect(page).toHaveURL(new RegExp(`lote=${batch.id}`))
  await expect(page.locator('.admin-table--orders tbody tr')).toHaveCount(4)
  await page.reload()
  await expect(batchFilter).toHaveValue(batch.id)
  await expect(page.locator('.admin-table--orders tbody tr')).toHaveCount(4)

  // Existing bookmarks for the retired workspace keep the useful order list.
  await page.goto(`/admin/pedidos?vista=lotes&lote=${batch.id}`)
  await expect(page.locator('.admin-table--orders tbody tr')).toHaveCount(4)
  await expect(
    page.getByRole('link', { name: /^Lotes de trabajo/ }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: 'Lotes de trabajo', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: /^Editar lote|^Archivar lote/ }),
  ).toHaveCount(0)

  await page.getByLabel('Estado del pedido').selectOption('received')
  await page
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click()
  await expect(page.locator('.admin-table--orders tbody tr')).toHaveCount(1)
  await expect(
    page.getByRole('checkbox', {
      name: `Seleccionar pedido ${references[0]}`,
      exact: true,
    }),
  ).toBeVisible()
  await page
    .getByRole('checkbox', {
      name: 'Seleccionar pedidos de esta página',
      exact: true,
    })
    .check()
  await page
    .getByRole('button', { name: 'Cambiar estado', exact: true })
    .click()
  const update = page.getByRole('dialog', {
    name: 'Actualizar 1 pedidos',
    exact: true,
  })
  await update.getByLabel('Nuevo estado').selectOption('preparing')
  await update
    .getByRole('button', { name: 'Confirmar actualización', exact: true })
    .click()
  await expect(update).not.toBeVisible()
  await expect
    .poll(async () => (await workflowSnapshot(page)).orderHistory.length)
    .toBe(1)
  const after = await workflowSnapshot(page)
  expect(after.orders[0].status).toBe('preparing')
  expect(after.orders.slice(1)).toEqual(before.orders.slice(1))
  expect(after.orderBatches).toHaveLength(2)
  expect(after.orderBatches[0]).toEqual(batch)
  expect(after.orderBatches[1]).toEqual(secondBatch)
})

test('el modal se utiliza con teclado y conserva el foco dentro de sus controles', async ({
  page,
}) => {
  const references = await seedWorkflowOrders(page, 10)
  const checkbox = page.getByRole('checkbox', {
    name: `Seleccionar pedido ${references[0]}`,
    exact: true,
  })
  await checkbox.focus()
  await page.keyboard.press('Space')
  await expect(checkbox).toBeChecked()
  const action = page.getByRole('button', {
    name: 'Cambiar estado',
    exact: true,
  })
  await action.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: /Actualizar/ })
  await expect(dialog).toBeVisible()
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press('Tab')
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(action).toBeFocused()
  expect((await workflowSnapshot(page)).orderHistory).toEqual([])
})

test('si falla el guardado local, reintentar persiste los cambios sin volver a aplicarlos', async ({
  page,
}) => {
  await seedWorkflowOrders(page, 10)
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
        'Fallo de almacenamiento provocado por la prueba.',
        'QuotaExceededError',
      )
    }
  })
  await page
    .getByRole('checkbox', {
      name: 'Seleccionar pedidos de esta página',
      exact: true,
    })
    .check()
  await page
    .getByRole('button', { name: 'Cambiar estado', exact: true })
    .click()
  const dialog = page.getByRole('dialog', {
    name: 'Actualizar 10 pedidos',
    exact: true,
  })
  await identifyOperator(dialog)
  await dialog.getByLabel('Nuevo estado').selectOption('preparing')
  await dialog
    .getByRole('button', { name: 'Confirmar actualización', exact: true })
    .click()
  await expect(dialog).not.toBeVisible()
  const failure = page.locator('.admin-notice-dialog')
  await expect(failure).toHaveAttribute('role', 'alertdialog')
  await expect(failure).toContainText('No se pudieron guardar los cambios')
  const unchangedStorage = await workflowSnapshot(page)
  expect(unchangedStorage.orders).toEqual(before.orders)
  expect(unchangedStorage.orderHistory).toEqual([])
  const appliedInMemory = await page.evaluate(async () => {
    const module = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      module
    )) as typeof import('../src/services/admin-service')
    return structuredClone(adminService.getSnapshot())
  })
  expect(
    appliedInMemory.orders.every((order) => order.status === 'preparing'),
  ).toBe(true)
  expect(appliedInMemory.orderHistory).toHaveLength(10)
  await failure.scrollIntoViewIfNeeded()
  await page.screenshot({
    path: 'artifacts/order-workflow/persistence-error.png',
    animations: 'disabled',
  })
  await failure
    .getByRole('button', { name: 'Reintentar guardado', exact: true })
    .click()
  await expect(failure).not.toBeVisible()
  const afterRetry = await workflowSnapshot(page)
  expect(afterRetry.orders).toEqual(appliedInMemory.orders)
  expect(afterRetry.orderHistory).toEqual(appliedInMemory.orderHistory)
  expect(afterRetry.revision).toBe(appliedInMemory.revision)
  expect(afterRetry.products).toEqual(before.products)
  await page.reload()
  expect((await workflowSnapshot(page)).orderHistory).toEqual(
    appliedInMemory.orderHistory,
  )
})

test('el detalle conserva la gestión individual, exige confirmar entregas y muestra su historial', async ({
  page,
}) => {
  const references = await seedWorkflowOrders(page, 10)
  await page.goto(`/admin/pedidos/${references[0]}`)
  await identifyOperator(page)
  const status = page.getByRole('combobox', {
    name: 'Preparación del pedido',
    exact: true,
  })
  await status.selectOption('preparing')
  await page
    .getByRole('button', { name: 'Guardar estado', exact: true })
    .click()
  await expect
    .poll(async () => (await workflowSnapshot(page)).orderHistory.length)
    .toBe(1)
  expect((await workflowSnapshot(page)).orders[0].status).toBe('preparing')
  await status.selectOption('shipped')
  await page
    .getByRole('button', { name: 'Guardar estado', exact: true })
    .click()
  await page
    .locator('.admin-notice-dialog')
    .getByRole('button', { name: 'Cancelar', exact: true })
    .click()
  expect((await workflowSnapshot(page)).orders[0].status).toBe('preparing')
  await page
    .getByRole('button', { name: 'Guardar estado', exact: true })
    .click()
  await page
    .locator('.admin-notice-dialog')
    .getByRole('button', { name: 'Confirmar envío', exact: true })
    .click()
  await expect
    .poll(async () => (await workflowSnapshot(page)).orderHistory.length)
    .toBe(2)
  expect((await workflowSnapshot(page)).orders[0].status).toBe('shipped')
  await status.selectOption('delivered')
  await page
    .getByRole('button', { name: 'Guardar estado', exact: true })
    .click()
  await page
    .locator('.admin-notice-dialog')
    .getByRole('button', { name: 'Confirmar entrega', exact: true })
    .click()
  await expect
    .poll(async () => (await workflowSnapshot(page)).orderHistory.length)
    .toBe(3)
  const history = page.getByRole('region', {
    name: 'Historial y lotes del pedido',
    exact: true,
  })
  await expect(history).toContainText(workflowOperator.name)
  await expect(history).toContainText('Entregado')
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.screenshot({
    path: 'artifacts/order-workflow/detail-history-monitor.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true)
  await page.screenshot({
    path: 'artifacts/order-workflow/detail-history-mobile.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.reload()
  expect((await workflowSnapshot(page)).orderHistory).toHaveLength(3)
})

for (const viewport of workflowViewports) {
  test(`pedidos, acciones y lotes son legibles y operables a ${viewport.width} × ${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    })
    const references = await seedWorkflowOrders(page, 50, [
      { index: 1, status: 'preparing' },
      { index: 2, status: 'shipped' },
      { index: 3, status: 'delivered' },
      { index: 4, paymentStatus: 'pending' },
      { index: 5, incompleteDelivery: true },
    ])
    for (const reference of references.slice(0, 4))
      await selectOrder(page, reference)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await page.screenshot({
      path: `artifacts/order-workflow/orders-top-${viewport.name}.png`,
      animations: 'disabled',
    })
    await page.locator('.admin-order-selection-bar').scrollIntoViewIfNeeded()
    await page.screenshot({
      path: `artifacts/order-workflow/orders-${viewport.name}.png`,
      animations: 'disabled',
    })
    await page
      .getByRole('button', { name: 'Cambiar estado', exact: true })
      .click()
    const update = page.getByRole('dialog', {
      name: 'Actualizar 4 pedidos',
      exact: true,
    })
    await expect(update).toBeVisible()
    await identifyOperator(update)
    await update.getByLabel('Nuevo estado').selectOption('preparing')
    const bounds = await update.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.width).toBeLessThanOrEqual(viewport.width)
    await page.screenshot({
      path: `artifacts/order-workflow/update-${viewport.name}.png`,
      animations: 'disabled',
    })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Crear lote', exact: true }).click()
    const create = page.getByRole('dialog', {
      name: 'Crear lote de trabajo',
      exact: true,
    })
    await create.getByLabel('Nombre del lote').fill('Ronda Lima y Callao')
    await identifyOperator(create)
    await page.screenshot({
      path: `artifacts/order-workflow/create-batch-${viewport.name}.png`,
      animations: 'disabled',
    })
    await create
      .getByRole('button', { name: 'Crear lote', exact: true })
      .click()
    await expect(create).not.toBeVisible()
    await expect
      .poll(async () => (await workflowSnapshot(page)).orderBatches.length)
      .toBe(1)
    const batch = (await workflowSnapshot(page)).orderBatches[0]
    await page
      .getByRole('combobox', { name: 'Lote de trabajo', exact: true })
      .selectOption(batch.id)
    await page
      .getByRole('button', { name: 'Aplicar filtros', exact: true })
      .click()
    await expect(page.locator('.admin-table--orders tbody tr')).toHaveCount(4)
    await expect(
      page.getByRole('link', { name: /^Lotes de trabajo/ }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('region', { name: 'Lotes de trabajo', exact: true }),
    ).toHaveCount(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await page.screenshot({
      path: `artifacts/order-workflow/filtered-batch-${viewport.name}.png`,
      fullPage: true,
      animations: 'disabled',
    })
  })
}
