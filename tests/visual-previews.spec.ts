import { expect, test } from '@playwright/test'

test('Capturas de revisión de portada, ficha y ubicación', async ({ page }) => {
  test.setTimeout(120_000)
  for (const { width, height } of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
    { width: 1904, height: 947 },
  ]) {
    await page.setViewportSize({ width, height })

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
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await page.screenshot({
      path: `artifacts/review-product-intro-${width}.png`,
    })
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

    await page.getByRole('tab', { name: 'Reseñas' }).click()
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
    await expect(
      page.getByRole('heading', { name: 'Todo el Perú' }),
    ).toBeVisible()
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
