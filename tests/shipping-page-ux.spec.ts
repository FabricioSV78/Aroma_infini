import { expect, test } from '@playwright/test'

const viewports = [
  { name: 'desktop-1920', width: 1920, height: 1080 },
  { name: 'laptop-1366', width: 1366, height: 768 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
] as const

for (const viewport of viewports) {
  test(`Envíos reúne tarifas y seguimiento sin desbordes · ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/envios')
    await page.evaluate(() => document.fonts.ready.then(() => true))

    await expect(page.locator('main h1')).toHaveText('Envíos y entregas')
    await expect(page.locator('.delivery-coverage')).toContainText(
      'Lima y Callao',
    )
    const rates = page.locator('.delivery-rate-group')
    await expect(rates).toHaveCount(1)
    await expect(rates.first()).toContainText('Lima y Callao')
    await expect(rates.first()).toContainText('S/ 20')
    await expect(rates.first()).toContainText('S/ 15')
    await expect(rates.first()).toContainText('Hasta 48 horas')
    await expect(page.locator('.delivery-free')).toContainText('S/ 450')
    await expect(page.locator('.delivery-note')).toContainText('tu distrito')
    await expect(page.locator('.shipping-journey')).toHaveCount(0)

    const followOrder = page.locator('.delivery-help').getByRole('link', {
      name: 'Seguir pedido',
      exact: false,
    })
    await expect(followOrder).toHaveAttribute('href', '/seguir-pedido')
    await expect(
      page.locator('.delivery-help').getByRole('link', {
        name: 'Consultar entrega',
        exact: false,
      }),
    ).toHaveAttribute('href', '/contacto')

    const geometry = await page.evaluate(() => {
      const content = document.querySelector<HTMLElement>('.delivery-sheet')
      const button = document.querySelector<HTMLElement>('.delivery-help-link')
      if (!content || !button) return null
      const contentRect = content.getBoundingClientRect()
      const buttonRect = button.getBoundingClientRect()
      return {
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        contentWithinViewport:
          contentRect.left >= -1 && contentRect.right <= window.innerWidth + 1,
        buttonHeight: buttonRect.height,
      }
    })
    expect(geometry).not.toBeNull()
    expect(geometry!.overflow).toBe(false)
    expect(geometry!.contentWithinViewport).toBe(true)
    expect(geometry!.buttonHeight).toBeGreaterThanOrEqual(44)

    await page.screenshot({
      path: `artifacts/shipping-audit/after-${viewport.name}.png`,
      fullPage: true,
      animations: 'disabled',
    })
  })
}

test('La página responde a la cobertura y al umbral configurados sin mostrar condiciones antiguas', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/envios')
  const result = await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = await import(path)
    await hydrateAdminStore()
    const saved = adminService.saveShipping({
      ...adminService.getSnapshot().shipping,
      provinceShippingEnabled: true,
      freeThresholdCents: 0,
    })
    await adminService.flush()
    return saved.kind
  })
  expect(result).toBe('saved')
  await page.reload()

  await expect(page.locator('.delivery-coverage')).toContainText('Todo el Perú')
  await expect(page.locator('.delivery-rate-group')).toHaveCount(2)
  await expect(page.locator('.delivery-rate-group').last()).toContainText(
    'Otras provincias',
  )
  await expect(page.locator('.delivery-free')).toHaveCount(0)
  await expect(page.locator('.delivery-note')).toContainText('tu dirección')
  await expect(page.locator('.delivery-help')).toHaveAttribute(
    'aria-label',
    'Seguimiento y ayuda',
  )
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    ),
  ).toBe(false)
  await page.screenshot({
    path: 'artifacts/shipping-audit/after-mobile-provinces-enabled.png',
    fullPage: true,
    animations: 'disabled',
  })
})
