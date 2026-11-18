import { expect, test } from './test'

for (const width of [390, 1440]) {
  test(`las miniaturas administrativas conservan su espacio y un fallback local a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    await page.route('**/images/*.webp', async (route) => {
      await gate
      await route.fulfill({ status: 404, body: '' })
    })
    await page.goto('/admin/productos', { waitUntil: 'domcontentloaded' })
    const image = page.locator('.admin-product-identity > img').first()
    await image.scrollIntoViewIfNeeded()
    await expect(image).toHaveAttribute('data-media-state', 'pending')
    const before = await image.boundingBox()
    release()
    await expect(image).toHaveAttribute('data-media-state', 'error')
    await expect(image).toHaveAttribute('data-media-fallback', '')
    await expect(image).toHaveAttribute('src', /^data:image\/svg\+xml/)
    await expect(image).toHaveCSS('opacity', '1')
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true)
    expect(await image.boundingBox()).toEqual(before)
    // Loading the local fallback cannot reset the failed request to ready and
    // retry the original URL in a render loop.
    await expect(image).toHaveAttribute('data-media-state', 'error')
    await expect(page.locator('main')).toBeVisible()
  })
}
