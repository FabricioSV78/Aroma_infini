import { expect, test } from '@playwright/test'

test('El resumen evita acciones repetidas y abre el trabajo editorial', async ({
  page,
}) => {
  await page.goto('/admin')

  const shortcuts = page.getByRole('region', { name: 'Crear y editar' })
  await expect(
    shortcuts.getByRole('link', { name: 'Nuevo producto' }),
  ).toBeVisible()
  await shortcuts
    .getByRole('link', { name: 'Editar contenido del Home' })
    .click()
  await expect(page).toHaveURL('/admin/home')
  await expect(
    page.getByRole('heading', { name: 'Home', exact: true }),
  ).toBeVisible()
})

test('La edición del Home informa si hay cambios y explica una búsqueda sin resultados', async ({
  page,
}) => {
  await page.goto('/admin/home')
  await expect(
    page.getByRole('button', { name: 'Carrusel principal' }),
  ).toHaveAttribute('aria-pressed', 'true')
  const savebar = page.locator('.admin-home-savebar')
  await expect(savebar).toContainText('Todo guardado')

  await page.getByRole('button', { name: 'Destacados', exact: true }).click()
  await page
    .getByRole('searchbox', { name: /Buscar un producto/ })
    .fill('fragancia-que-no-existe')
  await expect(
    page.getByText('No hay productos con ese nombre o marca.'),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Video editorial' }).click()
  await page
    .getByRole('textbox', { name: 'Etiqueta superior' })
    .fill('Nuestro ritual')
  await expect(savebar).toContainText('Cambios sin guardar')
  await page.getByRole('button', { name: 'Guardar cambios del Home' }).click()
  await expect(savebar).toContainText('Todo guardado')
  await expect(savebar).toContainText('Cambios guardados')
})

test('El editor de envíos mantiene el importe vacío, permite deshacer y comunica el guardado', async ({
  page,
}) => {
  await page.goto('/admin/envios')
  const fee = page.getByLabel('Tarifa base de courier (S/)')
  const footer = page.locator('.admin-shipping-footer')
  await expect(footer).toContainText('Todo guardado')

  await fee.fill('')
  await expect(fee).toHaveValue('')
  await expect(footer).toContainText('Cambios sin guardar')
  await page.getByRole('button', { name: 'Guardar configuración' }).click()
  await expect(fee).toBeFocused()
  await fee.fill('38')

  const before = await page.locator('.admin-shipping-row').count()
  await page.locator('.admin-shipping-row').first().click()
  await page.getByRole('button', { name: 'Quitar excepción' }).click()
  await expect(page.locator('.admin-shipping-row')).toHaveCount(before - 1)
  await footer.getByRole('button', { name: 'Deshacer eliminación' }).click()
  await expect(page.locator('.admin-shipping-row')).toHaveCount(before)

  await page.getByRole('button', { name: 'Guardar configuración' }).click()
  await expect(footer).toContainText('Todo guardado')
  await expect(footer).toContainText('Configuración aplicada a la tienda.')
})

test('Las pantallas de gestión no desbordan en anchos de escritorio, laptop, tablet y móvil', async ({
  page,
}) => {
  for (const width of [1600, 1280, 820, 390]) {
    await page.setViewportSize({ width, height: 900 })
    for (const route of ['/admin', '/admin/home', '/admin/envios']) {
      await page.goto(route)
      const documentWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      )
      expect(documentWidth, `${route} a ${width}px`).toBeLessThanOrEqual(width)
    }
  }
})
