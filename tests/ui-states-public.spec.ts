import { expect, test, type Page } from '@playwright/test'

type ControlledMethod = 'getCatalog' | 'getBrandPreviews' | 'suggest'
interface ReadControl {
  fail?: boolean
  wait?: boolean
  empty?: boolean
  calls?: number
  release?: () => void
}
declare global {
  interface Window {
    __publicReadControls?: Partial<Record<ControlledMethod, ReadControl>>
  }
}

/** Hold the real service promise to inspect pending UI; no app delays are added. */
async function controlReads(
  page: Page,
  controls: Partial<Record<ControlledMethod, ReadControl>> = {},
) {
  await page.addInitScript((initial) => {
    window.__publicReadControls = initial
  }, controls)
  await page.route(
    (url) => url.pathname === '/src/services/catalog-service.ts',
    async (route) => {
      const response = await route.fetch()
      await route.fulfill({
        response,
        body:
          (await response.text()) +
          `\nfor (const method of ['getCatalog', 'getBrandPreviews', 'suggest']) {
            const read = catalogService[method];
            catalogService[method] = async (...args) => {
              const controls = window.__publicReadControls ||= {};
              const control = controls[method] ||= {};
              control.calls = (control.calls || 0) + 1;
              if (control.wait) await new Promise(resolve => { control.release = resolve; });
              if (control.fail) throw new Error('Controlled read failure');
              const result = await read(...args);
              return control.empty
                ? method === 'getCatalog'
                  ? { ...result, items: [], total: 0, availableTotal: 0, pages: 1, page: 1 }
                  : []
                : result;
            };
          }`,
      })
    },
  )
}

test('Catálogo distingue falta de coincidencias y conserva una salida para limpiar filtros', async ({
  page,
}) => {
  await page.goto('/tienda?min=99999')
  const empty = page.locator('.catalog-results .ui-empty-state')
  await expect(empty.getByRole('heading')).toHaveText(
    'No encontramos coincidencias',
  )
  await empty.getByRole('button', { name: 'Limpiar filtros' }).click()
  await expect(page).toHaveURL('/tienda')
  await expect(page.locator('.product-grid .product-card')).toHaveCount(12)
})

test('Catálogo sin publicaciones no se presenta como una búsqueda sin coincidencias', async ({
  page,
}) => {
  await controlReads(page, { getCatalog: { empty: true } })
  await page.goto('/tienda')
  await expect(
    page.getByRole('heading', { name: 'No hay productos disponibles' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Limpiar filtros' }),
  ).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: 'Volver al inicio' }),
  ).toHaveAttribute('href', '/')
})

test('Cambiar orden conserva los productos durante una lectura pendiente real', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await controlReads(page)
  await page.goto('/tienda')
  await page.evaluate(() => document.fonts.ready)
  const cards = page.locator('.catalog-results .product-card')
  await expect(cards).toHaveCount(12)
  const firstBefore = await cards.first().textContent()
  const positionBefore = await cards.first().boundingBox()
  await page.evaluate(() => {
    window.__publicReadControls!.getCatalog!.wait = true
  })
  await page.getByLabel('Ordenar', { exact: true }).selectOption('precio-desc')
  await expect(
    page.getByText('Actualizando productos…', { exact: true }),
  ).toBeVisible()
  await expect(page.locator('.catalog-results')).toHaveAttribute(
    'aria-busy',
    'true',
  )
  await expect(cards).toHaveCount(12)
  await expect(cards.first()).toHaveText(firstBefore!)
  expect((await cards.first().boundingBox())?.y).toBe(positionBefore?.y)
  await expect(
    page.getByRole('button', { name: 'Aplicar filtros', exact: true }),
  ).toBeDisabled()
  await page.evaluate(() => {
    const control = window.__publicReadControls!.getCatalog!
    control.wait = false
    control.release!()
  })
  await expect(page.locator('.catalog-results')).toHaveAttribute(
    'aria-busy',
    'false',
  )
  await expect(cards.first()).toContainText('Santal Nuit')
})

test('Error de catálogo es recuperable y el reintento queda bloqueado mientras consulta', async ({
  page,
}) => {
  await controlReads(page, { getCatalog: { fail: true } })
  await page.goto('/tienda')
  await expect(page.getByRole('alert')).toContainText(
    'No se pudo consultar el catálogo',
  )
  const retry = page.getByRole('button', { name: 'Reintentar', exact: true })
  await page.evaluate(() => {
    const control = window.__publicReadControls!.getCatalog!
    control.fail = false
    control.wait = true
  })
  await retry.click()
  await expect(retry).toBeDisabled()
  await expect(
    page.getByText('Consultando productos…', { exact: true }),
  ).toBeVisible()
  await page.evaluate(() => {
    const control = window.__publicReadControls!.getCatalog!
    control.wait = false
    control.release!()
  })
  await expect(page.locator('.product-grid .product-card')).toHaveCount(12)
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(
    await page.evaluate(() => window.__publicReadControls!.getCatalog!.calls),
  ).toBe(2)
})

