import { expect, test } from '@playwright/test'

test('Capturas de revisión de ubicación, avisos y reseñas', async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.removeItem('aroma-infini:commercial-preview-seen:v1')
    sessionStorage.removeItem(
      'aroma-infini:product-interest-notice:petale-nu:v2',
    )
  })
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })

    await page.goto('/')
    const notice = page.getByRole('complementary', {
      name: 'Vista previa de avisos comerciales',
    })
    await expect(notice).toBeVisible({ timeout: 4000 })
    await page.waitForTimeout(550)
    await page.screenshot({
      path: `artifacts/review-home-notice-${width}.png`,
    })

    await page.goto('/producto/petale-nu')
    const popularity = page.getByRole('complementary', {
      name: 'Interés en Pétale Nu',
    })
    await expect(popularity).toBeVisible({ timeout: 4000 })
    await page.waitForTimeout(550)
    await page.screenshot({
      path: `artifacts/review-product-popup-${width}.png`,
    })
    await popularity
      .getByRole('button', { name: 'Cerrar aviso sobre Pétale Nu' })
      .click()

    const reviews = page.locator('.product-reviews-preview')
    await reviews.evaluate((element) => {
      const top = element.getBoundingClientRect().top + window.scrollY
      window.scrollTo({ top: Math.max(0, top - 104), behavior: 'instant' })
    })
    await expect(reviews).toBeInViewport()
    await page.screenshot({
      path: `artifacts/review-product-reviews-${width}.png`,
    })

    await page.goto('/cuenta/pedidos/AI-DEMO-A1B2C3D4E5F60708')
    await page
      .getByRole('button', { name: 'Explorar cuenta de demostración' })
      .click()
    const orderProducts = page.locator('.account-order-lines')
    await orderProducts.scrollIntoViewIfNeeded()
    await expect(orderProducts).toBeVisible()
    await page.screenshot({
      path: `artifacts/review-account-order-${width}.png`,
    })

    await page.goto('/admin/envios')
    const firstZone = page.locator('.admin-zone-list fieldset').first()
    await firstZone.scrollIntoViewIfNeeded()
    await expect(firstZone).toBeVisible()
    await firstZone.screenshot({
      path: `artifacts/review-admin-location-${width}.png`,
    })

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
  }
})
