import { expect, test } from '@playwright/test'
import { persistedAdminState } from './product-import-fixtures'

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

test('las familias para filtros permiten selección múltiple y dejar el producto sin clasificar', async ({
  page,
}) => {
  await page.goto('/admin/productos/cedre')
  const woody = page.getByRole('checkbox', { name: 'Amaderada' })
  const floral = page.getByRole('checkbox', { name: 'Floral' })
  const profile = page.getByRole('textbox', { name: 'Perfil aromático breve' })
  await expect(woody).toBeChecked()
  await floral.check()
  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page).toHaveURL(/guardado=1/)
  await page.goto('/tienda?familia=floral')
  await expect(
    page.locator('.product-card', { hasText: 'Bois Clair' }),
  ).toBeVisible()
  await page.goto('/admin/productos/cedre')
  await expect(woody).toBeChecked()
  await expect(floral).toBeChecked()

  await woody.uncheck()
  await expect(
    page.getByText('Las familias seleccionadas no coinciden'),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page.locator('.admin-notice-dialog')).toContainText(
    'no coincide con el perfil aromático breve',
  )
  await page
    .getByRole('button', { name: 'Volver a editar', exact: true })
    .click()
  await profile.fill('Floral · fresco')
  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page).toHaveURL(/guardado=1/)
  await page.goto('/admin/productos/cedre')
  await expect(floral).toBeChecked()
  await expect(woody).not.toBeChecked()

  await floral.uncheck()
  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page).toHaveURL(/guardado=1/)
  await page.goto('/admin/productos/cedre')
  await expect(floral).not.toBeChecked()
  await expect(profile).toHaveValue('Floral · fresco')
})

test('cambiar la foto principal conserva las fotos secundarias subidas', async ({
  page,
}) => {
  await page.goto('/admin/productos/cedre')
  await page
    .getByLabel('Reemplazar vista 2 del producto')
    .setInputFiles('public/images/petale-960.webp')
  const secondPhoto = page.locator('.admin-product-upload-item > img').nth(1)
  await expect(secondPhoto).toHaveAttribute('src', /^data:image\/webp;base64,/)
  const secondarySource = await secondPhoto.getAttribute('src')
  await page
    .getByLabel('Reemplazar foto principal del producto', { exact: true })
    .setInputFiles('public/images/sillage-960.webp')
  await expect(
    page.locator('.admin-product-upload-item > img').first(),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await expect(secondPhoto).toHaveAttribute('src', secondarySource!)
})

test('los espacios vacíos permiten guardar el progreso de fotografías como borrador', async ({
  page,
}) => {
  await page.goto('/admin/productos/nuevo')
  await page
    .getByRole('textbox', { name: 'Nombre', exact: true })
    .fill('Rosa Clara')
  await page
    .getByRole('textbox', { name: 'Perfil aromático breve' })
    .fill('Floral')
  await page
    .getByLabel('Subir foto principal del producto', { exact: true })
    .setInputFiles('public/images/petale-960.webp')
  await expect(
    page.locator('.admin-product-upload-item > img'),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await expect(page.locator('.admin-product-upload-item')).toHaveCount(4)
  await expect(page.locator('.admin-product-upload-item').last()).toContainText(
    'Sin imagen',
  )
  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page).toHaveURL(/guardado=1/)
  const saved = (await persistedAdminState(page)).products.find(
    ({ product }) => product.slug === 'rosa-clara',
  )!
  expect(saved.detail.gallery).toHaveLength(1)
  expect(saved.active).toBe(false)
  expect(saved.detail.olfactoryImage).toBeNull()
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

test('El formulario y su vista previa modal se adaptan a cuatro tamaños y cierran con Escape', async ({
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
    await page.goto('/admin/productos/cedre')
    const name = page.getByRole('textbox', { name: 'Nombre', exact: true })
    const slug = page.getByRole('textbox', { name: 'URL del producto' })
    const heights = await Promise.all([
      name.evaluate((element) => element.getBoundingClientRect().height),
      slug.evaluate((element) => element.getBoundingClientRect().height),
    ])
    expect(Math.abs(heights[0] - heights[1])).toBeLessThan(1)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `artifacts/admin-product-preview/form-${viewport.name}.png`,
    })

    const open = page.getByRole('button', { name: 'Vista previa', exact: true })
    await open.click()
    const dialog = page.getByRole('dialog', {
      name: 'Vista previa del producto',
    })
    await expect(dialog).toBeVisible()
    expect(
      await dialog.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return (
          bounds.left >= 0 &&
          bounds.right <= innerWidth + 1 &&
          bounds.top >= 0 &&
          bounds.bottom <= innerHeight + 1
        )
      }),
    ).toBe(true)
    await page.screenshot({
      path: `artifacts/admin-product-preview/modal-${viewport.name}.png`,
    })
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
  }
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
  await expect(page.locator('.olfactory-profile-visual')).toBeVisible()
  await page.getByLabel('Resumen de la ficha').fill('Un floral para cada día.')
  await page
    .getByRole('textbox', { name: 'Descripción', exact: true })
    .fill('Descripción completa del perfume.')
  await expect(page.locator('.admin-evolution-preview')).toHaveText(
    'Mandarina · Peonía · Almizcle blanco',
  )
  await page.getByRole('button', { name: 'Vista previa', exact: true }).click()
  await expect(
    page.getByRole('dialog', { name: 'Vista previa del producto' }),
  ).toContainText('Un floral para cada día.')
  await page
    .getByRole('dialog', { name: 'Vista previa del producto' })
    .getByRole('button', { name: 'Cerrar' })
    .click()
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
  await page
    .locator('.product-info-tabs')
    .getByRole('button', { name: 'Familia olfativa', exact: true })
    .click()
  await expect(page.locator('.olfactory-profile-visual')).toBeVisible()
  await page
    .locator('.product-info-tabs')
    .getByRole('button', { name: 'Descripción', exact: true })
    .click()
  await expect(page.locator('.product-description-copy')).toHaveText(
    'Descripción completa del perfume.',
  )
})
