import { expect, test } from '@playwright/test'
import { seedAccessory } from './complements-fixtures'
import { persistedAdminState } from './product-import-fixtures'

test('Nuevo producto y Preparar un complemento comparten selector y guardan accesorios sin habilitar su venta', async ({
  page,
  context,
}) => {
  await page.goto('/admin/productos/nuevo')
  const type = page.getByRole('combobox', {
    name: 'Tipo de producto',
    exact: true,
  })
  await expect(type).toHaveValue('perfume')
  await expect(type.locator('option')).toHaveText(['Perfume', 'Complemento'])
  await type.selectOption('complemento')

  const prepared = await context.newPage()
  await prepared.goto('/admin/productos/nuevo?tipo=complemento')
  await expect(
    prepared.getByLabel('Tipo de producto', { exact: true }),
  ).toHaveValue('complemento')
  for (const editor of [page, prepared]) {
    await expect(editor.getByLabel('Género', { exact: true })).toHaveCount(0)
    await expect(
      editor.getByRole('group', { name: 'Familias olfativas' }),
    ).toHaveCount(0)
    await expect(editor.getByLabel('Mililitros', { exact: true })).toHaveCount(
      0,
    )
    await expect(editor.getByLabel('Intensidad', { exact: true })).toHaveCount(
      0,
    )
    await expect(
      editor.getByRole('textbox', { name: 'Presentación', exact: true }),
    ).toHaveValue('Unidad')
    await expect(
      editor.getByLabel('Marca', { exact: true }),
    ).not.toHaveAttribute('required')
    await expect(
      editor.getByLabel('Producto activo en tienda'),
    ).not.toBeChecked()
  }
  await prepared.close()

  await page
    .getByLabel('Nombre', { exact: true })
    .fill('Atomizador de prueba del formulario')
  await page.getByLabel('Marca', { exact: true }).selectOption('')
  await page
    .getByLabel('Resumen de la ficha')
    .fill('Accesorio exclusivo de pruebas')
  await page
    .getByRole('textbox', { name: 'Descripción', exact: true })
    .fill('Descripción del accesorio de prueba')
  await page
    .getByRole('textbox', { name: 'Presentación', exact: true })
    .fill('Negro')
  await page
    .getByLabel('SKU de presentación Negro', { exact: true })
    .fill('FORM-COMP-NEGRO')
  await page.getByLabel('Precio (S/)', { exact: true }).fill('89.90')
  await page
    .getByLabel('Stock de presentación Negro', { exact: true })
    .fill('4')
  await page
    .getByLabel('Subir foto principal del producto', { exact: true })
    .setInputFiles('public/images/cedre-960.webp')
  await expect(page.locator('.admin-product-upload-item > img')).toHaveCount(1)
  await expect(
    page.getByRole('button', { name: 'Guardar producto', exact: true }),
  ).toBeEnabled()
  await page.getByLabel('Producto activo en tienda').check()
  await expect(page.locator('.admin-checks')).toContainText(
    'permanecerá oculto',
  )

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    await page.locator('#product-general-title').scrollIntoViewIfNeeded()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    await page.locator('.admin-product-general-fields').screenshot({
      path: `artifacts/admin-product-types/general-${viewport.width}.png`,
      animations: 'disabled',
      style: '.admin-editor-actions { visibility: hidden !important; }',
    })
  }
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect(page).toHaveURL(/guardado=1/)
  const snapshot = await persistedAdminState(page)
  const saved = snapshot.products.find(
    ({ product }) => product.slug === 'atomizador-de-prueba-del-formulario',
  )!
  expect(saved.product.productType).toBe('complemento')
  expect(saved.product.brandId).toBe('')
  expect(saved.product.variants[0]).toMatchObject({
    ml: null,
    label: 'Negro',
    sku: 'FORM-COMP-NEGRO',
    priceCents: 8990,
    stock: 4,
  })
  expect(saved.detail.gallery).toHaveLength(1)
  expect(saved.detail.notes).toEqual({ top: [], heart: [], base: [] })
  expect(saved.gender).toBeNull()
  expect(snapshot.features.complementsEnabled).toBe(false)
  await page.goto(`/admin/productos/${saved.product.id}`)
  await expect(
    page.getByLabel('Tipo de producto', { exact: true }),
  ).toHaveValue('complemento')
  await expect(
    page.getByRole('textbox', { name: 'Presentación', exact: true }),
  ).toHaveValue('Negro')
  await expect(page.getByLabel('Precio (S/)', { exact: true })).toHaveValue(
    '89.9',
  )
  await page.goto('/producto/atomizador-de-prueba-del-formulario')
  await expect(
    page.getByRole('button', { name: 'Añadir al carrito', exact: true }),
  ).toHaveCount(0)
})

test('cambiar un complemento sin marca a perfume exige una marca real y conserva los datos comerciales', async ({
  page,
}) => {
  expect(await seedAccessory(page)).toBe('saved')
  const before = (await persistedAdminState(page)).products.find(
    ({ product }) => product.id === 'accessory-test',
  )!
  await page.goto('/admin/productos/accessory-test')
  const type = page.getByLabel('Tipo de producto', { exact: true })
  await type.selectOption('perfume')
  const brand = page.getByLabel('Marca', { exact: true })
  await expect(brand).toHaveValue('')
  await expect(brand).toHaveAttribute('required')
  await expect(brand.locator('option:checked')).toHaveText(
    'Selecciona una marca',
  )
  await expect(page.getByLabel('Mililitros')).toHaveCount(2)
  await expect(
    page.getByRole('textbox', { name: 'Presentación', exact: true }),
  ).toHaveCount(0)
  await page.getByLabel('Perfil aromático breve').fill('Amaderado')
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  expect(
    (await persistedAdminState(page)).products.find(
      ({ product }) => product.id === 'accessory-test',
    )!.product.productType,
  ).toBe('complemento')
  await expect(brand).toBeFocused()
  await brand.selectOption('atelier')
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect(page).toHaveURL(/guardado=1/)
  const snapshot = await persistedAdminState(page)
  const after = snapshot.products.find(
    ({ product }) => product.id === 'accessory-test',
  )!
  expect(after.product.productType).toBe('perfume')
  expect(after.product.brandId).toBe('atelier')
  expect(
    after.product.variants.map(({ id, sku, priceCents, stock, active }) => ({
      id,
      sku,
      priceCents,
      stock,
      active,
    })),
  ).toEqual(
    before.product.variants.map(({ id, sku, priceCents, stock, active }) => ({
      id,
      sku,
      priceCents,
      stock,
      active,
    })),
  )
  expect(
    after.product.variants.map(({ ml, label }) => ({ ml, label })),
  ).toEqual([
    { ml: 50, label: undefined },
    { ml: 100, label: undefined },
  ])
  expect(after.product.discount).toEqual(before.product.discount)
  expect(after.product.image).toBe(before.product.image)
  expect(
    after.detail.gallery.map(({ image, framing }) => ({ image, framing })),
  ).toEqual(
    before.detail.gallery.map(({ image, framing }) => ({ image, framing })),
  )
  expect(after.detail.description).toBe(before.detail.description)
  expect(after.gender).toBe('unisex')
  expect(snapshot.features.complementsEnabled).toBe(false)
})
