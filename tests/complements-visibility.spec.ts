import { expect, test, type Page } from '@playwright/test'
import { seedAccessory } from './complements-fixtures'
import { importViewports, persistedAdminState } from './product-import-fixtures'

async function openCategories(page: Page) {
  await page.goto('/admin/home')
  await page.getByRole('button', { name: /Para él, para ella/ }).click()
  return page.getByRole('checkbox', {
    name: 'Mostrar Complementos en la tienda',
    exact: true,
  })
}

async function saveHome(page: Page) {
  await page
    .getByRole('button', { name: 'Guardar cambios del Home', exact: true })
    .click()
  await expect(page.getByText(/Cambios guardados/)).toBeVisible()
}

async function captureCategories(page: Page, name: string) {
  const section = page.locator('#descubrir')
  await section.scrollIntoViewIfNeeded()
  await section.locator('img').evaluateAll(async (images) => {
    await Promise.all(
      images.map(async (image) => {
        const photo = image as HTMLImageElement
        photo.loading = 'eager'
        await photo.decode()
      }),
    )
  })
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  const bounds = await section.boundingBox()
  expect(bounds).not.toBeNull()
  await page.screenshot({
    path: `artifacts/complements-visibility/${name}.png`,
    fullPage: true,
    clip: bounds!,
    animations: 'disabled',
  })
}

test('Complementos comienza oculto aunque existan accesorios registrados y una URL anterior no los publica', async ({
  page,
}) => {
  expect(await seedAccessory(page)).toBe('saved')
  const stored = await persistedAdminState(page)
  expect(stored.features.complementsEnabled).toBe(false)
  const accessory = stored.products.find(
    (record) => record.product.id === 'accessory-test',
  )!
  expect(accessory.active).toBe(true)
  expect(accessory.product.variants[0].stock).toBe(4)
  // A snapshot created before this setting existed also starts with it hidden.
  await page.evaluate(async () => {
    const adminPath = '/src/services/admin-service.ts'
    const repositoryPath = '/src/services/admin-persistence.ts'
    const { adminService } = await import(adminPath)
    const { writeAdminState } = await import(repositoryPath)
    await adminService.flush()
    const legacy = structuredClone(adminService.getSnapshot())
    Reflect.deleteProperty(legacy, 'features')
    await writeAdminState(legacy)
  })

  await page.goto('/')
  await expect(page.locator('#descubrir .category h3')).toHaveText([
    'Para él',
    'Para ella',
    'Unisex',
  ])
  await expect(
    page.locator('.site-header a[href="/tienda?tipo=complemento"]'),
  ).toHaveCount(0)
  await page.goto('/tienda')
  await expect(page.locator('[data-filter-group="type"]')).toHaveCount(0)
  await expect(
    page.locator('main .product-card', { hasText: 'Complemento de prueba' }),
  ).toHaveCount(0)
  await page.goto('/tienda?tipo=complemento&q=Complemento%20de%20prueba')
  await expect(page.locator('main .product-card')).toHaveCount(0)
  await expect(page.locator('[data-filter-group="type"]')).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Quitar Complementos', exact: true }),
  ).toHaveCount(0)
  await page.goto('/buscar?q=Complemento%20de%20prueba')
  await expect(page.locator('main .product-card')).toHaveCount(0)
  await page.goto('/producto/complemento-de-prueba')
  await expect(
    page.getByRole('heading', {
      name: 'Complemento de prueba',
      exact: true,
      level: 1,
    }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Añadir al carrito', exact: true }),
  ).toHaveCount(0)
  const result = await page.evaluate(async () => {
    const module = '/src/services/admin-service.ts'
    const {
      adminService,
      getStoreFeatures,
      getStoreProductRecords,
      hydrateAdminStore,
    } = await import(module)
    await hydrateAdminStore()
    const data = '/src/services/storefront-repository.ts'
    const { localStorefrontRepository } = await import(data)
    return {
      settings: getStoreFeatures(),
      snapshotSettings: (await localStorefrontRepository.readSnapshot())
        .features,
      publicAccessory: getStoreProductRecords().some(
        (record: { product: { id: string } }) =>
          record.product.id === 'accessory-test',
      ),
      adminAccessory: adminService
        .getSnapshot()
        .products.some(
          (record: { product: { id: string } }) =>
            record.product.id === 'accessory-test',
        ),
    }
  })
  expect(result).toEqual({
    settings: { complementsEnabled: false },
    snapshotSettings: { complementsEnabled: false },
    publicAccessory: false,
    adminAccessory: true,
  })
})

