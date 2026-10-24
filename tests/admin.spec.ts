import { expect, test, type Page } from '@playwright/test'
import { answerAdminNotice } from './admin-notice-fixtures'
import {
  getInventoryAlerts,
  getProductInventory,
} from '../src/features/admin/admin-utils'
import { paginate } from '../src/features/admin/admin-pagination-utils'
import {
  adminService,
  type AdminProduct,
  type AdminPromotion,
  type AdminShippingSettings,
} from '../src/services/admin-service'
import {
  createMockOrder,
  createCheckoutDraft,
  evaluatePromotion,
  quoteShipping,
} from '../src/services/checkout-service'
import { resolveCart } from '../src/services/commerce-service'

test.afterEach(() => adminService.reset())

async function deactivateProduct(page: Page, name: string) {
  await page.getByRole('button', { name: `Desactivar ${name}` }).click()
  await expect(page.locator('.admin-notice-dialog')).toContainText(
    `¿Desactivar ${name}?`,
  )
  await answerAdminNotice(page, 'accept')
}

test('Una compra aprobada registra pedido, cliente, promoción y stock una sola vez', () => {
  expect(
    adminService.savePromotion({
      id: 'promo-aroma10',
      code: 'AROMA10',
      active: true,
      type: 'percent',
      value: 10,
      minimumCents: 0,
      startsAt: '',
      endsAt: '',
      usageLimit: null,
      used: 0,
    }).kind,
  ).toBe('saved')
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
    street: 'Avenida de prueba 123',
    reference: '',
  }
  draft.deliveryMethod = 'motorizado'
  draft.appliedPromotion = 'AROMA10'
  const order = createMockOrder(cart, draft)
  expect(order).not.toBeNull()

  expect(adminService.recordApprovedCheckout(order!).kind).toBe('saved')
  const afterCheckout = adminService.getSnapshot()
  expect(afterCheckout.orders[0]).toMatchObject({
    reference: order!.reference,
    status: 'received',
    paymentStatus: 'approved',
    promotionCode: 'AROMA10',
  })
  expect(
    afterCheckout.products
      .find((record) => record.product.id === 'cedre')
      ?.product.variants.find((variant) => variant.id === 'cedre-50')?.stock,
  ).toBe(4)
  expect(
    afterCheckout.promotions.find((promotion) => promotion.code === 'AROMA10')
      ?.used,
  ).toBe(1)
  expect(
    afterCheckout.customers.find(
      (customer) => customer.email === 'ana@ejemplo.invalid',
    ),
  ).toMatchObject({ name: 'Ana Prueba', phone: '912345678' })

  expect(adminService.recordApprovedCheckout(order!).kind).toBe('saved')
  expect(
    adminService
      .getSnapshot()
      .products.find((record) => record.product.id === 'cedre')
      ?.product.variants.find((variant) => variant.id === 'cedre-50')?.stock,
  ).toBe(4)
})

function cloneAdminProduct(record: AdminProduct): AdminProduct {
  return structuredClone(record)
}

test('La paginación administrativa normaliza límites y conserva rangos', () => {
  const items = Array.from({ length: 45 }, (_, index) => index + 1)

  expect(paginate(items, 2, 20)).toMatchObject({
    items: items.slice(20, 40),
    page: 2,
    pageSize: 20,
    totalItems: 45,
    totalPages: 3,
    from: 21,
    to: 40,
  })
  expect(paginate(items, 99, 20)).toMatchObject({
    page: 3,
    from: 41,
    to: 45,
  })
  expect(paginate([], Number.NaN, 0)).toMatchObject({
    page: 1,
    pageSize: 1,
    totalItems: 0,
    totalPages: 1,
    from: 0,
    to: 0,
  })
  expect(paginate(items, -4, Number.POSITIVE_INFINITY)).toMatchObject({
    page: 1,
    pageSize: 1,
    from: 1,
    to: 1,
  })
})

test('La configuración en memoria alimenta promociones y envíos de tienda', () => {
  expect(
    adminService.savePromotion({
      id: 'promo-test',
      code: 'ELEGANTE15',
      active: true,
      type: 'percent',
      value: 15,
      minimumCents: 30000,
      startsAt: '',
      endsAt: '',
      usageLimit: null,
      used: 0,
    }).kind,
  ).toBe('saved')
  expect(evaluatePromotion('elegante15', 40000)).toMatchObject({
    kind: 'applied',
    discountCents: 6000,
  })

  const shipping = adminService.getSnapshot().shipping
  adminService.saveShipping({ ...shipping, freeThresholdCents: 40000 })
  expect(
    quoteShipping('lima', 'courier', 40000, '1501', '150122'),
  ).toMatchObject({
    kind: 'quoted',
    feeCents: 0,
    free: true,
  })
})

