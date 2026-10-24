import { test, expect } from '@playwright/test'

for (const width of [390, 768, 1440]) {
  test(`Catalog photos and product galleries load at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/tienda')
    const images = page.locator(
      '.catalog-listing .product-image-link > img:first-child',
    )
    await expect(images).toHaveCount(12)
    const sources = await images.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLImageElement).src),
    )
    // The added catalog records reuse approved demonstration photographs.
    expect(new Set(sources.slice(0, 7)).size).toBe(7)
    expect(new Set(sources).size).toBe(7)
    for (const image of await images.all()) {
      await image.scrollIntoViewIfNeeded()
      await expect(image).toHaveJSProperty('complete', true)
      expect(
        await image.evaluate((node) => (node as HTMLImageElement).naturalWidth),
      ).toBeGreaterThan(0)
    }
    await page
      .locator('.catalog-listing')
      .screenshot({ path: `artifacts/product-images-${width}.png` })
    for (const slug of [
      'bois-clair',
      'petale-nu',
      'vert-silence',
      'neroli-matin',
      'iris-velours',
      'figue-douce',
      'santal-nuit',
      'cedre-lumiere',
    ]) {
      await page.goto(`/producto/${slug}`)
      const photo = page.locator('.product-gallery-frame img')
      await expect(photo).toHaveCount(4)
      const gallerySources = await photo.evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLImageElement).src),
      )
      expect(new Set(gallerySources).size).toBe(4)
      for (let index = 0; index < 4; index++) {
        await page
          .getByRole('button', { name: `Ver imagen ${index + 1} de 4` })
          .filter({ visible: true })
          .click()
        await expect(photo.nth(index)).toHaveJSProperty('complete', true)
        expect(
          await photo
            .nth(index)
            .evaluate((node) => (node as HTMLImageElement).naturalWidth),
        ).toBeGreaterThan(0)
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
    }
  })
}
