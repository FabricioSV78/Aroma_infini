import { expect, test } from '@playwright/test'

test('el editor facilita crear la URL y evita tamaños de presentación duplicados', async ({
  page,
}) => {
  await page.goto('/admin/productos/nuevo')
  const name = page.getByRole('textbox', { name: 'Nombre', exact: true })
  const slug = page.getByRole('textbox', { name: 'URL del producto' })
  await name.fill('Ébano & Rosa')
  await expect(slug).toHaveValue('ebano-rosa')
  await slug.fill('coleccion-ebano')
  await name.fill('Ébano & Rosa Intense')
  await expect(slug).toHaveValue('coleccion-ebano')

  await page.goto('/admin/productos/cedre')
  await page.getByRole('button', { name: 'Añadir presentación' }).click()
  await expect(
    page
      .locator('.admin-variant-list fieldset')
      .last()
      .getByLabel('Mililitros'),
  ).toHaveValue('150')
})

test('cambiar la foto principal conserva las fotos secundarias subidas', async ({
  page,
}) => {
  await page.goto('/admin/productos/cedre')
  await page
    .getByLabel('Subir vista 2 del producto')
    .setInputFiles('public/images/petale-960.webp')
  const secondPhoto = page.locator('.admin-product-upload-item > img').nth(1)
  await expect(secondPhoto).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await page.getByLabel('Foto predefinida (opcional)').selectOption('sillage')
  await expect(secondPhoto).toHaveAttribute('src', /^data:image\/webp;base64,/)
})

test('una vista nueva sin foto se identifica antes de guardar', async ({
  page,
}) => {
  await page.goto('/admin/productos/nuevo')
  await page
    .getByRole('textbox', { name: 'Nombre', exact: true })
    .fill('Rosa Clara')
  await page.getByRole('textbox', { name: 'Familia olfativa' }).fill('Floral')
  await page.getByLabel('Foto predefinida (opcional)').selectOption('petale')
  await page.getByRole('button', { name: 'Añadir otra foto' }).click()
  await expect(page.locator('.admin-product-upload-item').last()).toContainText(
    'Sin imagen',
  )
  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Sube una foto para cada vista añadida',
  )
  await expect(page).toHaveURL(/\/admin\/productos\/nuevo$/)
})

test('La vista previa no tapa las notas editables en escritorio', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/admin/productos/cedre')
  const heartNotes = page.getByLabel('Notas de corazón', { exact: true })
  await heartNotes.scrollIntoViewIfNeeded()
  expect(
    await heartNotes.evaluate((input) => {
      const box = input.getBoundingClientRect()
      const hovered = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      )
      return hovered === input || input.contains(hovered)
    }),
  ).toBe(true)
})

test('El perfil editable guarda lo que verá el cliente sin sobrescribir el resumen', async ({
  page,
}) => {
  await page.goto('/admin/productos/petale')
  await expect(page.locator('.olfactory-profile-visual')).toBeVisible()
  await page.getByLabel('Intensidad', { exact: true }).selectOption('3')
  await page.getByLabel('Temporada', { exact: true }).fill('Todo el año')
  await page
    .getByLabel('Notas de salida', { exact: true })
    .fill('Mandarina, Bergamota')
  await expect(page.locator('.olfactory-profile-visual')).toHaveCount(0)
  await page.getByLabel('Resumen de la ficha').fill('Un floral para cada día.')
  await page
    .getByRole('textbox', { name: 'Descripción', exact: true })
    .fill('Descripción completa del perfume.')
  await expect(page.locator('.admin-evolution-preview')).toHaveText(
    'Mandarina · Peonía · Almizcle blanco',
  )
  await expect(page.locator('.admin-product-live-preview')).toContainText(
    'Un floral para cada día.',
  )
  await expect(page.locator('.olfactory-meter')).toHaveAttribute(
    'data-level',
    '3',
  )
  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page).toHaveURL(/guardado=1/)
  // Navegar dentro de la aplicación conserva los datos de la demo en memoria.
  await page.getByRole('link', { name: 'Ver tienda', exact: true }).click()
  await page
    .locator('.bestsellers-section a[href="/producto/petale-nu"]')
    .first()
    .click()
  await expect(page.locator('.product-lead')).toHaveText(
    'Un floral para cada día.',
  )
  await expect(page.locator('.olfactory-profile-intensity')).toContainText(
    'Intensa',
  )
  await expect(page.locator('.olfactory-note-groups')).toContainText(
    'Notas de salida',
  )
  await expect(page.locator('.olfactory-note-groups')).toContainText(
    'Mandarina, Bergamota',
  )
  await expect(page.locator('.olfactory-note-groups')).toContainText(
    'Notas de corazón',
  )
  await expect(page.locator('.olfactory-note-groups')).toContainText(
    'Notas de fondo',
  )
  await expect(page.locator('.olfactory-profile-visual')).toHaveCount(0)
  await page
    .locator('.product-info-tabs')
    .getByRole('button', { name: 'Descripción', exact: true })
    .click()
  await expect(page.locator('.product-description-copy')).toHaveText(
    'Descripción completa del perfume.',
  )
})