test('La portada muestra el umbral de envío configurado y lo oculta en otras páginas', async ({
  page,
}) => {
  await page.goto('/admin/envios')
  await page.getByLabel('Envío gratis desde (S/)').fill('400')
  await page.getByRole('button', { name: 'Guardar configuración' }).click()
  await page.getByRole('link', { name: 'Ver tienda' }).click()
  await expect(page.locator('.trust-section')).toContainText(
    'Consulta las opciones disponibles',
  )
  await expect(page.locator('.announcement')).toContainText(
    /Envíos en Lima y Callao.*Gratis desde S\/\s*400/,
  )
  await page.getByRole('link', { name: 'Envíos y entregas' }).click()
  await expect(page.locator('.announcement')).toHaveCount(0)
  await expect(page.locator('.institutional-page')).toContainText(
    'Consultar entrega',
  )
})

test('El administrador edita la franja del Home y el importe sigue la tarifa de envío', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin/home')
  await page.getByRole('button', { name: 'Franja superior' }).click()
  const delivery = page.getByRole('textbox', { name: 'Mensaje de entrega' })
  const freeShipping = page.getByRole('textbox', {
    name: 'Texto antes del importe de envío gratis',
  })
  await page.getByRole('button', { name: 'Abrir vista previa' }).click()
  await expect(page.locator('.admin-home-announcement-preview')).toContainText(
    'Envíos en Lima y Callao',
  )
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click()
  await delivery.fill('Entregamos en todo Lima')
  await freeShipping.fill('Sin costo desde')
  await page.getByRole('button', { name: 'Abrir vista previa' }).click()
  await expect(page.locator('.admin-home-announcement-preview')).toContainText(
    /Entregamos en todo Lima.*Sin costo desde S\/\s*450/,
  )
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click()
  await page.getByRole('button', { name: 'Guardar cambios del Home' }).click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Cambios guardados' }),
  ).toBeVisible()
  await page.goto('/')
  await expect(page.locator('.announcement')).toContainText(
    /Entregamos en todo Lima.*Sin costo desde S\/\s*450/,
  )
  await page.reload()
  await expect(page.locator('.announcement')).toContainText(
    'Entregamos en todo Lima',
  )
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
})

test('Promociones rechaza importes, usos y fechas no válidos', () => {
  const valid: AdminPromotion = {
    id: 'promo-validation',
    code: 'VALIDA20',
    active: true,
    type: 'percent',
    value: 20,
    minimumCents: 10000,
    startsAt: '2026-09-21T10:00',
    endsAt: '2026-09-22T10:00',
    usageLimit: 20,
    used: 0,
  }
  const invalid: AdminPromotion[] = [
    { ...valid, value: Number.NaN },
    { ...valid, value: Number.POSITIVE_INFINITY },
    { ...valid, minimumCents: -1 },
    { ...valid, minimumCents: 1.5 },
    { ...valid, usageLimit: 0 },
    { ...valid, usageLimit: 1.5 },
    { ...valid, used: Number.NaN },
    { ...valid, startsAt: 'fecha-inválida' },
    {
      ...valid,
      startsAt: '2026-09-23T10:00',
      endsAt: '2026-09-22T10:00',
    },
  ]

  for (const promotion of invalid) {
    expect(adminService.savePromotion(promotion)).toMatchObject({
      kind: 'validation',
    })
  }
})

test('Envíos rechaza umbrales, tarifas y plazos no válidos', () => {
  const valid = structuredClone(
    adminService.getSnapshot().shipping,
  ) satisfies AdminShippingSettings
  const invalid: AdminShippingSettings[] = []

  for (const threshold of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    invalid.push({ ...structuredClone(valid), freeThresholdCents: threshold })
  }
  for (const fee of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    invalid.push({ ...structuredClone(valid), nationalCourierFeeCents: fee })
  }
  invalid.push({ ...structuredClone(valid), nationalEstimate: '   ' })
  for (const fee of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const shipping = structuredClone(valid)
    shipping.zones[0].courierFeeCents = fee
    invalid.push(shipping)
  }
  const invalidMotorized = structuredClone(valid)
  invalidMotorized.zones[0].motorizadoFeeCents = Number.NaN
  invalid.push(invalidMotorized)
  const missingEstimate = structuredClone(valid)
  missingEstimate.zones[0].estimate = '   '
  invalid.push(missingEstimate)
  const missingName = structuredClone(valid)
  missingName.zones[0].name = '   '
  invalid.push(missingName)
  const missingDepartment = structuredClone(valid)
  missingDepartment.zones[0].department = '   '
  invalid.push(missingDepartment)
  const duplicateDepartment = structuredClone(valid)
  duplicateDepartment.zones.push({
    ...duplicateDepartment.zones[0],
    id: 'zone-duplicate-coverage',
  })
  invalid.push(duplicateDepartment)
  const duplicateId = structuredClone(valid)
  duplicateId.zones.push({
    ...duplicateId.zones[0],
    district: '150122',
  })
  invalid.push(duplicateId)

  for (const shipping of invalid) {
    expect(adminService.saveShipping(shipping)).toMatchObject({
      kind: 'validation',
    })
  }
})

