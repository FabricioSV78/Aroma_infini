import { expect, test } from '@playwright/test'

test('El panel publica cinco campañas editables y el video editorial tras guardar y recargar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin/home')
  await page.getByRole('button', { name: 'Carrusel principal' }).click()
  await expect(page.locator('.admin-home-slide-picker button')).toHaveCount(5)
  await page
    .getByRole('textbox', { name: 'Etiqueta superior' })
    .fill('Firma personal')
  await page
    .getByRole('textbox', { name: /^Título/ })
    .fill('Una\nesencia\npara\nti')
  await page.getByRole('button', { name: 'Guardar cambios del Home' }).click()
  await expect(page.locator('.admin-home-savebar')).toContainText(
    'una a tres líneas',
  )
  await page
    .getByRole('textbox', { name: /^Título/ })
    .fill('Una esencia.\nTu momento.')
  await page
    .getByRole('textbox', { name: 'Descripción', exact: true })
    .fill('Un perfume para expresar tu momento.')
  await page
    .getByRole('textbox', { name: 'Texto del botón' })
    .fill('Ver la colección')
  await page
    .getByLabel('Subir imagen de escritorio de campaña 1')
    .setInputFiles('public/images/hero-v4-citrus-desktop-2048.webp')
  await expect(page.locator('.admin-home-hero-preview img')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  await page
    .getByLabel('Subir imagen móvil de campaña 1')
    .setInputFiles('public/images/hero-v4-citrus-mobile-1024.webp')
  await page.getByRole('button', { name: 'Móvil', exact: true }).click()
  await expect(page.locator('.admin-home-hero-preview')).toHaveClass(/--mobile/)
  await expect(page.locator('.admin-home-hero-preview img')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  await page.locator('.admin-home-slide-picker button').nth(4).click()
  await page
    .getByRole('textbox', { name: /^Título/ })
    .fill('Quinta campaña.\nTu aroma.')

  await page.getByRole('button', { name: 'Video editorial' }).click()
  await page
    .getByRole('textbox', { name: /^Título/ })
    .fill('Un ritual.\nMuy tuyo.')
  await page
    .getByRole('textbox', { name: 'Descripción', exact: true })
    .fill('Un momento para elegir tu fragancia.')
  await page
    .getByLabel('Subir video editorial')
    .setInputFiles('public/videos/README.md')
  await expect(page.locator('.admin-home-savebar')).toContainText(
    'Elige un video MP4',
  )
  await page
    .getByLabel('Subir video editorial')
    .setInputFiles('public/videos/perfume-editorial-wide.mp4')
  await expect(page.locator('.admin-home-film-preview video')).toHaveAttribute(
    'src',
    /^data:video\/mp4;base64,/,
  )
  await expect(page.locator('.admin-home-film-preview video')).toHaveAttribute(
    'poster',
    /^data:image\/webp;base64,/,
  )
  await page.getByRole('button', { name: 'Guardar cambios del Home' }).click()
  await expect(page.getByText(/Cambios guardados/)).toBeVisible()

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Una esencia.',
  )
  await expect(
    page.locator('.hero-slide').first().locator('img'),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await expect(page.locator('.editorial-film-copy')).toContainText('Un ritual.')
  await expect(page.locator('.editorial-film-copy')).toContainText(
    'Un momento para elegir tu fragancia.',
  )
  await expect(page.locator('.editorial-film-media img')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  await page.locator('.editorial-film-media').scrollIntoViewIfNeeded()
  await expect(page.locator('.editorial-film-media video')).toHaveAttribute(
    'src',
    /^data:video\/mp4;base64,/,
  )
  await expect(page.locator('.editorial-film-fallback')).toHaveCount(0)
  await page.getByRole('button', { name: 'Ver campaña 5' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Quinta campaña.',
  )

  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Una esencia.',
  )
  await expect(page.locator('.editorial-film-copy')).toContainText('Un ritual.')
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
})

test('El Home muestra la edición visual, cambia imágenes y conserva los cambios tras recargar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/admin/home')
  await page
    .getByRole('button', { name: 'Para él, para ella y unisex' })
    .click()

  const categoryPreview = page.locator('.admin-home-category--portrait img')
  await page
    .getByLabel('Subir imagen de Para él')
    .setInputFiles('public/images/cedre-480.webp')
  await expect(page.locator('.admin-home-savebar')).toContainText(
    '960 × 1440 px',
  )
  await expect(categoryPreview).toHaveAttribute('src', /discovery-bois/)
  await page
    .getByLabel('Subir imagen de Para él')
    .setInputFiles('public/images/discovery-bois-1536.webp')
  await expect(categoryPreview).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  await expect(page.getByText('2:3 · mínimo 960 × 1440 px')).toBeVisible()

  await page.getByRole('button', { name: 'Destacados', exact: true }).click()
  await page
    .getByLabel('Subir fotografía grande de destacados')
    .setInputFiles('public/images/featured-duo-v3-1536.webp')
  await expect(page.locator('.admin-home-featured-photo')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  await page.getByRole('button', { name: /Destacado 01/ }).click()
  await page
    .getByRole('searchbox', { name: /Buscar un producto/ })
    .fill('Pétale')
  await page
    .getByRole('button', { name: 'Elegir Pétale Nu para destacado 1' })
    .click()
  await expect(page.locator('.admin-home-featured-products')).toContainText(
    'Pétale Nu',
  )
  expect(
    (await page.locator('.admin-home-product-results').boundingBox())?.height,
  ).toBeLessThanOrEqual(288)

  await page.getByRole('button', { name: 'Guardar cambios del Home' }).click()
  await expect(page.getByText(/Cambios guardados/)).toBeVisible()
  await page.getByRole('link', { name: 'Ver en tienda' }).click()
  await expect(page.locator('.category--portrait img')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  await expect(page.locator('.featured-visual img')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  await expect(page.locator('.featured-products')).toContainText('Pétale Nu')

  await page.reload()
  await expect(page.locator('.category--portrait img')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  await expect(page.locator('.featured-products')).toContainText('Pétale Nu')
})

test('Un producto nuevo admite archivos, previsualiza la galería y se publica con su foto', async ({
  page,
}) => {
  await page.goto('/admin/productos/nuevo')
  await page
    .getByRole('textbox', { name: 'Nombre', exact: true })
    .fill('Aura Uno')
  await page.getByRole('textbox', { name: 'URL del producto' }).fill('aura-uno')
  await page
    .getByRole('textbox', { name: 'Familia olfativa' })
    .fill('Floral · fresco')
  await page
    .getByLabel('Subir foto principal del producto')
    .setInputFiles('public/images/cedre-480.webp')
  await expect(page.locator('.admin-product-upload-feedback')).toContainText(
    '800 × 1000 px',
  )
  await page
    .getByLabel('Subir foto principal del producto')
    .setInputFiles('public/images/petale-960.webp')
  await page
    .getByRole('textbox', { name: 'Descripción de la imagen' })
    .first()
    .fill('Fotografía de Aura Uno sobre fondo claro')
  await expect(page.locator('.admin-product-preview-main img')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  await page.getByRole('button', { name: 'Añadir otra foto' }).click()
  await page
    .getByLabel('Subir vista 2 del producto')
    .setInputFiles('public/images/cedre-960.webp')
  await page.getByRole('button', { name: 'Ver vista 2 del borrador' }).click()
  await expect(page.locator('.admin-product-preview-main img')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  await expect(page.locator('.admin-product-live-preview')).toContainText(
    'Aura Uno',
  )

  await page.getByLabel('Precio (S/)').fill('420')
  await page.getByLabel('Stock de presentación 50 ml').fill('3')
  await page.getByLabel('Producto activo en tienda').check()
  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page).toHaveURL(/\/admin\/productos\?guardado=1$/)
  await page.goto('/producto/aura-uno')
  await expect(
    page.getByRole('heading', { name: 'Aura Uno', level: 1 }),
  ).toBeVisible()
  await expect(
    page.locator('.product-gallery-frame.is-active img'),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await expect(
    page.locator('.product-gallery-frame.is-active img'),
  ).toHaveAttribute('alt', 'Fotografía de Aura Uno sobre fondo claro')

  await page.reload()
  await expect(
    page.locator('.product-gallery-frame.is-active img'),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)
})

test('Los editores visuales conservan controles y composición en móvil, tablet y escritorio', async ({
  page,
}) => {
  for (const width of [390, 768, 1366, 1920]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/admin/home')
    await page.getByRole('button', { name: 'Carrusel principal' }).click()
    await expect(page.locator('.admin-home-hero-preview')).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
    await page.screenshot({ path: `artifacts/admin-home-hero-${width}.png` })
    await page.getByRole('button', { name: 'Video editorial' }).click()
    await expect(page.locator('.admin-home-film-preview')).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
    await page.screenshot({ path: `artifacts/admin-home-film-${width}.png` })
    await page
      .getByRole('button', { name: 'Para él, para ella y unisex' })
      .click()
    await expect(page.locator('.admin-home-category-preview')).toBeVisible()
    await page.screenshot({
      path: `artifacts/admin-home-categories-${width}.png`,
    })
    await page.getByRole('button', { name: 'Destacados', exact: true }).click()
    await expect(
      page.getByRole('searchbox', { name: /Buscar un producto/ }),
    ).toBeVisible()
    await page.screenshot({
      path: `artifacts/admin-home-featured-${width}.png`,
    })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)

    await page.goto('/admin/productos/nuevo')
    await expect(page.locator('.admin-product-upload-area')).toBeVisible()
    await page.locator('.admin-product-upload-area').scrollIntoViewIfNeeded()
    await page.screenshot({
      path: `artifacts/admin-product-upload-${width}.png`,
    })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
  }
})
