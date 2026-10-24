import { expect, test } from '@playwright/test'

test('El administrador quita y añade opciones reales, y gestiona importes del cuestionario', async ({
  page,
}) => {
  await page.goto('/admin/home')
  await page.getByRole('button', { name: 'Encuentra tu perfume ideal' }).click()
  await page.getByRole('button', { name: 'Preguntas y opciones' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(
    page
      .locator('.admin-home-finder-option-editor')
      .first()
      .getByRole('img', { name: 'Imagen actual de Amaderado' }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Respuesta sin preferencia' }),
  ).toBeVisible()
  await page.screenshot({
    path: 'artifacts/fragrance-finder/admin-options-mobile.png',
  })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
  await page.locator('.admin-home-finder-option-editor').first().screenshot({
    path: 'artifacts/fragrance-finder/admin-option-card-mobile.png',
  })
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/admin/home')
  await page.getByRole('button', { name: 'Encuentra tu perfume ideal' }).click()
  await page.getByRole('button', { name: 'Preguntas y opciones' }).click()
  await page.screenshot({
    path: 'artifacts/fragrance-finder/admin-options-desktop.png',
  })
  await page
    .getByRole('button', { name: 'Ocultar Floral del cuestionario' })
    .click()
  await expect(
    page.getByRole('button', { name: 'Mostrar Floral en el cuestionario' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Guardar cambios del Home' }).click()
  await expect(page.locator('.admin-home-savebar')).toContainText(
    'Todo guardado',
  )

  await page.goto('/')
  const finder = page.locator('#encuentra-tu-perfume')
  await expect(
    finder.getByRole('button', { name: 'Elegir Floral y añadir otros aromas' }),
  ).toHaveCount(0)
  await finder.getByRole('button', { name: 'Encontrar mi perfume' }).click()
  await expect(
    page.getByRole('dialog').getByRole('checkbox', { name: /Floral/ }),
  ).toHaveCount(0)

  await page.goto('/admin/home')
  await page.getByRole('button', { name: 'Encuentra tu perfume ideal' }).click()
  await page.getByRole('button', { name: 'Preguntas y opciones' }).click()
  await page
    .getByRole('button', { name: 'Mostrar Floral en el cuestionario' })
    .click()
  await expect(
    page.getByRole('button', { name: 'Ocultar Floral del cuestionario' }),
  ).toBeVisible()
  await page
    .getByRole('combobox', { name: 'Paso del cuestionario' })
    .selectOption('budget')
  await page.getByRole('button', { name: /Añadir importe/ }).click()
  await expect(
    page.getByRole('spinbutton', { name: 'Límite 4 (S/)' }),
  ).toHaveValue('750')
  await page.getByRole('button', { name: 'Guardar cambios del Home' }).click()
  await expect(page.locator('.admin-home-savebar')).toContainText(
    'Todo guardado',
  )

  await page.goto('/')
  await expect(
    finder.getByRole('button', { name: 'Elegir Floral y añadir otros aromas' }),
  ).toBeVisible()
  await finder.getByRole('button', { name: 'Encontrar mi perfume' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('checkbox', { name: /Floral/ })).toBeVisible()
  for (let step = 0; step < 3; step++) {
    await dialog.getByRole('checkbox', { name: 'Sin preferencia' }).check()
    await dialog.getByRole('button', { name: 'Continuar' }).click()
  }
  await expect(
    dialog.getByRole('radio', { name: 'Hasta S/ 750' }),
  ).toBeVisible()

  await page.goto('/admin/home')
  await page.getByRole('button', { name: 'Encuentra tu perfume ideal' }).click()
  await page.getByRole('button', { name: 'Preguntas y opciones' }).click()
  await page
    .getByRole('combobox', { name: 'Paso del cuestionario' })
    .selectOption('budget')
  await page.getByRole('button', { name: 'Quitar límite de S/ 750' }).click()
  await page.getByRole('button', { name: 'Guardar cambios del Home' }).click()
  await page.goto('/')
  await finder.getByRole('button', { name: 'Encontrar mi perfume' }).click()
  for (let step = 0; step < 3; step++) {
    await page
      .getByRole('dialog')
      .getByRole('checkbox', { name: 'Sin preferencia' })
      .check()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Continuar' })
      .click()
  }
  await expect(
    page.getByRole('dialog').getByRole('radio', { name: 'Hasta S/ 750' }),
  ).toHaveCount(0)
})