test('Una tarifa distrital se aplica y una zona histórica fuera de Lima y Callao no cotiza', () => {
  const shipping = structuredClone(
    adminService.getSnapshot().shipping,
  ) satisfies AdminShippingSettings
  shipping.zones.push({
    id: 'zone-miraflores-test',
    name: 'Miraflores',
    department: 'lima',
    province: '1501',
    district: '150122',
    courierFeeCents: 4200,
    motorizadoFeeCents: null,
    estimate: 'Hasta 5 días',
    active: true,
  })

  shipping.zones.push({
    id: 'zone-cusco-historical',
    name: 'Cusco',
    department: 'cusco',
    province: null,
    district: null,
    courierFeeCents: 4200,
    motorizadoFeeCents: null,
    estimate: 'Hasta 5 días',
    active: true,
  })

  expect(adminService.saveShipping(shipping)).toMatchObject({ kind: 'saved' })
  expect(
    quoteShipping('lima', 'courier', 30000, '1501', '150122'),
  ).toMatchObject({
    kind: 'quoted',
    feeCents: 4200,
    estimate: 'Hasta 5 días',
  })
  expect(quoteShipping('cusco', 'courier', 30000, '0801', '080101').kind).toBe(
    'unavailable',
  )
})

test('Las tarifas base de Lima y Callao se aplican de forma independiente', () => {
  const shipping = structuredClone(adminService.getSnapshot().shipping)
  shipping.nationalCourierFeeCents = 3800
  shipping.nationalEstimate = 'De 3 a 6 días'
  shipping.zones.find((zone) => zone.id === 'zone-lima')!.active = false
  expect(adminService.saveShipping(shipping)).toMatchObject({ kind: 'saved' })
  expect(
    quoteShipping('lima', 'courier', 30000, '1501', '150122'),
  ).toMatchObject({
    kind: 'quoted',
    feeCents: 3800,
    estimate: 'De 3 a 6 días',
  })
  expect(
    quoteShipping('callao', 'courier', 30000, '0701', '070101'),
  ).toMatchObject({
    kind: 'quoted',
    feeCents: 2000,
    estimate: 'Hasta 48 horas',
  })
})

test('El panel permite preparar una tarifa distrital sin publicarla por accidente', async ({
  page,
}) => {
  await page.goto('/admin/envios')
  await expect(
    page.getByRole('heading', { name: 'Lima', exact: true }),
  ).toBeVisible()
  const previousZones = await page.locator('.admin-shipping-row').count()

  await page
    .getByRole('button', { name: 'Agregar tarifa por distrito' })
    .click()
  const newZone = page.locator('.admin-shipping-editor')
  await expect(page.locator('.admin-shipping-row')).toHaveCount(
    previousZones + 1,
  )
  await expect(newZone.getByLabel('Distrito')).toHaveValue('150101')
  await expect(newZone.getByLabel('Nombre visible de la tarifa')).toHaveValue(
    'Lima',
  )
  await expect(newZone.getByLabel('Tarifa especial activa')).not.toBeChecked()

  await newZone.getByLabel('Distrito').selectOption('150122')
  await newZone.getByLabel('Nombre visible de la tarifa').fill('Miraflores')
  await newZone.getByLabel('Courier (S/)').fill('42')
  await newZone.getByLabel('Tarifa especial activa').check()
  await page.getByRole('button', { name: 'Guardar configuración' }).click()
  await expect(
    page.getByText('Configuración aplicada a la tienda'),
  ).toBeVisible()

  await newZone.getByRole('button', { name: 'Quitar tarifa especial' }).click()
  await expect(page.locator('.admin-shipping-row')).toHaveCount(previousZones)
})

test('El panel de envíos ofrece distritos de Lima y Callao para tarifas especiales', async ({
  page,
}) => {
  await page.goto('/admin/envios')
  await page
    .getByRole('button', { name: 'Agregar tarifa por distrito' })
    .click()
  const editor = page.locator('.admin-shipping-editor')
  const district = editor.getByLabel('Distrito')

  await expect(editor.getByLabel('Departamento')).toHaveCount(0)
  await expect(editor.getByLabel('Provincia')).toHaveCount(0)
  await expect(district.locator('option')).toHaveCount(43)
  await expect(district.locator('option[value="150122"]')).toHaveText(
    'Miraflores',
  )
  await editor.getByLabel('Zona').selectOption('callao')
  await expect(district.locator('option')).toHaveCount(7)
  await expect(district.locator('option[value="070101"]')).toHaveText('Callao')
  await expect(district.locator('option[value="150122"]')).toHaveCount(0)
})

