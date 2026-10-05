import { expect, test } from '@playwright/test'

test('Capturas de revisión de portada, ficha y ubicación', async ({ page }) => {
  test.setTimeout(90_000)
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })

    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: 'Más vendidos' }),
    ).toBeVisible()
    await page.waitForTimeout(550)
    await page.screenshot({
      path: `artifacts/review-home-${width}.png`,
    })

    await page.goto('/producto/petale-nu')
    const productNotice = page.locator('.product-popularity-preview')
    await expect(productNotice).toBeVisible()
    await productNotice.getByRole('button', { name: /Cerrar aviso/ }).click()
    const information = page.locator('#informacion-producto')
    await information.evaluate((element) => {
      const top = element.getBoundingClientRect().top + window.scrollY
      window.scrollTo({ top: Math.max(0, top - 104), behavior: 'instant' })
    })
    await expect(information).toBeInViewport()
    await page.waitForTimeout(950)
    await page.screenshot({
      path: `artifacts/review-product-family-${width}.png`,
    })

    const reviews = page.locator('.product-reviews-preview')
    await reviews.evaluate((element) => {
      const top = element.getBoundingClientRect().top + window.scrollY
      window.scrollTo({ top: Math.max(0, top - 104), behavior: 'instant' })
    })
    await expect(reviews).toBeInViewport()
    await page.waitForTimeout(950)
    await page.screenshot({
      path: `artifacts/review-product-reviews-${width}.png`,
    })

    const recommendations = page.locator('.product-recommendations')
    await recommendations.evaluate((element) => {
      const top = element.getBoundingClientRect().top + window.scrollY
      window.scrollTo({ top: Math.max(0, top - 104), behavior: 'instant' })
    })
    await expect(recommendations).toBeInViewport()
    await page.waitForTimeout(950)
    await page.screenshot({
      path: `artifacts/review-product-recommendations-${width}.png`,
    })

    await page.goto('/cuenta/pedidos/AI-A1B2C3D4E5F60708')
    const enterAccount = page.getByRole('button', { name: 'Ver mi cuenta' })
    const orderProducts = page.locator('.account-order-lines')
    await expect(enterAccount.or(orderProducts).first()).toBeVisible()
    if (await enterAccount.isVisible()) await enterAccount.click()
    await orderProducts.scrollIntoViewIfNeeded()
    await expect(orderProducts).toBeVisible()
    await page.screenshot({
      path: `artifacts/review-account-order-${width}.png`,
    })

    await page.goto('/admin/envios')
    await expect(page.getByRole('heading', { name: 'Todo el Perú' })).toBeVisible()
    await page.screenshot({
      path: `artifacts/review-admin-shipping-${width}.png`,
      fullPage: true,
    })
    await page.locator('.admin-shipping-row').first().click()
    await expect(page.locator('.admin-shipping-editor')).toBeVisible()
    await page.screenshot({
      path: `artifacts/review-admin-shipping-editor-${width}.png`,
      fullPage: true,
    })

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
  }
})
