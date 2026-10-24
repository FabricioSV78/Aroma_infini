import { expect, test, type Page } from '@playwright/test'

test('la navegación del panel indica la carga del módulo sin vaciar la pantalla actual', async ({
  page,
}) => {
  await page.route(
    (url) => url.pathname === '/src/features/admin/AdminOperations.tsx',
    async (route) => {
      const response = await route.fetch()
      await route.fulfill({
        response,
        body:
          (await response.text()) +
          '\nawait new Promise(resolve => { window.__resumeAdminPage = resolve; });',
      })
    },
  )
  await page.goto('/admin')
  await expect(page.locator('.admin-page h1')).toHaveText('Resumen del negocio')
  await page.getByRole('link', { name: 'Clientes', exact: true }).click()
  await expect(page.locator('.ui-navigation-status')).toHaveAttribute(
    'role',
    'status',
  )
  await expect(page.locator('.admin-page h1')).toHaveText('Resumen del negocio')
  await page.waitForFunction(
    () =>
      typeof (window as unknown as { __resumeAdminPage?: () => void })
        .__resumeAdminPage === 'function',
  )
  await page.evaluate(() =>
    (
      window as unknown as { __resumeAdminPage: () => void }
    ).__resumeAdminPage(),
  )
  await expect(page.locator('.admin-page h1')).toHaveText('Clientes')
  await expect(page.locator('.ui-navigation-status')).not.toHaveAttribute(
    'role',
    'status',
  )
})

async function controlCatalog(
  page: Page,
  method: 'getCatalog' | 'getProduct',
  fail = false,
) {
  await page.addInitScript((fail) => {
    Object.assign(window, { __loadingRead: { hold: !fail, fail, calls: 0 } })
  }, fail)
  await page.route(
    (url) => url.pathname === '/src/services/catalog-service.ts',
    async (route) => {
      const response = await route.fetch()
      await route.fulfill({
        response,
        body:
          (await response.text()) +
          `
      const originalRead = catalogService.${method};
      catalogService.${method} = async (...args) => {
        const control = window.__loadingRead;
        control.calls++;
        if (control.hold) await new Promise(resolve => { control.release = resolve; });
        if (control.fail) throw new Error('Controlled read error');
        return originalRead(...args);
      };`,
      })
    },
  )
}

test('la carga inicial del catálogo reserva contenido y termina al resolver la consulta', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await controlCatalog(page, 'getCatalog')
  await page.goto('/tienda', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.ui-loading-page')).toHaveAttribute(
    'aria-busy',
    'true',
  )
  await expect(page.getByRole('status')).toContainText('Cargando productos')
  await expect(page.locator('.ui-loading-cards .ui-loading-card')).toHaveCount(
    6,
  )
  const placeholder = await page
    .locator('.ui-loading-card')
    .first()
    .boundingBox()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
  await page.evaluate(() => {
    const control = (
      window as unknown as {
        __loadingRead: { hold: boolean; release: () => void }
      }
    ).__loadingRead
    control.hold = false
    control.release()
  })
  await expect(page.locator('.ui-loading-page')).toHaveCount(0)
  await expect(page.locator('.product-grid .product-card')).toHaveCount(12)
  expect(
    (await page.locator('.product-grid .product-card').first().boundingBox())
      ?.width,
  ).toBeCloseTo(placeholder!.width, 0)
})

test('la ficha distingue error de producto inexistente y bloquea reintentos pendientes', async ({
  page,
}) => {
  await controlCatalog(page, 'getProduct', true)
  await page.goto('/producto/bois-clair')
  await expect(
    page.getByText('No pudimos cargar la ficha', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Producto no encontrado', { exact: true }),
  ).toHaveCount(0)
  await page.evaluate(() => {
    const control = (
      window as unknown as { __loadingRead: { hold: boolean; fail: boolean } }
    ).__loadingRead
    control.hold = true
    control.fail = false
  })
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  const pending = page.getByRole('button', {
    name: 'Cargando el producto…',
    exact: true,
  })
  await expect(pending).toBeDisabled()
  await pending.evaluate((button: HTMLButtonElement) => button.click())
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __loadingRead: { calls: number } })
          .__loadingRead.calls,
    ),
  ).toBe(2)
  await page.evaluate(() => {
    const control = (
      window as unknown as {
        __loadingRead: { hold: boolean; release: () => void }
      }
    ).__loadingRead
    control.hold = false
    control.release()
  })
  await expect(
    page.getByRole('heading', { name: 'Bois Clair', exact: true }),
  ).toBeVisible()
  await expect(pending).toHaveCount(0)
})