test('Las tarifas base de Lima y Callao se editan por separado y persisten', async ({
  page,
}) => {
  await page.goto('/admin/envios')
  await page.getByLabel('Courier en Lima (S/)').fill('38')
  await page.getByLabel('Plazo estimado en Lima').fill('De 3 a 6 días')
  await page.getByLabel('Courier en Callao (S/)').fill('28')
  await page.getByLabel('Plazo estimado en Callao').fill('De 1 a 2 días')
  await page.getByRole('button', { name: 'Guardar configuración' }).click()
  await expect(
    page.getByText('Configuración aplicada a la tienda.'),
  ).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Courier en Lima (S/)')).toHaveValue('38')
  await expect(page.getByLabel('Plazo estimado en Lima')).toHaveValue(
    'De 3 a 6 días',
  )
  await expect(page.getByLabel('Courier en Callao (S/)')).toHaveValue('28')
  await expect(page.getByLabel('Plazo estimado en Callao')).toHaveValue(
    'De 1 a 2 días',
  )
})

test('Una configuración antigua conserva su tarifa de Lima al migrar', async ({
  page,
}) => {
  await page.goto('/admin/envios')
  await page.getByRole('button', { name: 'Guardar configuración' }).click()
  await expect(
    page.getByText('Configuración aplicada a la tienda.'),
  ).toBeVisible()
  await page.evaluate(async () => {
    const request = indexedDB.open('aroma-infini-admin', 1)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('snapshot', 'readwrite')
      const store = transaction.objectStore('snapshot')
      const get = store.get('current')
      get.onsuccess = () => {
        const snapshot = get.result
        snapshot.shipping = {
          freeThresholdCents: 45000,
          zones: snapshot.shipping.zones,
        }
        store.put(snapshot, 'current')
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    db.close()
  })
  await page.reload()
  await expect(page.getByLabel('Courier en Lima (S/)')).toHaveValue('20')
  await expect(page.locator('.admin-shipping-row')).toHaveCount(0)
})

test('Desactivar un producto conserva sus datos y retira su visibilidad', () => {
  const product = adminService
    .getSnapshot()
    .products.find((record) => record.product.id === 'sillage')
  expect(product).toBeDefined()
  if (!product) return
  expect(adminService.saveProduct({ ...product, active: false }).kind).toBe(
    'saved',
  )
  const saved = adminService
    .getSnapshot()
    .products.find((record) => record.product.id === 'sillage')
  expect(saved?.active).toBe(false)
  expect(saved?.product.variants).toEqual(product.product.variants)
  expect(saved).not.toHaveProperty('featured')
})

test('Un borrador manual puede guardarse sin foto, pero no publicarse así', () => {
  const stored = adminService
    .getSnapshot()
    .products.find((record) => record.product.id === 'cedre')
  expect(stored).toBeDefined()
  if (!stored) return
  const draft = cloneAdminProduct(stored)
  draft.active = false
  draft.product.id = 'draft-without-photo'
  draft.product.slug = 'borrador-sin-foto'
  draft.product.name = 'Borrador sin foto'
  draft.product.image = ''
  draft.product.variants = draft.product.variants.map((variant) => ({
    ...variant,
    id: `draft-${variant.ml}`,
  }))
  draft.detail.gallery = []
  draft.detail.recommendationIds = []

  expect(adminService.saveProduct(draft).kind).toBe('saved')
  expect(
    adminService
      .getSnapshot()
      .products.find((record) => record.product.id === draft.product.id)
      ?.active,
  ).toBe(false)
  const publish = adminService.saveProduct({ ...draft, active: true })
  expect(publish.kind).toBe('validation')
  expect(
    adminService
      .getSnapshot()
      .products.find((record) => record.product.id === draft.product.id)
      ?.active,
  ).toBe(false)
})

test('El inventario clasifica cada presentación activa y excluye las inactivas', () => {
  const stored = adminService
    .getSnapshot()
    .products.find((record) => record.product.id === 'cedre')
  expect(stored).toBeDefined()
  if (!stored) return

  const record = cloneAdminProduct(stored)
  record.lowStockThreshold = 2
  record.product.variants = [
    { id: 'agotada', ml: 30, priceCents: 10000, stock: 0, active: true },
    { id: 'baja', ml: 50, priceCents: 20000, stock: 2, active: true },
    { id: 'sana', ml: 75, priceCents: 30000, stock: 5, active: true },
    { id: 'inactiva', ml: 100, priceCents: 40000, stock: 0, active: false },
  ]

  const inventory = getProductInventory(record)
  expect(inventory.totalStock).toBe(7)
  expect(inventory.variants.map((variant) => variant.variantId)).toEqual([
    'agotada',
    'baja',
    'sana',
  ])
  expect(inventory.alerts.map((variant) => variant.label)).toEqual([
    'Agotado',
    'Stock bajo',
  ])
  expect(
    getInventoryAlerts([record]).map((variant) => variant.variantId),
  ).toEqual(['agotada', 'baja'])
})

test('El servicio rechaza stock, umbral e identificadores de variante inválidos', () => {
  const stored = adminService
    .getSnapshot()
    .products.find((record) => record.product.id === 'cedre')
  expect(stored).toBeDefined()
  if (!stored) return

  const invalidRecords: AdminProduct[] = []
  for (const stock of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const record = cloneAdminProduct(stored)
    record.product.variants[0].stock = stock
    invalidRecords.push(record)
  }
  for (const threshold of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    const record = cloneAdminProduct(stored)
    record.lowStockThreshold = threshold
    invalidRecords.push(record)
  }
  const duplicateId = cloneAdminProduct(stored)
  duplicateId.product.variants[1].id = duplicateId.product.variants[0].id
  invalidRecords.push(duplicateId)

  for (const record of invalidRecords) {
    expect(adminService.saveProduct(record)).toMatchObject({
      kind: 'validation',
    })
  }
})

test('El panel declara sus límites y permite recorrer cada módulo', async ({
  page,
}) => {
  await page.goto('/admin')
  await expect(
    page.getByText('Los cambios de este panel se guardan en este navegador.'),
  ).toBeVisible()
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Categorías' })).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Resumen del negocio',
  )
  await expect(
    page.getByText('Pedidos por preparar', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Unidades disponibles', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Alertas de stock', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Envíos en curso', { exact: true })).toBeVisible()

  const modules = [
    ['/admin/productos', 'Productos'],
    ['/admin/marcas', 'Marcas'],
    ['/admin/pedidos', 'Pedidos'],
    ['/admin/clientes', 'Clientes'],
    ['/admin/promociones', 'Promociones'],
    ['/admin/envios', 'Tarifas de envío'],
    ['/admin/home', 'Home'],
  ] as const
  for (const [path, title] of modules) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex,nofollow',
    )
  }
})

