import { expect, test, type Page } from '@playwright/test'
import {
  getAdminErrorMessage,
  UserFacingError,
} from '../src/services/admin-messages'
import {
  persistedAdminState,
  importFile,
  importRecord,
  openImport,
} from './product-import-fixtures'
import { seedWorkflowOrders } from './order-workflow-fixtures'

const modal = (page: Page) => page.locator('.admin-notice-dialog')

test('La frontera de errores conserva explicaciones conocidas y nunca publica detalles internos', () => {
  const secret =
    'TypeError: db.secret_column token=abc /internal/saveProduct at line 123'
  for (const error of [
    new Error(secret),
    new TypeError(secret),
    { message: secret },
    secret,
    null,
  ]) {
    expect(getAdminErrorMessage(error).description).not.toContain(secret)
    expect(getAdminErrorMessage(error).description).toContain(
      'vuelve a intentarlo',
    )
  }
  expect(
    getAdminErrorMessage(
      new UserFacingError('image-format', 'Elige una imagen JPG.'),
      'image',
    ).description,
  ).toBe('Elige una imagen JPG.')
  expect(
    getAdminErrorMessage(
      new DOMException(secret, 'QuotaExceededError'),
      'storage',
    ).description,
  ).toContain('espacio suficiente')
  expect(
    getAdminErrorMessage({ code: '23505', message: secret }).description,
  ).toContain('Ya existe un registro')
  expect(
    getAdminErrorMessage({ code: '42501', message: secret }).description,
  ).toContain('no tiene permiso')
  expect(
    getAdminErrorMessage({ code: 'PGRST301', message: secret }).description,
  ).toContain('sesión ha vencido')
})

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`Confirmación compacta, teclado y cancelación segura a ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('/admin/productos')
    const trigger = page.getByRole('button', {
      name: 'Desactivar Bois Clair',
      exact: true,
    })
    await trigger.click()
    await expect(modal(page)).toHaveAttribute('role', 'alertdialog')
    await expect(
      modal(page).getByRole('button', { name: 'Mantener activo' }),
    ).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(
      modal(page).getByRole('button', { name: 'Desactivar producto' }),
    ).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(
      modal(page).getByRole('button', { name: 'Mantener activo' }),
    ).toBeFocused()
    await page.mouse.click(2, 2)
    await expect(modal(page)).toBeVisible()
    const box = await modal(page).boundingBox()
    expect(box!.width).toBeLessThanOrEqual(460)
    expect(box!.height).toBeLessThan(420)
    expect(box!.x).toBeGreaterThanOrEqual(16)
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `artifacts/admin-messages/confirmation-${viewport.width}.png`,
      animations: 'disabled',
    })
    await page.keyboard.press('Escape')
    await expect(modal(page)).toHaveCount(0)
    await expect(trigger).toBeFocused()
    expect(
      (await persistedAdminState(page)).products.find(
        (r) => r.product.id === 'cedre',
      )?.active,
    ).toBe(true)
    await trigger.click()
    await modal(page)
      .getByRole('button', { name: 'Desactivar producto' })
      .click()
    await expect(page.locator('.admin-toast')).toHaveText(
      /Bois Clair desactivado/,
    )
    expect(
      (await persistedAdminState(page)).products.find(
        (r) => r.product.id === 'cedre',
      )?.active,
    ).toBe(false)
  })
}

test('Validaciones de campos y duplicados indican cómo corregirlos sin guardar', async ({
  page,
}) => {
  await page.goto('/admin/productos/cedre')
  const before = await persistedAdminState(page)
  const name = page.getByLabel('Nombre', { exact: true })
  await name.fill('')
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect(name).toBeFocused()
  await expect(name).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('.admin-field-error').first()).toContainText(
    'Completa este campo',
  )
  await expect(modal(page)).toHaveCount(0)
  await name.fill('Bois Clair')
  await expect(name).not.toHaveAttribute('aria-invalid', 'true')
  const brand = page.getByLabel('Marca', { exact: true })
  await brand.selectOption('')
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect(brand).toHaveAccessibleName('Marca')
  await expect(brand).toHaveAttribute('aria-invalid', 'true')
  await brand.selectOption('atelier')
  await page.getByLabel('URL del producto', { exact: true }).fill('petale-nu')
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect(modal(page)).toContainText(/URL|slug|existe|duplicad/i)
  expect(await persistedAdminState(page)).toEqual(before)
  await modal(page).getByRole('button', { name: 'Volver a editar' }).click()
  await expect(
    page.getByLabel('URL del producto', { exact: true }),
  ).toHaveValue('petale-nu')
})

test('Un fallo inesperado de producto permite volver a editar y no expone datos técnicos', async ({
  page,
}) => {
  await page.goto('/admin/productos/cedre')
  await page.getByLabel('Nombre', { exact: true }).fill('Bois editado')
  const before = await persistedAdminState(page)
  await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    const original = adminService.saveProduct
    let failed = false
    adminService.saveProduct = (record) => {
      if (!failed) {
        failed = true
        throw new TypeError('SQL password=SECRET stack saveProduct')
      }
      return original(record)
    }
  })
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect(modal(page)).toContainText('No se pudieron guardar los cambios')
  await expect(modal(page)).not.toContainText(/SQL|SECRET|stack|TypeError/)
  await page.screenshot({
    path: 'artifacts/admin-messages/unexpected-save.png',
    animations: 'disabled',
  })
  expect(await persistedAdminState(page)).toEqual(before)
  await modal(page).getByRole('button', { name: 'Volver a editar' }).click()
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(
    'Bois editado',
  )
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect(page).toHaveURL(/\/admin\/productos\?guardado=1/)
  await expect(page.locator('.admin-toast')).toContainText('Producto guardado')
})

for (const file of [
  {
    name: 'invalido.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from('gif'),
    expected: /JPG, PNG, WebP o AVIF/,
  },
  {
    name: 'grande.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
    expected: /20 MB/,
  },
]) {
  test(`La foto ${file.name} muestra un error accionable y conserva la galería`, async ({
    page,
  }) => {
    await page.goto('/admin/productos/cedre')
    const before = await persistedAdminState(page)
    await page
      .getByLabel('Reemplazar foto principal del producto')
      .setInputFiles(file)
    await expect(modal(page)).toContainText(file.expected)
    await page.screenshot({
      path: `artifacts/admin-messages/image-${file.name}.png`,
      animations: 'disabled',
    })
    await modal(page).getByRole('button', { name: 'Entendido' }).click()
    expect(await persistedAdminState(page)).toEqual(before)
  })
}

test('Excel inválido abre un aviso y los errores de filas permanecen en su revisión', async ({
  page,
}) => {
  await openImport(page)
  const before = await persistedAdminState(page)
  await page.getByLabel('Archivo Excel .xlsx (máx. 5 MB)').setInputFiles({
    name: 'productos.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('invalid'),
  })
  await expect(modal(page)).toContainText('Selecciona un archivo Excel .xlsx')
  await page.screenshot({
    path: 'artifacts/admin-messages/excel-file.png',
    animations: 'disabled',
  })
  await page.keyboard.press('Escape')
  await page
    .getByLabel('Archivo Excel .xlsx (máx. 5 MB)')
    .setInputFiles(await importFile([importRecord({ precio_soles: '-1' })]))
  await page.getByRole('button', { name: 'Revisar filas y confirmar' }).click()
  await expect(
    page.getByRole('dialog', { name: /Vista previa/ }),
  ).toContainText(/precio|Precio/)
  await expect(modal(page)).toHaveCount(0)
  expect(await persistedAdminState(page)).toEqual(before)
})

test('Pedidos masivos muestran resultados parciales reales y permiten revisar solo los afectados', async ({
  page,
}) => {
  await seedWorkflowOrders(page, 10, [
    { index: 1, paymentStatus: 'pending' },
    { index: 2, status: 'delivered' },
  ])
  await page.getByLabel('Seleccionar pedidos de esta página').check()
  await page
    .getByRole('button', { name: 'Cambiar estado', exact: true })
    .click()
  const update = page.getByRole('dialog', {
    name: 'Actualizar 10 pedidos',
    exact: true,
  })
  await update.getByLabel('Responsable de los cambios').fill('Ana Operaciones')
  await update.getByLabel('Nuevo estado').selectOption('preparing')
  await update.getByRole('button', { name: 'Confirmar actualización' }).click()
  await expect(modal(page)).toContainText('8 de 10 pedidos actualizados')
  await expect(page.locator('dialog[open]')).toHaveCount(1)
  await page.screenshot({
    path: 'artifacts/admin-messages/orders-partial.png',
    animations: 'disabled',
  })
  await modal(page)
    .getByRole('button', { name: 'Ver pedidos que no se actualizaron' })
    .click()
  await expect(page.locator('.admin-work-order-table tbody tr')).toHaveCount(2)
  const state = await persistedAdminState(page)
  expect(
    state.orders.filter((order) => order.status === 'preparing'),
  ).toHaveLength(8)
  expect(state.orderHistory).toHaveLength(8)
})

test('Cancelar el borrado de datos y salir sin guardar no elimina registros', async ({
  page,
}) => {
  await page.goto('/admin')
  const before = await persistedAdminState(page)
  await page
    .getByRole('button', { name: 'Borrar datos de este navegador' })
    .click()
  await expect(modal(page)).toContainText(
    '¿Borrar los datos de este navegador?',
  )
  await expect(
    modal(page).getByRole('button', { name: 'Borrar datos', exact: true }),
  ).toHaveClass(/admin-notice-danger/)
  await modal(page)
    .getByRole('button', { name: 'Cancelar', exact: true })
    .click()
  expect(await persistedAdminState(page)).toEqual(before)
  await page.goto('/admin/productos/cedre')
  await page.getByLabel('Nombre', { exact: true }).fill('Cambio no guardado')
  await page.locator('.admin-back').click()
  await expect(modal(page)).toContainText('¿Salir sin guardar?')
  await modal(page).getByRole('button', { name: 'Seguir editando' }).click()
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(
    'Cambio no guardado',
  )
  await page.locator('.admin-back').click()
  await modal(page).getByRole('button', { name: 'Salir sin guardar' }).click()
  await expect(page).toHaveURL(/\/admin\/productos$/)
  expect(await persistedAdminState(page)).toEqual(before)
})

test('Revisar un resultado parcial incluye pedidos cuyo estado cambió fuera del filtro anterior', async ({
  page,
}) => {
  const references = await seedWorkflowOrders(page, 3)
  await page.getByLabel('Estado del pedido').selectOption('received')
  await page
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click()
  await page.getByLabel('Seleccionar pedidos de esta página').check()
  await page
    .getByRole('button', { name: 'Cambiar estado', exact: true })
    .click()
  const update = page.getByRole('dialog', {
    name: 'Actualizar 3 pedidos',
    exact: true,
  })
  await update.getByLabel('Responsable de los cambios').fill('Ana Operaciones')
  await page.evaluate(async (reference) => {
    const path = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    adminService.setOrderStatus(reference, 'preparing', {
      name: 'Otro administrador',
      verified: false,
      id: null,
    })
    await adminService.flush()
  }, references[0])
  await update.getByRole('button', { name: 'Confirmar actualización' }).click()
  await expect(modal(page)).toContainText('2 de 3 pedidos actualizados')
  await modal(page)
    .getByRole('button', { name: 'Ver pedidos que no se actualizaron' })
    .click()
  await expect(page.locator('.admin-work-order-table tbody tr')).toHaveCount(1)
  await expect(page.locator('.admin-work-order-table tbody tr')).toContainText(
    references[0],
  )
  await expect(page.locator('.admin-filter-result')).toContainText(
    'Solo pedidos no actualizados',
  )
  await page
    .getByRole('button', { name: 'Limpiar filtros', exact: true })
    .click()
  await expect(page.locator('.admin-work-order-table tbody tr')).toHaveCount(3)
})

test('Reintentos fallidos no acumulan modales y al cerrar el foco queda en una acción recuperable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin/marcas')
  await page.getByRole('button', { name: 'Nueva marca', exact: true }).click()
  await page.getByLabel('Nombre', { exact: true }).fill('Marca Recuperable')
  await page.evaluate(async () => {
    const path = '/src/services/admin-persistence.ts'
    const { localAdminStateRepository } = (await import(
      path
    )) as typeof import('../src/services/admin-persistence')
    const original = localAdminStateRepository.write
    localAdminStateRepository.write = async (snapshot) => {
      if (!(window as Window & { __allowSave?: boolean }).__allowSave)
        throw new DOMException('sensitive-secret-stack', 'QuotaExceededError')
      await original(snapshot)
    }
  })
  const before = await persistedAdminState(page)
  await page.getByRole('button', { name: 'Guardar marca', exact: true }).click()
  await expect(modal(page)).toContainText('espacio suficiente')
  await expect(modal(page)).not.toContainText('sensitive-secret-stack')
  await modal(page).getByRole('button', { name: 'Reintentar guardado' }).click()
  await expect(
    modal(page).getByRole('button', { name: 'Reintentar guardado' }),
  ).toBeEnabled()
  await expect(page.locator('dialog[open]')).toHaveCount(1)
  await page.screenshot({
    path: 'artifacts/admin-messages/storage-error-mobile.png',
    animations: 'disabled',
  })
  await modal(page).getByRole('button', { name: 'Revisar después' }).click()
  const retry = page
    .locator('.admin-save-feedback')
    .getByRole('button', { name: 'Reintentar guardado' })
  await expect(retry).toBeFocused()
  expect((await persistedAdminState(page)).revision).toBe(before.revision)
  await page.evaluate(() => {
    ;(window as Window & { __allowSave?: boolean }).__allowSave = true
  })
  await retry.click()
  await expect(page.locator('.admin-toast')).toContainText('Marca guardada')
  const after = await persistedAdminState(page)
  expect(after.revision).toBe(before.revision + 1)
  expect(
    after.brands.filter((brand) => brand.slug === 'marca-recuperable'),
  ).toHaveLength(1)
})

test('Un fallo inesperado de importación sustituye la ventana de revisión y permite retomarla intacta', async ({
  page,
}) => {
  await openImport(page)
  await page
    .getByLabel('Archivo Excel .xlsx (máx. 5 MB)')
    .setInputFiles(await importFile([importRecord()]))
  await page.getByRole('button', { name: 'Revisar filas y confirmar' }).click()
  const preview = page.getByRole('dialog', { name: /Vista previa/ })
  const before = await persistedAdminState(page)
  await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    const original = adminService.saveProductsBatch
    let failed = false
    adminService.saveProductsBatch = (records, revision) => {
      if (!failed) {
        failed = true
        throw new Error('INTERNAL SQL token=secret')
      }
      return original(records, revision)
    }
  })
  await preview
    .getByRole('button', {
      name: 'Confirmar e importar 1 producto',
      exact: true,
    })
    .click()
  await expect(modal(page)).toContainText(
    'No se pudieron importar los productos',
  )
  await expect(modal(page)).not.toContainText(/INTERNAL|SQL|token=/)
  await expect(page.locator('dialog[open]')).toHaveCount(1)
  await expect(preview).not.toBeVisible()
  expect(await persistedAdminState(page)).toEqual(before)
  await modal(page).getByRole('button', { name: 'Entendido' }).click()
  await expect(preview).toBeVisible()
  await expect(preview).toContainText('1 fila correcta')
  await preview
    .getByRole('button', {
      name: 'Confirmar e importar 1 producto',
      exact: true,
    })
    .click()
  await expect(modal(page)).toContainText('1 producto importado')
  await expect(page.locator('dialog[open]')).toHaveCount(1)
  await page.screenshot({
    path: 'artifacts/admin-messages/import-success.png',
    animations: 'disabled',
  })
  await modal(page).getByRole('button', { name: 'Cerrar', exact: true }).click()
  expect((await persistedAdminState(page)).products.length).toBe(
    before.products.length + 1,
  )
})

test('Un lote sin pedidos aptos explica el resultado sin anunciar éxito ni registrar cambios', async ({
  page,
}) => {
  await seedWorkflowOrders(
    page,
    3,
    [0, 1, 2].map((index) => ({ index, paymentStatus: 'pending' as const })),
  )
  const before = await persistedAdminState(page)
  await page.getByLabel('Seleccionar pedidos de esta página').check()
  await page
    .getByRole('button', { name: 'Cambiar estado', exact: true })
    .click()
  const update = page.getByRole('dialog', {
    name: 'Actualizar 3 pedidos',
    exact: true,
  })
  await update.getByLabel('Responsable de los cambios').fill('Ana Operaciones')
  await update.getByRole('button', { name: 'Confirmar actualización' }).click()
  await expect(modal(page)).toHaveAttribute('role', 'dialog')
  await expect(modal(page)).toContainText('0 de 3 pedidos actualizados')
  await expect(modal(page)).toContainText('3 con errores')
  await expect(page.locator('.admin-toast')).toHaveCount(0)
  await page.screenshot({
    path: 'artifacts/admin-messages/orders-information.png',
    animations: 'disabled',
  })
  await modal(page).getByRole('button', { name: 'Cerrar', exact: true }).click()
  expect((await persistedAdminState(page)).orders).toEqual(before.orders)
  expect((await persistedAdminState(page)).orderHistory).toEqual(
    before.orderHistory,
  )
})

test('Escape cierra una confirmación móvil sin cerrar el menú que la abrió', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin')
  await page.getByRole('button', { name: 'Abrir menú administrativo' }).click()
  await page
    .getByRole('button', { name: 'Borrar datos de este navegador' })
    .click()
  await expect(modal(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(modal(page)).toHaveCount(0)
  await expect(page.locator('#admin-navigation')).toHaveClass(/is-open/)
  await expect(
    page.getByRole('button', { name: 'Borrar datos de este navegador' }),
  ).toBeFocused()
  await page.locator('#admin-navigation')
    .getByRole('button', { name: 'Cerrar menú administrativo', exact: true })
    .click()
  await expect(page.locator('#admin-navigation')).not.toHaveClass(/is-open/)
})
