import { expect, test } from '@playwright/test'
import {
  adminService,
  getStoreProductBySlug,
  getStoreProducts,
} from '../src/services/admin-service'
import {
  resolveCart,
  resolveFavoriteProducts,
} from '../src/services/commerce-service'
import {
  createCheckoutDraft,
  createMockOrder,
} from '../src/services/checkout-service'
import { persistedAdminState } from './product-import-fixtures'

test.afterEach(() => adminService.reset())

function editableProduct() {
  return structuredClone(
    adminService
      .getSnapshot()
      .products.find((record) => record.product.id === 'cedre')!,
  )
}

test('el catálogo inicial excluye agotados sin eliminarlos del inventario', () => {
  const record = adminService
    .getSnapshot()
    .products.find((item) => item.product.id === 'ambre')!
  expect(record.active).toBe(false)
  expect(record.product.variants).toHaveLength(2)
  expect(getStoreProducts().some((product) => product.id === 'ambre')).toBe(
    false,
  )
  expect(getStoreProductBySlug('ambre-lent')).toBeUndefined()
})

test('una presentación agotada no oculta el producto si otra activa tiene existencias', () => {
  const record = editableProduct()
  record.product.variants[0].stock = 0
  record.product.variants[1].stock = 2
  expect(adminService.saveProduct(record).kind).toBe('saved')
  expect(
    adminService
      .getSnapshot()
      .products.find((item) => item.product.id === 'cedre')!.active,
  ).toBe(true)
  expect(getStoreProductBySlug('bois-clair')).toBeDefined()
  expect(
    resolveCart([{ variantId: 'cedre-50', quantity: 1 }]).needsAttention,
  ).toBe(true)
  expect(
    resolveCart([{ variantId: 'cedre-100', quantity: 1 }]).needsAttention,
  ).toBe(false)
})

test('existencias en una presentación inactiva no impiden la desactivación automática', () => {
  const record = editableProduct()
  record.product.variants[0].stock = 0
  record.product.variants[1].stock = 10
  record.product.variants[1].active = false
  expect(adminService.saveProduct(record).kind).toBe('saved')
  const saved = adminService
    .getSnapshot()
    .products.find((item) => item.product.id === 'cedre')!
  expect(saved.active).toBe(false)
  expect(saved.product.variants[1].stock).toBe(10)
  expect(saved.product.variants[1].active).toBe(false)
  expect(getStoreProducts().some((product) => product.id === 'cedre')).toBe(
    false,
  )
})

test('las recomendaciones agotadas existentes no bloquean otras ediciones ni se reasignan como nuevas', () => {
  const neroli = structuredClone(
    adminService
      .getSnapshot()
      .products.find((record) => record.product.id === 'neroli')!,
  )
  expect(neroli.detail.recommendationIds).toContain('ambre')
  neroli.detail.shortDescription =
    'Texto comercial actualizado sin cambiar sus recomendaciones.'
  expect(adminService.saveProduct(neroli).kind).toBe('saved')
  const saved = adminService
    .getSnapshot()
    .products.find((record) => record.product.id === 'neroli')!
  expect(saved.detail.shortDescription).toBe(neroli.detail.shortDescription)
  expect(saved.detail.recommendationIds).toEqual(
    neroli.detail.recommendationIds,
  )
  expect(getStoreProducts().some((product) => product.id === 'ambre')).toBe(
    false,
  )

  const iris = structuredClone(
    adminService
      .getSnapshot()
      .products.find((record) => record.product.id === 'iris')!,
  )
  expect(iris.detail.recommendationIds).not.toContain('ambre')
  iris.detail.recommendationIds = ['ambre']
  expect(adminService.saveProduct(iris)).toMatchObject({
    kind: 'validation',
    message: expect.stringMatching(/disponibles/),
  })
})

test('guardar sin stock desactiva; reponer no publica hasta activar expresamente', () => {
  const record = editableProduct()
  record.product.variants.forEach((variant) => {
    variant.stock = 0
  })
  expect(adminService.saveProduct({ ...record, active: true }).kind).toBe(
    'saved',
  )
  expect(
    adminService
      .getSnapshot()
      .products.find((item) => item.product.id === 'cedre')!.active,
  ).toBe(false)
  expect(adminService.setProductActive('cedre', true)).toMatchObject({
    kind: 'validation',
    message: expect.stringMatching(/stock/),
  })
  expect(resolveFavoriteProducts(['cedre']).missingIds).toEqual(['cedre'])
  expect(resolveCart([{ variantId: 'cedre-50', quantity: 1 }])).toMatchObject({
    needsAttention: true,
    lines: [{ kind: 'missing' }],
  })
  const restocked = editableProduct()
  restocked.product.variants[0].stock = 3
  expect(adminService.saveProduct(restocked).kind).toBe('saved')
  expect(getStoreProductBySlug('bois-clair')).toBeUndefined()
  expect(adminService.setProductActive('cedre', true).kind).toBe('saved')
  expect(getStoreProductBySlug('bois-clair')!.active).toBe(true)
})