test('El dashboard resume inventario y flujo de pedidos con enlaces operativos', async ({
  page,
}) => {
  await page.goto('/admin')

  const metrics = page.getByRole('region', { name: 'Indicadores operativos' })
  await expect(
    metrics.getByText('Pedidos por preparar', { exact: true }),
  ).toBeVisible()
  await expect(
    metrics.getByText('Unidades disponibles', { exact: true }),
  ).toBeVisible()
  await expect(
    metrics.getByText('Alertas de stock', { exact: true }),
  ).toBeVisible()
  await expect(
    metrics.getByText('Envíos en curso', { exact: true }),
  ).toBeVisible()

  const flow = page.locator('.admin-order-overview')
  await expect(flow.getByText('Nuevos', { exact: true })).toBeVisible()
  await expect(flow.getByText('En preparación', { exact: true })).toBeVisible()
  await expect(flow.getByText('Enviados', { exact: true })).toBeVisible()
  await expect(flow.getByText('Entregados', { exact: true })).toBeVisible()
  await expect(
    flow.getByText('Nuevos').locator('..').getByRole('link'),
  ).toHaveAttribute('href', '/admin/pedidos?preparacion=received')
  await expect(
    flow.getByText('En preparación').locator('..').getByRole('link'),
  ).toHaveAttribute('href', '/admin/pedidos?preparacion=preparing')
  await expect(
    flow.getByText('Entregados').locator('..').getByRole('link'),
  ).toHaveAttribute('href', '/admin/pedidos?preparacion=delivered')

  const inventory = page.locator('.admin-inventory-alerts')
  await expect(inventory.getByText('Inventario por reponer')).toBeVisible()
  await expect(
    inventory.getByText('Agotado', { exact: true }).first(),
  ).toBeVisible()
  await expect(inventory.getByText('2 unidades', { exact: true })).toBeVisible()

  await metrics
    .getByRole('link', { name: 'Envíos en curso: ver detalle' })
    .click()
  await expect(page).toHaveURL('/admin/pedidos?preparacion=shipped')
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(1)
  await expect(page.getByText('Cliente 01')).toBeVisible()
})

test('Los datos de pedidos recientes conservan separación en tablet y escritorio', async ({
  page,
}) => {
  for (const width of [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/admin')

    const row = page
      .locator('.admin-recent-orders li')
      .filter({ hasText: 'AI-200926-01' })

    const gaps = await row.evaluate((element) => {
      const selectors = [
        ':scope > div',
        '.admin-order-date',
        '.admin-order-preparation',
        '.admin-order-payment',
        '.admin-order-total',
        ':scope > a',
      ]
      const rectangles = selectors.map((selector) => {
        const target = element.querySelector(selector)
        if (!(target instanceof HTMLElement)) return null
        const rectangle = target.getBoundingClientRect()
        return { left: rectangle.left, right: rectangle.right }
      })

      return rectangles.slice(0, -1).map((rectangle, index) => {
        const nextRectangle = rectangles[index + 1]
        return rectangle && nextRectangle
          ? nextRectangle.left - rectangle.right
          : -1
      })
    })

    for (const gap of gaps) {
      expect(gap, `Separación horizontal a ${width}px`).toBeGreaterThanOrEqual(
        8,
      )
    }
  }
})

test('Desactivar un producto lo retira de la tienda durante la misma sesión', async ({
  page,
}) => {
  await page.goto('/admin/productos?guardado=1')
  await expect(page.getByText('Producto guardado.')).toHaveCount(0)
  await page.getByRole('button', { name: 'Desactivar Bois Clair' }).click()
  await answerAdminNotice(page, 'dismiss')
  await expect(
    page.getByRole('button', { name: 'Desactivar Bois Clair' }),
  ).toBeVisible()
  await deactivateProduct(page, 'Bois Clair')
  await expect(page.getByText('Producto guardado.')).toHaveCount(0)
  await expect(page.getByText('Bois Clair desactivado.')).toBeVisible()
  const row = page
    .locator('.admin-table tbody tr')
    .filter({ hasText: 'Bois Clair' })
  await expect(row.getByText('Inactivo', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Ver tienda' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Bois Clair' })).toHaveCount(0)
})

