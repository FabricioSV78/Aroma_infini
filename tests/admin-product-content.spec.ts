import { expect, test } from '@playwright/test'

test('el editor ordena y quita fotografías sin pedir encuadre ni desincronizar la principal', async ({
  page,
}) => {
  await page.goto('/admin/productos/cedre')
  const photos = page.locator('.admin-product-upload-item')
  const originalMain = await photos.nth(0).locator('img').getAttribute('src')
  const originalSecond = await photos.nth(1).locator('img').getAttribute('src')

  await page.getByRole('button', { name: 'Mover foto 2 antes' }).click()
  await expect(photos.nth(0).locator('img')).toHaveAttribute(
    'src',
    originalSecond ?? '',
  )
  await expect(page.getByLabel(/Encuadre de foto/)).toHaveCount(0)
  await photos
    .nth(0)
    .getByRole('button', { name: 'Quitar', exact: true })
    .click()
  await expect(photos.nth(0).locator('img')).toHaveAttribute(
    'src',
    originalMain ?? '',
  )
  await expect(page.getByLabel('Foto predefinida (opcional)')).toHaveCount(0)

  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page).toHaveURL(/guardado=1/)
  await page.getByRole('link', { name: 'Editar Bois Clair' }).click()
  await expect(page.locator('.admin-product-upload-item')).toHaveCount(3)
  await expect(
    page.locator('.admin-product-upload-item').first().locator('img'),
  ).toHaveAttribute('src', originalMain ?? '')
})

test('la fotografía olfativa y los relacionados se editan por perfume sin campo de concentración', async ({
  page,
}) => {
  await page.goto('/admin/productos/cedre')
  await expect(
    page.getByRole('combobox', { name: 'Tipo de perfume', exact: true }),
  ).toHaveCount(0)
  await page
    .getByLabel('Subir imagen del perfil olfativo')
    .setInputFiles('public/images/olfactory-petale.webp')
  await expect(
    page.locator('.admin-olfactory-image-control > img'),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)

  await page.locator('.admin-related-products > summary').click()
  await page.getByRole('checkbox', { name: /Vert Silence/ }).uncheck()
  await page.getByRole('checkbox', { name: /Figue Douce/ }).check()
  await expect(page.locator('.admin-related-products > summary')).toContainText(
    '4 de 4',
  )

  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page).toHaveURL(/guardado=1/)
  await page.getByRole('link', { name: 'Editar Bois Clair' }).click()
  await expect(
    page.getByRole('combobox', { name: 'Tipo de perfume' }),
  ).toHaveCount(0)
  await expect(
    page.locator('.admin-olfactory-image-control > img'),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await page.locator('.admin-related-products > summary').click()
  await expect(
    page.getByRole('checkbox', { name: /Figue Douce/ }),
  ).toBeChecked()
  await expect(
    page.getByRole('checkbox', { name: /Vert Silence/ }),
  ).not.toBeChecked()

  await page.getByRole('link', { name: 'Ver tienda', exact: true }).click()
  await page
    .locator('.bestsellers-section a[href="/producto/bois-clair"]')
    .first()
    .click()
  await expect(page.locator('.product-kind')).not.toContainText(
    /Eau de|Extrait de|Parfum/i,
  )
  await page
    .locator('.product-info-tabs')
    .getByRole('button', { name: 'Familia olfativa' })
    .click()
  await expect(page.locator('.olfactory-profile-visual img')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  await expect(page.locator('.product-recommendations')).toContainText(
    'Figue Douce',
  )
  await page
    .locator('.product-recommendations a[href="/producto/petale-nu"]')
    .first()
    .click()
  await page
    .locator('.product-info-tabs')
    .getByRole('button', { name: 'Familia olfativa' })
    .click()
  await expect(
    page.locator('.olfactory-profile-visual img'),
  ).not.toHaveAttribute('src', /^data:image\/webp;base64,/)
})
