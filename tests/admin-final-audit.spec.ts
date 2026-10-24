import { expect, test, type Page } from '@playwright/test'

const viewports = [
  { name: 'monitor grande', width: 1920, height: 1080 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'desktop mediano', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'móvil', width: 390, height: 844 },
] as const

const routes = [
  ['Dashboard', '/admin'],
  ['Productos', '/admin/productos'],
  ['Agregar producto', '/admin/productos/nuevo'],
  ['Editar producto', '/admin/productos/cedre'],
  ['Pedidos', '/admin/pedidos'],
  ['Detalle del pedido', '/admin/pedidos/AI-210926-01'],
  ['Clientes', '/admin/clientes'],
  ['Marcas', '/admin/marcas'],
  ['Promociones', '/admin/promociones'],
  ['Envíos', '/admin/envios'],
  ['Gestión del Home', '/admin/home'],
] as const

async function expectNoHorizontalOverflow(page: Page, context: string) {
  const widths = await page.evaluate(() => ({
    content: Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    ),
    viewport: document.documentElement.clientWidth,
  }))
  expect(
    widths.content,
    `${context}: ${JSON.stringify(widths)}`,
  ).toBeLessThanOrEqual(widths.viewport + 1)
}

async function visitAdmin(page: Page, path: string) {
  await page.goto(path)
  await expect(page.locator('#admin-content h1')).toBeVisible()
  await page.evaluate(() => document.fonts.ready.then(() => true))
}

for (const viewport of viewports) {
  test(`Todas las interfaces administrativas caben en ${viewport.name} (${viewport.width} × ${viewport.height})`, async ({
    page,
  }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })

    for (const [name, path] of routes) {
      await visitAdmin(page, path)
      await expectNoHorizontalOverflow(page, `${name} a ${viewport.width}px`)
    }
  })

  test(`Los estados abiertos conservan navegación y distribución en ${viewport.name}`, async ({
    page,
  }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })

    await visitAdmin(page, '/admin/productos')
    await page.locator('.admin-product-import > summary').click()
    await expect(page.locator('.admin-product-import')).toHaveAttribute(
      'open',
      '',
    )
    await expect(
      page.getByRole('button', { name: 'Descargar plantilla .xlsx' }),
    ).toBeVisible()
    await expectNoHorizontalOverflow(
      page,
      `Importación abierta a ${viewport.width}px`,
    )

    await visitAdmin(page, '/admin/home')
    for (const name of [
      'Franja superior',
      'Para él, para ella y unisex',
      'Video editorial',
      'Encuentra tu perfume ideal',
    ]) {
      const tab = page.getByRole('button', { name, exact: true })
      await tab.click()
      await expect(tab).toHaveAttribute('aria-pressed', 'true')
      await expectNoHorizontalOverflow(page, `${name} a ${viewport.width}px`)
    }
    await page.getByRole('button', { name: 'Preguntas y opciones' }).click()
    await expect(
      page.getByRole('combobox', { name: 'Paso del cuestionario' }),
    ).toBeVisible()
    await expectNoHorizontalOverflow(
      page,
      `Opciones del recomendador a ${viewport.width}px`,
    )
    await page.getByRole('button', { name: 'Resultados' }).click()
    await expectNoHorizontalOverflow(
      page,
      `Resultados del recomendador a ${viewport.width}px`,
    )

    await visitAdmin(page, '/admin/pedidos/AI-210926-01')
    await page.locator('.admin-shipping-summary-panel > summary').click()
    await expect(page.locator('.admin-shipping-sheet')).toBeVisible()
    await page.getByRole('button', { name: /datos de entrega/ }).click()
    await expect(page.locator('.admin-delivery-editor')).toBeVisible()
    await expectNoHorizontalOverflow(
      page,
      `Pedido con editor de entrega a ${viewport.width}px`,
    )

    await visitAdmin(page, '/admin/envios')
    const tariffs = page.locator('.admin-shipping-row')
    const previousTariffs = await tariffs.count()
    await page
      .getByRole('button', { name: 'Agregar tarifa por distrito' })
      .click()
    await expect(tariffs).toHaveCount(previousTariffs + 1)
    await expectNoHorizontalOverflow(
      page,
      `Editor de tarifa a ${viewport.width}px`,
    )
  })
}

for (const viewport of viewports.filter(({ width }) => width <= 768)) {
  test(`El menú administrativo móvil se abre y devuelve el foco en ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await visitAdmin(page, '/admin')
    const openMenu = page.getByRole('button', {
      name: 'Abrir menú administrativo',
    })
    await openMenu.click()
    await expect(
      page.getByRole('dialog', { name: 'Menú administrativo' }),
    ).toBeVisible()
    await expectNoHorizontalOverflow(page, `Menú abierto a ${viewport.width}px`)
    await page.keyboard.press('Escape')
    await expect(openMenu).toBeFocused()
  })
}
