import { expect, test } from '@playwright/test'

test('El perfil editable guarda lo que verá el cliente sin sobrescribir el resumen', async ({
  page,
}) => {
  await page.goto('/admin/productos/petale')
  await page.getByLabel('Intensidad', { exact: true }).selectOption('3')
  await page.getByLabel('Temporada', { exact: true }).fill('Todo el año')
  await page
    .getByLabel('Notas de salida', { exact: true })
    .fill('Mandarina, Bergamota')
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
  await page.locator('.bestsellers-section a[href="/producto/petale-nu"]').first().click()
  await expect(page.locator('.product-lead')).toHaveText(
    'Un floral para cada día.',
  )
  await expect(page.locator('.olfactory-profile-intensity')).toContainText(
    'Intensa',
  )
  await expect(page.locator('.olfactory-note-groups')).toContainText('Notas de salida')
  await expect(page.locator('.olfactory-note-groups')).toContainText('Mandarina, Bergamota')
  await expect(page.locator('.olfactory-note-groups')).toContainText('Notas de corazón')
  await expect(page.locator('.olfactory-note-groups')).toContainText('Notas de fondo')
  await page.getByRole('tab', { name: 'Descripción', exact: true }).click()
  await expect(page.locator('.product-description-copy')).toHaveText(
    'Descripción completa del perfume.',
  )
})
