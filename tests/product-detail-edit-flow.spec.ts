import { expect, test } from '@playwright/test'

test('el borrador muestra la ficha completa sin publicar cambios y luego se refleja al guardar', async ({
  page,
}) => {
  await page.goto('/admin/productos/cedre')
  const published = await page.context().newPage()
  await published.goto('/producto/bois-clair')
  await expect(published.locator('#product-title')).toHaveText('Bois Clair')

  await page
    .getByRole('textbox', { name: 'Nombre', exact: true })
    .fill('Bois Clair Editado')
  await page
    .getByLabel('Resumen de la ficha')
    .fill('Un perfil amaderado editado para esta ficha.')
  await page
    .getByRole('textbox', { name: 'Descripción', exact: true })
    .fill('Descripción editorial actualizada para este perfume.')
  await page
    .locator('.admin-variant-list fieldset')
    .first()
    .getByLabel('Precio (S/)')
    .fill('360')
  await page.getByRole('button', { name: 'Mover foto 2 antes' }).click()
  await page
    .getByLabel('Subir imagen del perfil olfativo')
    .setInputFiles('public/images/olfactory-iris.webp')
  await expect(
    page.locator('.admin-olfactory-image-control img'),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)

  await page.getByRole('button', { name: 'Vista previa', exact: true }).click()
  const preview = page.getByRole('dialog', {
    name: 'Vista previa del producto',
  })
  await expect(preview.locator('#product-title')).toHaveText(
    'Bois Clair Editado',
  )
  await expect(preview.locator('.product-lead')).toHaveText(
    'Un perfil amaderado editado para esta ficha.',
  )
  await expect(preview.locator('.product-gallery')).toBeVisible()
  await expect(
    preview.locator('.product-gallery-frame.is-active img'),
  ).toHaveAttribute('src', '/images/cedre-alternate-480.webp')
  await expect(preview.locator('.product-variants')).toContainText('50 ml')
  await expect(preview.locator('.product-selected-price')).toContainText('S/ 360')
  await preview
    .locator('.product-info-tabs')
    .getByRole('button', { name: 'Familia olfativa' })
    .click()
  await expect(
    preview.locator('.olfactory-profile-visual img'),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await preview
    .locator('.product-info-tabs')
    .getByRole('button', { name: 'Descripción' })
    .click()
  await expect(preview.locator('.product-description-copy')).toHaveText(
    'Descripción editorial actualizada para este perfume.',
  )
  await preview
    .locator('.product-info-tabs')
    .getByRole('button', { name: 'Reseñas' })
    .click()
  await expect(preview.locator('.product-reviews-preview')).toBeVisible()
  await expect(
    preview.getByRole('button', { name: 'Escribir una reseña' }),
  ).toHaveCount(0)

  await published.reload()
  await expect(published.locator('#product-title')).toHaveText('Bois Clair')
  await expect(published.locator('.product-selected-price')).toContainText('S/ 390')
  await expect(
    published.locator('.product-gallery-frame.is-active img'),
  ).toHaveAttribute('src', '/images/cedre-480.webp')
  await published
    .locator('.product-info-tabs')
    .getByRole('button', { name: 'Familia olfativa' })
    .click()
  await expect(
    published.locator('.olfactory-profile-visual img'),
  ).toHaveAttribute('src', '/images/olfactory-cedre.webp')

  await page.keyboard.press('Escape')
  await expect(preview).not.toBeVisible()
  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page).toHaveURL(/guardado=1/)
  await published.reload()
  await expect(published.locator('#product-title')).toHaveText(
    'Bois Clair Editado',
  )
  await expect(published.locator('.product-selected-price')).toContainText('S/ 360')
  await expect(
    published.locator('.product-gallery-frame.is-active img'),
  ).toHaveAttribute('src', '/images/cedre-alternate-480.webp')
  await published
    .locator('.product-info-tabs')
    .getByRole('button', { name: 'Familia olfativa' })
    .click()
  await expect(
    published.locator('.olfactory-profile-visual img'),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)

  await published.goto('/producto/petale-nu')
  await published
    .locator('.product-info-tabs')
    .getByRole('button', { name: 'Familia olfativa' })
    .click()
  await expect(
    published.locator('.olfactory-profile-visual img'),
  ).toHaveAttribute('src', '/images/olfactory-petale.webp')
})

test('un producto nuevo sin fotografías tiene una vista previa segura', async ({ page }) => {
  await page.goto('/admin/productos/nuevo')
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click()
  const preview = page.getByRole('dialog', { name: 'Vista previa del producto' })
  await expect(preview.locator('.product-gallery--empty')).toBeVisible()
  await expect(preview.locator('.product-popularity-preview')).toHaveCount(0)
  await expect(preview.locator('.product-gallery img')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(preview).not.toBeVisible()
})

test('la ficha pública y su vista previa son legibles en cuatro tamaños de pantalla', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const viewport of [
    { name: 'desktop', width: 1920, height: 1080 },
    { name: 'laptop', width: 1366, height: 768 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/producto/bois-clair')
    await expect(page.locator('#product-title')).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await page.locator('.product-page img').evaluateAll(async (elements) => {
      const images = elements as HTMLImageElement[]
      images.forEach((image) => {
        image.loading = 'eager'
      })
      await Promise.all(images.map((image) => image.decode().catch(() => undefined)))
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 2,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `artifacts/product-detail/public-${viewport.name}.png`,
    })
    await page
      .locator('.product-info-tabs')
      .getByRole('button', { name: 'Familia olfativa' })
      .click()
    await page.locator('.olfactory-profile-card').scrollIntoViewIfNeeded()
    await page.screenshot({
      path: `artifacts/product-detail/family-${viewport.name}.png`,
    })

    await page.goto('/admin/productos/cedre')
    await page
      .getByRole('button', { name: 'Vista previa', exact: true })
      .click()
    const preview = page.getByRole('dialog', {
      name: 'Vista previa del producto',
    })
    await expect(preview.locator('#product-title')).toBeVisible()
    expect(
      await preview.evaluate(
        (dialog) => dialog.scrollWidth <= dialog.clientWidth + 2,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `artifacts/product-detail/preview-${viewport.name}.png`,
    })
    await preview
      .locator('.product-info-tabs')
      .getByRole('button', { name: 'Familia olfativa' })
      .click()
    await preview.locator('.olfactory-profile-card').scrollIntoViewIfNeeded()
    await page.screenshot({
      path: `artifacts/product-detail/preview-family-${viewport.name}.png`,
    })
    await page.keyboard.press('Escape')
    await expect(preview).not.toBeVisible()
  }
})