test('la carga estructurada respeta movimiento reducido y el ancho móvil', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 844 })
  await controlCatalog(page, 'getProduct')
  await page.goto('/producto/bois-clair', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.ui-loading-product')).toBeVisible()
  expect(
    await page
      .locator('.ui-skeleton')
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none')
  expect(
    await page
      .locator('.ui-spinner')
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})

test('una escritura de checkout pendiente bloquea duplicados y se recupera de un error inesperado', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'aroma-infini:cart:v1',
      JSON.stringify({
        version: 1,
        items: [{ variantId: 'cedre-50', quantity: 1 }],
      }),
    )
    Object.assign(window, { __checkoutWrite: { fail: true, calls: 0 } })
  })
  await page.route(
    (url) => url.pathname === '/src/services/checkout-service.ts',
    async (route) => {
      const response = await route.fetch()
      await route.fulfill({
        response,
        body:
          (await response.text()) +
          // Wrap the exported function in Vite's transformed module, preserving the real implementation.
          `\nconst checkoutWriteOriginal = persistDemoCheckout;
      persistDemoCheckout = async (...args) => {
        const control = window.__checkoutWrite;
        control.calls++;
        await new Promise(resolve => { control.release = resolve; });
        if (control.fail) throw new Error('Controlled write error');
        return checkoutWriteOriginal(...args);
      };`,
      })
    },
  )
  await page.goto('/checkout')
  await page.getByLabel('Nombre', { exact: true }).fill('María')
  await page.getByLabel('Apellido').fill('Rojas')
  await page.getByLabel('Correo electrónico').fill('maria@example.invalid')
  await page.getByLabel('Celular').fill('912345678')
  await page.getByRole('button', { name: 'Continuar a entrega' }).click()
  await page.getByLabel('Zona de entrega').selectOption('lima')
  await page.getByLabel('Distrito de entrega').selectOption('150122')
  await page
    .getByLabel('Dirección', { exact: true })
    .fill('Avenida de ejemplo 123')
  await page.getByRole('button', { name: 'Revisar selección' }).click()
  await page.getByRole('button', { name: 'Guardar selección' }).click()
  const pending = page.getByRole('button', { name: 'Procesando…', exact: true })
  await expect(pending).toBeDisabled()
  await expect(
    page.getByText('Guardando tu selección…', { exact: true }),
  ).toBeVisible()
  await page.locator('.checkout-promotion > summary').click()
  await expect(
    page.getByRole('textbox', { name: 'Código de descuento', exact: true }),
  ).toBeDisabled()
  await pending.evaluate((button: HTMLButtonElement) => button.click())
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __checkoutWrite: { calls: number } })
          .__checkoutWrite.calls,
    ),
  ).toBe(1)
  await page.evaluate(() =>
    (
      window as unknown as { __checkoutWrite: { release: () => void } }
    ).__checkoutWrite.release(),
  )
  await expect(page.getByRole('alert')).toContainText('Ocurrió un error')
  await expect(
    page.getByRole('button', { name: 'Reintentar', exact: true }),
  ).toBeEnabled()
  await page.evaluate(() => {
    ;(
      window as unknown as { __checkoutWrite: { fail: boolean } }
    ).__checkoutWrite.fail = false
  })
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(pending).toBeDisabled()
  await page.evaluate(() =>
    (
      window as unknown as { __checkoutWrite: { release: () => void } }
    ).__checkoutWrite.release(),
  )
  await expect(page).toHaveURL('/checkout/confirmacion')
})