test('la última unidad se descuenta y desactiva en una sola operación; un reintento no duplica el pedido', () => {
  const record = editableProduct()
  record.product.variants[0].stock = 1
  record.product.variants[1].stock = 0
  expect(adminService.saveProduct(record).kind).toBe('saved')
  const draft = createCheckoutDraft()
  draft.contact = {
    firstName: 'Ana',
    lastName: 'Prueba',
    email: 'stock@ejemplo.invalid',
    phone: '912345678',
  }
  draft.address = {
    department: 'lima',
    province: '1501',
    district: '150122',
    street: 'Avenida Prueba 123',
    reference: '',
  }
  draft.deliveryMethod = 'motorizado'
  const order = createMockOrder(
    resolveCart([{ variantId: 'cedre-50', quantity: 1 }]),
    draft,
  )
  expect(order).not.toBeNull()
  const before = adminService.getSnapshot()
  expect(adminService.recordApprovedCheckout(order!).kind).toBe('saved')
  const saved = adminService.getSnapshot()
  expect(saved.revision).toBe(before.revision + 1)
  expect(
    saved.orders.filter((item) => item.reference === order!.reference),
  ).toHaveLength(1)
  expect(
    saved.products.find((item) => item.product.id === 'cedre'),
  ).toMatchObject({
    active: false,
    product: {
      variants: [
        { id: 'cedre-50', stock: 0 },
        { id: 'cedre-100', stock: 0 },
      ],
    },
  })
  expect(getStoreProductBySlug('bois-clair')).toBeUndefined()
  expect(adminService.recordApprovedCheckout(order!).kind).toBe('saved')
  expect(adminService.getSnapshot()).toEqual(saved)
  expect(
    adminService
      .getSnapshot()
      .products.filter((item) => item.product.id === 'cedre'),
  ).toHaveLength(1)
  expect(
    createMockOrder(
      resolveCart([{ variantId: 'cedre-50', quantity: 1 }]),
      draft,
    ),
  ).toBeNull()
})

test('un snapshot antiguo con agotados activos migra y persiste sin perder datos del producto', async ({
  page,
}) => {
  await page.goto('/admin/productos')
  const legacy = await page.evaluate(async () => {
    const servicePath = '/src/services/admin-service.ts'
    const repositoryPath = '/src/services/admin-persistence.ts'
    const { adminService, hydrateAdminStore } = await import(servicePath)
    const { localAdminStateRepository } = await import(repositoryPath)
    await hydrateAdminStore()
    await adminService.flush()
    const snapshot = structuredClone(adminService.getSnapshot())
    const record = snapshot.products.find(
      (item: { product: { id: string } }) => item.product.id === 'cedre',
    )!
    record.active = true
    record.product.variants.forEach((variant: { stock: number }) => {
      variant.stock = 0
    })
    record.product.name = 'Producto migrado sin stock'
    await localAdminStateRepository.write(snapshot)
    return record
  })
  await page.reload()
  const row = page
    .locator('.admin-table tbody tr')
    .filter({ hasText: 'Producto migrado sin stock' })
  await expect(row.getByText('Inactivo', { exact: true })).toBeVisible()
  const migrated = (await persistedAdminState(page)).products.find(
    (record) => record.product.id === 'cedre',
  )!
  expect(migrated).toEqual({ ...legacy, active: false })
  await page.reload()
  expect(
    (await persistedAdminState(page)).products.find(
      (record) => record.product.id === 'cedre',
    ),
  ).toEqual(migrated)
  await page.goto('/tienda?q=Producto+migrado')
  await expect(page.locator('.product-card')).toHaveCount(0)
})

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`agotado ausente del catálogo, carrito bloqueado y edición recuperable · ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/admin/productos/cedre')
    await page.getByLabel('Stock de presentación 50 ml').fill('0')
    await page.getByLabel('Stock de presentación 100 ml').fill('0')
    await page.getByRole('button', { name: 'Guardar producto' }).click()
    await expect(page).toHaveURL(/\/admin\/productos\?guardado=1$/)
    const row = page
      .locator('.admin-table tbody tr')
      .filter({ hasText: 'Bois Clair' })
    await expect(row.getByText('Inactivo', { exact: true })).toBeVisible()
    await row
      .getByRole('button', { name: 'Activar Bois Clair', exact: true })
      .click()
    await expect(page.locator('.admin-notice-dialog')).toContainText(/stock/)
    await page
      .locator('.admin-notice-dialog')
      .getByRole('button', { name: 'Revisar producto' })
      .click()
    await expect(row.getByText('Inactivo', { exact: true })).toBeVisible()
    await page.screenshot({
      path: `artifacts/stock-visibility/admin-${viewport.width}.png`,
      fullPage: true,
    })
    await page.goto('/tienda?q=Bois+Clair')
    await expect(page.locator('.product-card')).toHaveCount(0)
    await page.screenshot({
      path: `artifacts/stock-visibility/catalog-${viewport.width}.png`,
      fullPage: true,
    })
    await page.evaluate(() =>
      localStorage.setItem(
        'aroma-infini:cart:v1',
        JSON.stringify({
          version: 1,
          items: [{ variantId: 'cedre-50', quantity: 1 }],
        }),
      ),
    )
    await page.goto('/carrito')
    const main = page.getByRole('main')
    await expect(
      main.getByText('Selección no disponible', { exact: true }),
    ).toBeVisible()
    await expect(
      main.getByRole('button', { name: 'Revisa tu selección', exact: true }),
    ).toBeDisabled()
    const stored = await persistedAdminState(page)
    expect(
      stored.products
        .find((record) => record.product.id === 'cedre')!
        .product.variants.every((variant) => variant.stock === 0),
    ).toBe(true)
  })
}
