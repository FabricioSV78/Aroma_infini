import { expect, test } from '@playwright/test'

test('SKU únicos se normalizan al guardar y editar no colisiona con el mismo producto', async ({
  page,
}) => {
  await page.goto('/admin/productos')
  const result = await page.evaluate(async () => {
    const module = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = await import(module)
    await hydrateAdminStore()
    const base = structuredClone(adminService.getSnapshot().products[0])
    base.product.variants[0].sku = ' codigo-50 '
    const first = adminService.saveProduct(base)
    const own = adminService.saveProduct(base)
    const stored = adminService
      .getSnapshot()
      .products.find(
        (record: typeof base) => record.product.id === base.product.id,
      )
    const duplicate = structuredClone(adminService.getSnapshot().products[1])
    duplicate.product.variants[0].sku = 'CODIGO-50'
    const count = adminService.getSnapshot().products.length
    const conflict = adminService.saveProduct(duplicate)
    const countAfter = adminService.getSnapshot().products.length
    const invalid = structuredClone(base)
    invalid.product.variants[0].sku = 'no usar espacios'
    return {
      first,
      own,
      normalized: stored.product.variants[0].sku,
      conflict,
      invalid: adminService.saveProduct(invalid),
      count,
      countAfter,
    }
  })
  expect(result.first.kind).toBe('saved')
  expect(result.own.kind).toBe('saved')
  expect(result.normalized).toBe('CODIGO-50')
  expect(result.conflict).toMatchObject({ kind: 'validation' })
  expect(result.conflict.message).toContain('SKU')
  expect(result.invalid.kind).toBe('validation')
  expect(result.countAfter).toBe(result.count)
})

test('publicación rápida exige la misma foto principal que la galería', async ({
  page,
}) => {
  await page.goto('/admin/productos')
  const result = await page.evaluate(async () => {
    const module = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore, getStoreProducts } = await import(
      module
    )
    await hydrateAdminStore()
    const draft = structuredClone(adminService.getSnapshot().products[0])
    draft.active = false
    draft.product.image = ''
    draft.detail.gallery = []
    const saved = adminService.saveProduct(draft)
    const activate = adminService.setProductActive(draft.product.id, true)
    const visible = getStoreProducts().some(
      (product: { id: string }) => product.id === draft.product.id,
    )
    draft.product.image = '/images/cedre.webp'
    draft.detail.gallery = [
      { image: '/images/petale.webp', alt: '', framing: 'full' },
    ]
    draft.active = true
    const mismatch = adminService.saveProduct(draft)
    draft.detail.gallery[0].image = draft.product.image
    const complete = adminService.saveProduct(draft)
    return { saved, activate, visible, mismatch, complete }
  })
  expect(result.saved.kind).toBe('saved')
  expect(result.activate.kind).toBe('validation')
  expect(result.visible).toBe(false)
  expect(result.mismatch.kind).toBe('validation')
  expect(result.complete.kind).toBe('saved')
})

test('identificadores de presentaciones no se reutilizan entre productos', async ({
  page,
}) => {
  await page.goto('/admin/productos')
  const result = await page.evaluate(async () => {
    const module = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = await import(module)
    await hydrateAdminStore()
    const [first, second] = adminService.getSnapshot().products
    const changed = structuredClone(second)
    changed.product.variants[0].id = first.product.variants[0].id
    const before = JSON.stringify(adminService.getSnapshot().products)
    const save = adminService.saveProduct(changed)
    return {
      save,
      unchanged: before === JSON.stringify(adminService.getSnapshot().products),
    }
  })
  expect(result.save.kind).toBe('validation')
  expect(result.unchanged).toBe(true)
})

test('preparar una foto protege el orden y la eliminación hasta completar el archivo', async ({
  page,
}) => {
  await page.goto('/admin/productos/cedre')
  await page
    .locator('.admin-product-upload-item')
    .last()
    .getByRole('button', { name: 'Quitar', exact: true })
    .click()
  await page.evaluate(() => {
    const original = window.createImageBitmap.bind(window)
    Object.defineProperty(window, 'createImageBitmap', {
      configurable: true,
      value: async (...args: unknown[]) => {
        await new Promise<void>((resolve) => {
          Object.assign(window, { __resumeImagePreparation: resolve })
        })
        return Reflect.apply(original, window, args)
      },
    })
  })
  await page
    .getByLabel('Reemplazar foto principal del producto', { exact: true })
    .setInputFiles('public/images/petale-960.webp')
  await expect(
    page.getByRole('button', { name: 'Añadir otra foto', exact: true }),
  ).toHaveCount(0)
  await expect(page.locator('.admin-product-upload-item')).toHaveCount(4)
  await expect(
    page.getByLabel('Subir varias fotos del producto', { exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByLabel('Ubicación de foto 1', { exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Mover foto 2 antes', exact: true }),
  ).toBeDisabled()
  const remove = page
    .locator('.admin-product-upload-item')
    .getByRole('button', { name: 'Quitar', exact: true })
  for (const button of await remove.all()) await expect(button).toBeDisabled()
  await expect(
    page.getByLabel('Reemplazar foto principal del producto', { exact: true }),
  ).toBeDisabled()
  await page.evaluate(() => Reflect.get(window, '__resumeImagePreparation')())
  await expect(
    page.getByLabel('Reemplazar foto principal del producto', { exact: true }),
  ).toBeEnabled()
  await expect(
    page.locator('.admin-product-upload-item').first().locator('img'),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)
})