test('Editar stock desactiva el producto agotado y lo retira de la tienda', async ({
  page,
}) => {
  await page.goto('/admin/productos/cedre')
  const stock50 = page.getByLabel('Stock de presentación 50 ml')
  const stock100 = page.getByLabel('Stock de presentación 100 ml')
  await expect(stock50).toHaveValue('5')
  await expect(stock100).toHaveValue('3')
  await stock50.fill('0')
  await stock100.fill('0')
  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page).toHaveURL(/\/admin\/productos\?guardado=1$/)
  const row = page
    .locator('.admin-table tbody tr')
    .filter({ hasText: 'Bois Clair' })
  await expect(row.getByText('Inactivo', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Ver tienda' }).click()
  const card = page
    .locator('.bestsellers-section .product-card')
    .filter({ hasText: 'Bois Clair' })
  await expect(card).toHaveCount(0)
  await page.goto('/tienda?q=Bois+Clair')
  await expect(page.locator('.product-card')).toHaveCount(0)
})

test('El editor conserva comas al escribir notas y guarda la lista normalizada', async ({
  page,
}) => {
  await page.goto('/admin/productos/cedre')
  const notes = page.getByLabel('Notas de salida')
  const initialValue = await notes.inputValue()
  const expectedValue = `${initialValue}, Mandarina`

  await notes.press('End')
  await notes.type(', Mandarina')
  await expect(notes).toHaveValue(expectedValue)

  await page.getByLabel('Notas de corazón').focus()
  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page).toHaveURL(/\/admin\/productos\?guardado=1$/)

  await page.getByRole('link', { name: 'Editar Bois Clair' }).click()
  await expect(page.getByLabel('Notas de salida')).toHaveValue(expectedValue)
})

test('El editor explica el umbral y actualiza la alerta por presentación', async ({
  page,
}) => {
  await page.goto('/admin/productos/cedre')

  const threshold = page.getByLabel('Alerta por presentación desde')
  await expect(threshold).toHaveAttribute(
    'aria-describedby',
    'admin-low-stock-help',
  )
  await expect(page.locator('#admin-low-stock-help')).toContainText(
    'cualquier presentación',
  )
  await threshold.fill('5')
  await expect(
    page.locator('.admin-variant-status').filter({ hasText: '50 ml' }),
  ).toContainText('Stock bajo')
  await expect(
    page.locator('.admin-variant-status').filter({ hasText: '100 ml' }),
  ).toContainText('Stock bajo')

  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page).toHaveURL(/\/admin\/productos\?guardado=1$/)
  const row = page
    .locator('.admin-table tbody tr')
    .filter({ hasText: 'Bois Clair' })
  await expect(row).toContainText('Stock bajo')
})