test('el administrador prepara una imagen oculta y activa, oculta y recupera la categoría sin borrar productos ni selecciones', async ({
  page,
}) => {
  test.setTimeout(90_000)
  expect(await seedAccessory(page)).toBe('saved')
  let toggle = await openCategories(page)
  await expect(toggle).not.toBeChecked()
  await page.getByText('Configurar Complementos', { exact: true }).click()
  await page.locator('.admin-home-hidden-category').screenshot({
    path: 'artifacts/complements-visibility/admin-configurar.png',
    animations: 'disabled',
  })
  await page.getByRole('link', { name: /Preparar un complemento/ }).click()
  await expect(
    page.getByLabel('Tipo de producto', { exact: true }),
  ).toHaveValue('complemento')
  await expect(page.getByLabel('Producto activo en tienda')).not.toBeChecked()
  await expect(
    page.getByRole('group', { name: 'Familias olfativas' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('textbox', { name: 'Presentación', exact: true }),
  ).toHaveValue('Unidad')
  toggle = await openCategories(page)
  await page.getByText('Configurar Complementos', { exact: true }).click()
  await page
    .getByLabel('Subir imagen de Complementos', { exact: true })
    .setInputFiles('public/images/discovery-complements-v1-960.webp')
  await expect(
    page
      .locator('.admin-home-hidden-category')
      .getByRole('button', { name: 'Usar original', exact: true }),
  ).toBeVisible()
  await saveHome(page)
  const prepared = await persistedAdminState(page)
  const savedProduct = prepared.products.find(
    (record) => record.product.id === 'accessory-test',
  )!
  const savedImage = prepared.homeMedia.complementos!
  expect(prepared.features.complementsEnabled).toBe(false)
  expect(savedImage).toMatch(/^data:image\/webp;base64,/)

  await page
    .getByRole('button', { name: 'Abrir vista previa', exact: true })
    .click()
  const preview = page.getByRole('dialog', { name: /Vista previa.*Categorías/ })
  await expect(preview.locator('.admin-home-category')).toHaveCount(3)
  await page.keyboard.press('Escape')
  await toggle.check()
  await page
    .getByRole('button', { name: 'Abrir vista previa', exact: true })
    .click()
  await expect(preview.locator('.admin-home-category')).toHaveCount(4)
  await expect(
    preview.locator('.admin-home-category--accessories img'),
  ).toHaveAttribute('src', savedImage)
  expect((await persistedAdminState(page)).features.complementsEnabled).toBe(
    false,
  )
  await page.keyboard.press('Escape')
  await saveHome(page)
  await page.goto('/')
  await expect(page.locator('#descubrir .category')).toHaveCount(4)
  await expect(page.locator('.category--accessories img')).toHaveAttribute(
    'src',
    savedImage,
  )
  await page.locator('#nav-trigger-perfumes').click()
  await expect(
    page
      .locator('.site-header')
      .getByRole('link', { name: 'Complementos', exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')

  await page.goto('/tienda?tipo=complemento')
  await expect(page.locator('[data-filter-group="type"]')).toBeVisible()
  await expect(page.locator('main .product-card')).toHaveCount(1)
  await expect(page.locator('main .product-card')).toContainText(
    'Complemento de prueba',
  )
  await page.goto('/buscar?q=Complemento%20de%20prueba')
  await expect(page.locator('main .product-card')).toHaveCount(1)
  await page.goto('/producto/complemento-de-prueba')
  await expect(
    page.getByRole('heading', {
      name: 'Complemento de prueba',
      exact: true,
      level: 1,
    }),
  ).toBeVisible()
  await page.getByRole('button', { name: /Guardar/ }).click()
  await page
    .getByRole('button', { name: 'Añadir al carrito', exact: true })
    .click()
  await page.goto('/favoritos')
  await expect(page.locator('main .product-card')).toContainText(
    'Complemento de prueba',
  )
  await page.goto('/carrito')
  await expect(page.locator('.cart-page-lines')).toContainText(
    'Complemento de prueba',
  )
  await expect(page.locator('.cart-page-lines')).toContainText('Negro')
  await expect(page.locator('.cart-page-lines')).toContainText('S/ 72')

  await (await openCategories(page)).uncheck()
  await saveHome(page)
  const hidden = await persistedAdminState(page)
  expect(hidden.features.complementsEnabled).toBe(false)
  expect(hidden.homeMedia.complementos).toBe(savedImage)
  expect(
    hidden.products.find((record) => record.product.id === 'accessory-test'),
  ).toEqual(savedProduct)
  await page.goto('/')
  await expect(page.locator('#descubrir .category')).toHaveCount(3)
  await expect(
    page.locator('.site-header a[href="/tienda?tipo=complemento"]'),
  ).toHaveCount(0)
  await page.goto('/favoritos')
  await expect(page.locator('main .product-card')).toHaveCount(0)
  await expect(page.locator('.favorite-unavailable')).toBeVisible()
  await page.goto('/carrito')
  await expect(page.locator('.cart-page-lines')).not.toContainText(
    'Complemento de prueba',
  )
  await expect(
    page.locator('.cart-page-lines .cart-line--unavailable'),
  ).toBeVisible()
  await (await openCategories(page)).check()
  await saveHome(page)
  await page.reload()
  await page.getByRole('button', { name: /Para él, para ella/ }).click()
  await expect(
    page.getByRole('checkbox', {
      name: 'Mostrar Complementos en la tienda',
      exact: true,
    }),
  ).toBeChecked()
  await page.goto('/')
  await expect(page.locator('.category--accessories img')).toHaveAttribute(
    'src',
    savedImage,
  )
  await page.goto('/favoritos')
  await expect(page.locator('main .product-card')).toContainText(
    'Complemento de prueba',
  )
  await page.goto('/carrito')
  await expect(page.locator('.cart-page-lines')).toContainText(
    'Complemento de prueba',
  )
  await expect(page.locator('.cart-line--unavailable')).toHaveCount(0)
})

for (const viewport of importViewports) {
  test(`categorías ocultas y visibles mantienen proporciones y un control accesible · ${viewport.name}`, async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await expect(page.locator('#descubrir .category')).toHaveCount(3)
    await captureCategories(page, `home-off-${viewport.name}`)
    const toggle = await openCategories(page)
    await expect(toggle).not.toBeChecked()
    await toggle.scrollIntoViewIfNeeded()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `artifacts/complements-visibility/admin-off-${viewport.name}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    await toggle.focus()
    await page.keyboard.press('Space')
    await expect(toggle).toBeChecked()
    await saveHome(page)
    await page.screenshot({
      path: `artifacts/complements-visibility/admin-on-${viewport.name}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    await page.goto('/')
    await expect(page.locator('#descubrir .category')).toHaveCount(4)
    await captureCategories(page, `home-on-${viewport.name}`)
    if (viewport.width < 1200) {
      await page
        .getByRole('button', { name: 'Abrir menú', exact: true })
        .click()
    } else {
      await page.locator('#nav-trigger-perfumes').click()
    }
    await expect(
      page.getByRole('link', { name: 'Complementos', exact: true }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await page.goto('/tienda')
    if (viewport.width < 1024) {
      await page.getByRole('button', { name: /^Filtros/ }).click()
      await expect(
        page
          .getByRole('dialog', { name: 'Afinar la selección' })
          .locator('[data-filter-group="type"]'),
      ).toBeVisible()
    } else {
      await expect(page.locator('[data-filter-group="type"]')).toBeVisible()
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
  })
}
