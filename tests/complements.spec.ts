import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'
import sharp from 'sharp'
import { seedAccessory, setComplementsEnabled } from './complements-fixtures'

test.beforeEach(async ({ page }) => {
  expect(await setComplementsEnabled(page, true)).toBe('saved')
})

test('El administrador registra y previsualiza un complemento sin campos de perfume', async ({
  page,
}) => {
  await page.goto('/admin/productos/nuevo')
  await page
    .getByRole('combobox', { name: 'Tipo de producto', exact: true })
    .selectOption('complemento')
  await expect(page.getByLabel('Género', { exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('group', { name: 'Familias olfativas' }),
  ).toHaveCount(0)
  await expect(page.getByLabel('Mililitros')).toHaveCount(0)
  await expect(page.getByLabel('Intensidad', { exact: true })).toHaveCount(0)
  await page
    .getByLabel('Nombre', { exact: true })
    .fill('Complemento registrado de prueba')
  await page.getByLabel('Marca', { exact: true }).selectOption('')
  await page
    .getByLabel('Resumen de la ficha')
    .fill('Producto de prueba no comercial')
  await page
    .getByRole('textbox', { name: 'Descripción', exact: true })
    .fill('Descripción de prueba del complemento')
  await page
    .getByRole('textbox', { name: 'Presentación', exact: true })
    .fill('Unidad')
  await page.getByLabel('Precio (S/)', { exact: true }).fill('80')
  await page
    .getByLabel('Stock de presentación Unidad', { exact: true })
    .fill('4')
  const image = await sharp('public/images/complementos-provisional.svg')
    .resize(800, 1000, { fit: 'contain', background: '#e9eee7' })
    .png()
    .toBuffer()
  await page
    .getByLabel('Subir foto principal del producto', { exact: true })
    .setInputFiles({
      name: 'ilustracion-provisional.png',
      mimeType: 'image/png',
      buffer: image,
    })
  await expect(
    page.getByRole('button', { name: 'Vista previa', exact: true }),
  ).toBeEnabled()
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click()
  const preview = page.getByRole('dialog', {
    name: 'Vista previa del producto',
  })
  await expect(preview.locator('h1')).toHaveText(
    'Complemento registrado de prueba',
  )
  await expect(
    preview.getByRole('button', { name: 'Familia olfativa' }),
  ).toHaveCount(0)
  await expect(preview.locator('.product-variants')).toContainText('Unidad')
  await expect(preview.locator('.product-description-copy')).toHaveText(
    'Descripción de prueba del complemento',
  )
  await preview.getByRole('button', { name: /Cerrar/ }).click()
  await page.getByLabel('Producto activo en tienda').check()
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect(page).toHaveURL(/guardado=1/)
  await page.goto('/producto/complemento-registrado-de-prueba')
  await expect(page.locator('main h1')).toHaveText(
    'Complemento registrado de prueba',
  )
  await expect(page.locator('.product-info-tabs')).not.toContainText(
    'Familia olfativa',
  )
  await expect(page.locator('.product-variants')).not.toContainText('ml')
})

test('Filtros, descuento, favoritos y carrito usan el tipo y la presentación del complemento', async ({
  page,
}) => {
  expect(await seedAccessory(page)).toBe('saved')
  await page.goto('/tienda?tipo=complemento&genero=hombre&familia=floral')
  await expect(page.locator('main article.product-card')).toHaveCount(1)
  await expect(page.locator('main')).toContainText('1 producto')
  await expect(page.locator('[data-filter-group="gender"]')).toHaveCount(0)
  await expect(page.locator('[data-filter-group="family"]')).toHaveCount(0)
  await expect(page.locator('.product-price')).toContainText('S/ 72')
  await page.goto('/tienda?tipo=complemento&max=70')
  await expect(page.locator('main')).toContainText('0 productos')
  await page
    .locator('.catalog-empty')
    .getByRole('button', { name: 'Limpiar filtros', exact: true })
    .click()
  await expect(page).not.toHaveURL(/tipo=/)
  await page.goto('/producto/complemento-de-prueba')
  await page.getByRole('button', { name: /Guardar/ }).click()
  await page.getByRole('button', { name: 'Añadir al carrito' }).click()
  await page.goto('/carrito')
  await expect(page.locator('main')).toContainText('Negro')
  await expect(page.locator('main')).not.toContainText('null ml')
  await page.goto('/favoritos')
  await expect(page.locator('main')).toContainText('Complemento de prueba')
  await page.goto('/checkout')
  await expect(page.locator('.checkout-summary')).toContainText('Negro')
  await expect(page.locator('.checkout-summary')).toContainText('S/ 72')
  const result = await page.evaluate(async () => {
    const repository = '/src/services/storefront-repository.ts'
    const finder = '/src/services/fragrance-matching.ts'
    const { localStorefrontRepository } = await import(repository)
    const { getFinderOptions, recommendFragrances } = await import(finder)
    const snapshot = await localStorefrontRepository.readSnapshot()
    const onlyAccessory = {
      ...snapshot,
      products: snapshot.products.filter(
        (record: { product: { id: string } }) =>
          record.product.id === 'accessory-test',
      ),
    }
    return {
      options: getFinderOptions(onlyAccessory),
      result: recommendFragrances(onlyAccessory, {
        family: [],
        occasion: [],
        intensity: [],
        budget: '10000',
      }),
    }
  })
  expect(result.options.availableCount).toBe(0)
  expect(result.result.kind).toBe('unavailable')
  const purchase = await page.evaluate(async () => {
    const commerce = '/src/services/commerce-service.ts'
    const checkout = '/src/services/checkout-service.ts'
    const admin = '/src/services/admin-service.ts'
    const { resolveCart } = await import(commerce)
    const { createCheckoutDraft, createMockOrder } = await import(checkout)
    const { adminService, hydrateAdminStore } = await import(admin)
    await hydrateAdminStore()
    const draft = createCheckoutDraft()
    draft.contact = {
      firstName: 'Ana',
      lastName: 'Prueba',
      email: 'test@example.invalid',
      phone: '912345678',
    }
    draft.address = {
      department: 'lima',
      province: '1501',
      district: '150122',
      street: 'Dirección de prueba',
    }
    const order = createMockOrder(
      resolveCart([{ variantId: 'accessory-black', quantity: 1 }]),
      draft,
    )
    if (!order) return null
    const saved = adminService.recordApprovedCheckout(order)
    const state = adminService.getSnapshot()
    return {
      saved,
      order: state.orders.find(
        (item: { reference: string }) => item.reference === order.reference,
      ),
      stock: state.products.find(
        (item: { product: { id: string } }) =>
          item.product.id === 'accessory-test',
      )?.product.variants[0].stock,
    }
  })
  expect(purchase?.saved.kind).toBe('saved')
  expect(purchase?.order.lines[0]).toMatchObject({
    ml: null,
    variantLabel: 'Negro',
    unitPriceCents: 7200,
  })
  expect(purchase?.stock).toBe(3)
})

test('Excel importa complementos con variantes nominales y admite las plantillas antiguas de perfumes', async ({
  page,
}) => {
  await page.goto('/admin/productos')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Productos')
  sheet.addRow([
    'slug',
    'nombre',
    'marca',
    'genero',
    'familia',
    'descripcion',
    'tamano_ml',
    'precio_soles',
    'stock',
    'activo',
    'tipo_producto',
    'presentacion',
  ])
  for (const label of ['Negro', 'Dorado'])
    sheet.addRow([
      'excel-complemento',
      'Complemento Excel de prueba',
      '',
      '',
      '',
      'Descripción de prueba',
      '',
      '80',
      3,
      'no',
      'complemento',
      label,
    ])
  const buffer = await workbook.xlsx.writeBuffer()
  const result = await page.evaluate(
    async (bytes) => {
      const parser = '/src/features/admin/product-import-excel.ts'
      const service = '/src/services/admin-service.ts'
      const { parseProductImport } = await import(parser)
      const { adminService } = await import(service)
      const state = adminService.getSnapshot()
      const file = new File([new Uint8Array(bytes)], 'complementos.xlsx')
      const preview = await parseProductImport(
        file,
        state.brands,
        state.products,
      )
      const saved = adminService.saveProductsBatch(
        preview.products,
        state.revision,
      )
      return {
        errors: preview.rows.flatMap((row: { errors: string[] }) => row.errors),
        product: preview.products[0],
        saved,
      }
    },
    Array.from(new Uint8Array(buffer)),
  )
  expect(result.errors).toEqual([])
  expect(
    result.product.product.variants.map(
      (variant: { ml: number | null; label: string }) => [
        variant.ml,
        variant.label,
      ],
    ),
  ).toEqual([
    [null, 'Negro'],
    [null, 'Dorado'],
  ])
  expect(result.saved.kind).toBe('saved')
})

test('El Home permite cambiar y guardar la imagen de Complementos', async ({
  page,
}) => {
  await page.goto('/admin/home')
  await page
    .getByRole('button', { name: 'Para él, para ella, unisex y complementos' })
    .click()
  const image = await sharp('public/images/discovery-complements-v1-960.webp')
    .resize(800, 1000)
    .png()
    .toBuffer()
  await page
    .getByLabel('Subir imagen de Complementos', { exact: true })
    .setInputFiles({
      name: 'ilustracion-provisional.png',
      mimeType: 'image/png',
      buffer: image,
    })
  await page.getByRole('button', { name: 'Abrir vista previa' }).click()
  await expect(
    page.locator('.admin-home-category--accessories img'),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Cerrar', exact: true })
    .click()
  await page.getByRole('button', { name: 'Guardar cambios del Home' }).click()
  await expect(page.getByText(/Cambios guardados/)).toBeVisible()
  await page.goto('/')
  await expect(page.locator('.category--accessories img')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  await expect(page.locator('.category-provisional')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.category--accessories img')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
})

test('Tipos múltiples, precio y marca se combinan sin clasificar accesorios como perfumes', async ({
  page,
}) => {
  await page.goto('/tienda')
  const resultCount = page.locator('.catalog-toolbar p[role="status"]')
  await expect(resultCount).toContainText(/\d+ productos?/)
  const initialCount = Number.parseInt((await resultCount.textContent())!, 10)
  expect(await seedAccessory(page)).toBe('saved')
  await page.goto('/tienda?tipo=perfume&tipo=complemento&orden=precio-asc')
  await expect(resultCount).toHaveText(`${initialCount + 1} productos`)
  await expect(page.locator('main .product-card')).toHaveCount(
    Math.min(12, initialCount + 1),
  )
  await expect(page.locator('main .product-card').first()).toContainText(
    'Complemento de prueba',
  )
  await expect(
    page.getByRole('checkbox', { name: 'Perfumes', exact: true }),
  ).toBeChecked()
  await expect(
    page.getByRole('checkbox', { name: 'Complementos', exact: true }),
  ).toBeChecked()
  await page
    .getByRole('button', { name: 'Quitar Complementos', exact: true })
    .click()
  await expect(resultCount).toHaveText(`${initialCount} productos`)
  await expect(page.locator('main .product-card')).toHaveCount(
    Math.min(12, initialCount),
  )
  await page.goto('/tienda?tipo=complemento&marca=atelier-01')
  await expect(page.locator('main .product-card')).toHaveCount(0)
  await page.goto('/tienda?tipo=perfume&tipo=complemento&familia=amaderado')
  await expect(
    page
      .locator('main .product-card')
      .filter({ hasText: 'Complemento de prueba' }),
  ).toHaveCount(0)
  await page.goto('/tienda?tipo=complemento&orden=precio-desc')
  await expect(page.locator('main .product-card')).toHaveCount(1)
})

test('El filtro móvil permite seleccionar Complementos y descarta los filtros de perfume', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await seedAccessory(page)).toBe('saved')
  await page.goto('/tienda?genero=unisex&familia=floral')
  await page.getByRole('button', { name: /^Filtros/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Afinar la selección' })
  await dialog.locator('[data-filter-group="type"] summary').click()
  await dialog
    .getByRole('checkbox', { name: 'Complementos', exact: true })
    .check()
  await expect(dialog.locator('[data-filter-group="gender"]')).toHaveCount(0)
  await expect(dialog.locator('[data-filter-group="family"]')).toHaveCount(0)
  await dialog
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click()
  await expect(page).toHaveURL(/tipo=complemento/)
  await expect(page).not.toHaveURL(/genero=|familia=/)
  await expect(page.locator('main .product-card')).toHaveCount(1)
})

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`Cuatro categorías y complemento responsive · ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready.then(() => true))
    const section = page.locator('#descubrir')
    await section.scrollIntoViewIfNeeded()
    await expect(section.locator('.category')).toHaveCount(4)
    for (const image of await section.locator('img').all()) {
      await expect(image).toHaveJSProperty('complete', true)
      expect(
        await image.evaluate((image: HTMLImageElement) => image.naturalWidth),
      ).toBeGreaterThan(0)
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
    ).toBe(false)
    await section.screenshot({
      path: `artifacts/complementos/home-${viewport.width}.png`,
      animations: 'disabled',
      style: '.site-header, .skip-link { visibility: hidden !important; }',
    })
    await section.getByRole('link', { name: /Complementos/ }).click()
    await expect(page).toHaveURL(/tipo=complemento/)
    await expect(page.locator('main h1')).toHaveText('Complementos')
    await expect(page.locator('main')).toContainText('0 productos')
    await page.screenshot({
      path: `artifacts/complementos/catalog-empty-${viewport.width}.png`,
      fullPage: true,
    })
    expect(await seedAccessory(page)).toBe('saved')
    await page.goto('/producto/complemento-de-prueba')
    await page.screenshot({
      path: `artifacts/complementos/product-test-${viewport.width}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
    ).toBe(false)
    await page.goto('/admin/productos/accessory-test')
    await page.screenshot({
      path: `artifacts/complementos/admin-test-${viewport.width}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
    ).toBe(false)
  })
}