test('Productos combina búsqueda, inventario y visibilidad en la URL', async ({
  page,
}) => {
  await page.goto('/admin/productos')

  await deactivateProduct(page, 'Bois Clair')
  await page.getByRole('searchbox', { name: 'Buscar' }).fill('Bois')
  await page.getByLabel('Estado de stock').selectOption('healthy')
  await page.getByLabel('Visibilidad').selectOption('inactive')
  await page.getByRole('button', { name: 'Aplicar' }).click()

  await expect(page).toHaveURL(
    '/admin/productos?q=Bois&stock=healthy&visibilidad=inactive',
  )
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(1)
  await expect(page.locator('.admin-table tbody tr')).toContainText(
    'Bois Clair',
  )
  await expect(page.getByText('1 producto', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Limpiar filtros' }).click()
  await expect(page).toHaveURL('/admin/productos')
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(12)
  await expect(page.locator('.admin-pagination')).toContainText(
    'Mostrando 1–12 de 16 productos',
  )
})

test('Los filtros de inventario distinguen alertas, agotados y productos sanos', async ({
  page,
}) => {
  await page.goto('/admin/productos?stock=alert')
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(2)
  await expect(page.locator('.admin-table')).toContainText('Pétale Nu')
  await expect(page.locator('.admin-table')).toContainText('Ambre Lent')

  await page.getByLabel('Estado de stock').selectOption('out')
  await page.getByRole('button', { name: 'Aplicar' }).click()
  await expect(page).toHaveURL('/admin/productos?stock=out')
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(1)
  await expect(page.locator('.admin-table tbody tr')).toContainText(
    'Ambre Lent',
  )
  await expect(page.locator('.admin-table tbody tr')).toContainText('Inactivo')

  await page.getByLabel('Estado de stock').selectOption('healthy')
  await page.getByRole('button', { name: 'Aplicar' }).click()
  await expect(page).toHaveURL('/admin/productos?stock=healthy')
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(12)
  await expect(page.locator('.admin-pagination')).toContainText(
    'Mostrando 1–12 de 14 productos',
  )
  await expect(page.locator('.admin-table')).toContainText('Bois Clair')
  await page
    .getByRole('navigation', { name: 'Paginación de productos' })
    .getByRole('button', { name: 'Siguiente' })
    .click()
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(2)
  await expect(page.locator('.admin-table')).toContainText('Vert Silence')
})

test('El editor advierte antes de descartar cambios sin guardar', async ({
  page,
}) => {
  await page.goto('/admin/productos/cedre')
  await page.getByLabel('Nombre').fill('Bois editado')
  await page.locator('.admin-back').click()
  await expect(page.locator('.admin-notice-dialog')).toContainText(
    '¿Salir sin guardar?',
  )
  await answerAdminNotice(page, 'dismiss')
  await expect(page).toHaveURL(/\/admin\/productos\/cedre$/)

  await page.locator('.admin-back').click()
  await answerAdminNotice(page, 'accept')
  await expect(page).toHaveURL(/\/admin\/productos$/)
})

test('El editor del Home conserva el recomendador sin la selección retirada', async ({
  page,
}) => {
  await page.goto('/admin/home')
  await expect(
    page.getByRole('button', { name: 'Destacados', exact: true }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Encuentra tu perfume ideal' }),
  ).toBeVisible()
  await page.goto('/tienda?seleccion=destacados')
  await expect(page).toHaveURL('/tienda')
  await expect(page.locator('.product-card')).toHaveCount(12)
})

test('El detalle separa pago y preparación y permite actualizar el pedido', async ({
  page,
}) => {
  await page.goto('/admin/pedidos?q=AI-210926-01')
  await page.getByRole('link', { name: /Ver AI-210926-01/ }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Detalle del pedido',
  )
  await expect(
    page
      .getByRole('region', { name: 'Pago' })
      .getByText('Pagado', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('combobox', { name: 'Pago', exact: true }),
  ).toHaveCount(0)

  await page.getByLabel('Responsable de los cambios').fill('Ana Operaciones')
  await page
    .getByRole('combobox', { name: /Preparación del pedido/ })
    .selectOption('preparing')
  await page.getByRole('button', { name: 'Guardar estado' }).click()
  await expect(page.getByText(/Estado actualizado/)).toBeVisible()
  await expect(
    page.getByText('En preparación', { exact: true }).first(),
  ).toBeVisible()
})

test('Pedidos combina búsqueda y preparación y permite limpiar filtros', async ({
  page,
}) => {
  await page.goto('/admin/pedidos')
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(4)

  await page.getByRole('searchbox', { name: 'Buscar' }).fill('Cliente 02')
  await page.getByLabel('Estado del pedido').selectOption('received')
  await page.getByRole('button', { name: 'Aplicar' }).click()

  await expect(page).toHaveURL(
    '/admin/pedidos?q=Cliente+02&preparacion=received',
  )
  const rows = page.locator('.admin-table tbody tr')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText('Cliente 02')
  await expect(rows.first()).toContainText('Pagado')
  await expect(rows.first()).toContainText('Nuevo')
  await expect(page.getByText('1 pedido', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Limpiar filtros' }).click()
  await expect(page).toHaveURL('/admin/pedidos')
  await expect(rows).toHaveCount(4)
})

test('Los accesos del flujo filtran nuevos, entregados y enviados', async ({
  page,
}) => {
  await page.goto('/admin/pedidos?preparacion=received')
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(1)
  await expect(page.getByText('1 pedido', { exact: true })).toBeVisible()

  await page.getByLabel('Estado del pedido').selectOption('delivered')
  await page.getByRole('button', { name: 'Aplicar' }).click()
  await expect(page).toHaveURL('/admin/pedidos?preparacion=delivered')
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(1)

  await page.getByLabel('Estado del pedido').selectOption('shipped')
  await page.getByRole('button', { name: 'Aplicar' }).click()
  await expect(page).toHaveURL('/admin/pedidos?preparacion=shipped')
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(1)
  await expect(page.locator('.admin-table tbody tr')).toContainText('Enviado')
})

test('La acción rápida prepara un pedido y exige datos de entrega antes de enviarlo', async ({
  page,
}) => {
  await page.goto('/admin/pedidos?q=AI-210926-01')
  const row = page.locator('.admin-table tbody tr')
  await expect(row).toContainText('Nuevo')
  await page.getByRole('button', { name: 'Preparar AI-210926-01' }).click()
  await page
    .getByRole('dialog', {
      name: 'Actualizar pedido AI-210926-01',
      exact: true,
    })
    .getByLabel('Responsable de los cambios')
    .fill('Ana Operaciones')
  await page
    .getByRole('dialog', {
      name: 'Actualizar pedido AI-210926-01',
      exact: true,
    })
    .getByRole('button', { name: 'Confirmar actualización', exact: true })
    .click()
  await expect(row).toContainText('En preparación')
  await expect(
    page.getByRole('button', { name: 'Enviar AI-210926-01' }),
  ).toHaveCount(0)
  await expect(row).toContainText('Datos de entrega pendientes')
})

test('Las validaciones evitan desactivar marcas con productos visibles', async ({
  page,
}) => {
  await page.goto('/admin/marcas')
  await page.getByRole('button', { name: 'Desactivar Atelier 01' }).click()
  await answerAdminNotice(page, 'accept')
  await expect(
    page.getByText('Desactiva primero los productos visibles de esta marca.'),
  ).toBeVisible()
})

test('El menú administrativo móvil prioriza la tarea y conserva navegación clara', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin/productos')

  const menu = page.locator('.admin-menu-toggle')
  const navigation = page.locator('#admin-navigation')
  await expect(menu).toBeVisible()
  await expect(menu).toHaveAccessibleName('Abrir menú administrativo')
  await expect(menu).toHaveAttribute('aria-expanded', 'false')
  await expect(navigation).toBeHidden()
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport()

  const menuBox = await menu.boundingBox()
  expect(menuBox?.width).toBeGreaterThanOrEqual(44)
  expect(menuBox?.height).toBeGreaterThanOrEqual(44)

  await menu.click()
  await expect(menu).toHaveAttribute('aria-expanded', 'true')
  await expect(menu).toHaveAccessibleName('Cerrar menú administrativo')
  await expect(navigation).toBeVisible()
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden')
  await expect(
    navigation.getByRole('button', { name: 'Cerrar menú administrativo' }),
  ).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(navigation).toBeHidden()
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
  await expect(menu).toBeFocused()

  await menu.click()
  await navigation.getByRole('link', { name: /Promociones/ }).click()
  await expect(page).toHaveURL(/\/admin\/promociones$/)
  await expect(navigation).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Promociones' })).toBeVisible()
})

test('Limpiar una búsqueda administrativa vacía también el campo y la URL', async ({
  page,
}) => {
  await page.goto('/admin/productos?q=sin-coincidencias')
  const search = page.getByRole('searchbox', {
    name: 'Buscar producto o marca',
  })

  await expect(search).toHaveValue('sin-coincidencias')
  await expect(
    page.getByRole('heading', { name: 'No encontramos productos' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Limpiar filtros' }).click()

  await expect(page).toHaveURL('/admin/productos')
  await expect(search).toHaveValue('')
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(12)
  await expect(page.locator('.admin-pagination')).toContainText(
    'Mostrando 1–12 de 16 productos',
  )
})

test('La lista corrige páginas inválidas y conserva la búsqueda al volver', async ({
  page,
}) => {
  await page.goto('/admin/productos?q=Bois&page=999')
  await expect(page).toHaveURL('/admin/productos?q=Bois')

  await page.getByRole('link', { name: 'Editar Bois Clair' }).click()
  await expect(page).toHaveURL('/admin/productos/cedre')
  await page.locator('.admin-back').click()

  await expect(page).toHaveURL('/admin/productos?q=Bois')
  await expect(
    page.getByRole('searchbox', { name: 'Buscar producto o marca' }),
  ).toHaveValue('Bois')
})

test('Promociones comunica su estado efectivo y lleva el foco al editar', async ({
  page,
}) => {
  await page.goto('/admin/promociones')

  await expect(page.getByLabel('Código')).toHaveCount(0)
  await page.getByRole('button', { name: 'Nueva promoción' }).click()
  await expect(
    page.getByRole('heading', { name: 'Nueva promoción' }),
  ).toBeFocused()
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByLabel('Código')).toHaveCount(0)

  await expect(page.locator('.admin-promotion-list > li')).toHaveCount(0)
  await page.getByRole('button', { name: 'Nueva promoción' }).click()
  await page.getByLabel('Código').fill('AROMA10')
  await page.getByLabel('Promoción activa').check()
  await page.getByRole('button', { name: 'Guardar promoción' }).click()
  await expect(
    page.locator('.admin-promotion-list > li').filter({ hasText: 'AROMA10' }),
  ).toContainText('Aplicable')

  await page.getByRole('button', { name: 'Editar AROMA10' }).click()
  const editorTitle = page.getByRole('heading', { name: 'Editar promoción' })
  await expect(editorTitle).toBeFocused()
  await expect(page.getByLabel('Código')).toHaveValue('AROMA10')
})

for (const width of [360, 375, 390, 430, 768, 1024, 1280, 1440]) {
  test(`Panel ${width}px: tablas adaptadas y sin overflow horizontal`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/admin/productos')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Productos',
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await expect(
      page.getByRole('link', { name: 'Editar' }).first(),
    ).toBeVisible()
    expect(errors).toEqual([])
  })
}