test('Directorio de marcas vacío ofrece una acción y no muestra un error', async ({
  page,
}) => {
  await controlReads(page, { getBrandPreviews: { empty: true } })
  await page.goto('/marcas')
  await expect(
    page.getByRole('heading', { name: 'No hay marcas disponibles' }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Volver al inicio' }),
  ).toHaveAttribute('href', '/')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('Marcas informa un error, bloquea reintentos simultáneos y recupera su directorio', async ({
  page,
}) => {
  await controlReads(page, { getBrandPreviews: { fail: true } })
  await page.goto('/marcas')
  await expect(page.getByRole('alert')).toContainText(
    'No pudimos cargar las marcas',
  )
  const retry = page.getByRole('button', { name: 'Reintentar', exact: true })
  await page.evaluate(() => {
    const control = window.__publicReadControls!.getBrandPreviews!
    control.fail = false
    control.wait = true
  })
  await retry.click()
  await expect(retry).toBeDisabled()
  await expect(page.locator('.brands-directory')).toHaveAttribute(
    'aria-busy',
    'true',
  )
  await page.evaluate(() => {
    const control = window.__publicReadControls!.getBrandPreviews!
    control.wait = false
    control.release!()
  })
  await expect(page.locator('.brands-directory > a')).toHaveCount(4)
  expect(
    await page.evaluate(
      () => window.__publicReadControls!.getBrandPreviews!.calls,
    ),
  ).toBe(2)
})

test('Búsqueda diferencia carga pendiente, fallo recuperable y respuesta sin coincidencias', async ({
  page,
}) => {
  await controlReads(page, { suggest: { wait: true, fail: true } })
  await page.goto('/tienda')
  await page.getByRole('button', { name: 'Buscar perfumes' }).click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByText('Buscando productos…', { exact: true }),
  ).toBeVisible()
  await expect(dialog.locator('.search-suggestions')).toHaveAttribute(
    'aria-busy',
    'true',
  )
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(window.__publicReadControls!.suggest!.release),
      ),
    )
    .toBe(true)
  await page.evaluate(() => {
    const control = window.__publicReadControls!.suggest!
    control.wait = false
    control.release!()
  })
  await expect(dialog.getByRole('alert')).toContainText(
    'No pudimos cargar las sugerencias',
  )
  await page.evaluate(() => {
    window.__publicReadControls!.suggest!.fail = false
  })
  await dialog.getByRole('button', { name: 'Reintentar' }).click()
  await expect(dialog.locator('.search-suggestions li')).toHaveCount(5)
  await dialog.getByLabel('Producto o marca').fill('sincoincidencias')
  await expect(
    dialog.getByRole('heading', { name: 'No encontramos coincidencias' }),
  ).toBeVisible()
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await expect(
    dialog.getByRole('link', { name: 'Ver todos los resultados' }),
  ).toHaveAttribute('href', '/buscar?q=sincoincidencias')
})

for (const size of [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`Carrito y favoritos vacíos tienen una acción clara y sin desbordamientos en ${size.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    for (const [path, title] of [
      ['/carrito', 'Tu carrito está vacío'],
      ['/favoritos', 'Tu próxima elección empieza aquí'],
    ]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: title })).toBeVisible()
      const action = page
        .locator('main')
        .getByRole('link', { name: 'Explorar tienda' })
      await expect(action).toBeVisible()
      await action.focus()
      await expect(action).toBeFocused()
      expect(
        await action.evaluate((node) => node.getBoundingClientRect().height),
      ).toBeGreaterThanOrEqual(44)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      await page.screenshot({
        path: testInfo.outputPath(`${path.slice(1)}-${size.name}.png`),
        fullPage: true,
      })
    }
    await page.getByRole('button', { name: 'Carrito', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: 'Tu carrito', exact: true })
    await expect(
      drawer.getByRole('heading', { name: 'Tu carrito está vacío' }),
    ).toBeVisible()
    await expect(
      drawer.getByRole('link', { name: 'Explorar tienda' }),
    ).toHaveClass(/button--primary/)
    await drawer.getByRole('link', { name: 'Explorar tienda' }).click()
    await expect(page).toHaveURL('/tienda')
    await expect(drawer).not.toBeVisible()
  })
}

test('Favoritos no disponibles se pueden retirar y conservan un acceso a la tienda', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'aroma-infini:favorites:v1',
      JSON.stringify({ version: 1, ids: ['missing-product'] }),
    )
  })
  await page.goto('/favoritos')
  const unavailable = page.locator('.favorite-unavailable')
  await expect(unavailable).toContainText('Un favorito ya no está disponible')
  await expect(
    unavailable.getByRole('link', { name: 'Explorar tienda' }),
  ).toHaveAttribute('href', '/tienda')
  await unavailable
    .getByRole('button', { name: 'Retirar selección no disponible' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Tu próxima elección empieza aquí' }),
  ).toBeVisible()
})
