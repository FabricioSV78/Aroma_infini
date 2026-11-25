import { expect, test } from './test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window)
    window.matchMedia = (query) => {
      const media = original(query)
      if (query === '(display-mode: standalone)')
        Object.defineProperty(media, 'matches', { value: true })
      return media
    }
  })
})

for (const width of [390, 1440]) {
  test(`reabrir la PWA a ${width}px inicia Resumen; navegar, volver de otra app y recargar conserva el trabajo`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/admin/productos')
    await expect(page).toHaveURL('/admin/resumen')
    await expect(
      page.getByRole('heading', { name: 'Resumen del negocio', exact: true }),
    ).toBeVisible()
    if (width < 1200)
      await page
        .getByRole('button', { name: /Abrir.*menú|Abrir.*navegación/i })
        .click()
    await page
      .locator('.admin-sidebar')
      .getByRole('link', { name: 'Productos', exact: true })
      .click()
    await expect(page).toHaveURL('/admin/productos')
    await expect(
      page.getByRole('heading', { name: 'Productos', exact: true }),
    ).toBeVisible()
    await page.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(
        new PageTransitionEvent('pageshow', { persisted: true }),
      )
    })
    await expect(page).toHaveURL('/admin/productos')
    await page.reload()
    await expect(page).toHaveURL('/admin/productos')
    await expect(
      page.getByRole('heading', { name: 'Productos', exact: true }),
    ).toBeVisible()
    await page.goto('/admin/productos')
    await expect(page).toHaveURL('/admin/resumen')
  })
}

test('la notificación abre su pedido una sola vez y reabrir normalmente vuelve a Resumen', async ({
  page,
}) => {
  await page.goto('/admin/pedidos/AI-210926-01?adminLaunch=notification')
  await expect(page).toHaveURL('/admin/pedidos/AI-210926-01')
  await expect(
    page.getByRole('heading', { name: 'Detalle del pedido', exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(page).toHaveURL('/admin/pedidos/AI-210926-01')
  await page.goto('/admin/pedidos/AI-210926-01')
  await expect(page).toHaveURL('/admin/resumen')
})

test.describe('sin autorización', () => {
  test.use({ authMode: 'anonymous' })
  test('la señal de notificación no concede acceso al detalle protegido', async ({
    page,
  }) => {
    await page.goto('/admin/pedidos/AI-210926-01?adminLaunch=notification')
    await expect(page).toHaveURL(
      '/admin/login?returnTo=%2Fadmin%2Fpedidos%2FAI-210926-01',
    )
    await expect(page.locator('.admin-shell')).toHaveCount(0)
  })
})
