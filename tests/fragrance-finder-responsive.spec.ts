import { expect, test } from '@playwright/test'

const viewports = [
  { label: 'desktop-large', width: 1920, height: 1080 },
  { label: 'laptop', width: 1366, height: 900 },
  { label: 'tablet', width: 820, height: 1180 },
  { label: 'mobile', width: 390, height: 844 },
] as const

test('El recomendador y su editor conservan el contenido accesible en cuatro tamaños', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.goto('/')
    const section = page.locator('#encuentra-tu-perfume')
    await expect(section).toBeVisible()
    await section.scrollIntoViewIfNeeded()
    await expect
      .poll(() =>
        section.locator('.finder-scene-image').evaluate((element) => {
          const image = element as HTMLImageElement
          return image.complete && image.naturalWidth > 0
        }),
      )
      .toBe(true)
    for (const image of await section.locator('img:visible').all()) {
      await expect
        .poll(() =>
          image.evaluate((element) => {
            const photo = element as HTMLImageElement
            return photo.complete && photo.naturalWidth > 0
          }),
        )
        .toBe(true)
    }
    await section.screenshot({
      path: `artifacts/fragrance-finder/home-${viewport.label}.png`,
    })
    await section.getByRole('button', { name: 'Encontrar mi perfume' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('checkbox', { name: /Floral/ })).toBeVisible()
    await dialog.screenshot({
      path: `artifacts/fragrance-finder/modal-${viewport.label}.png`,
    })
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true)
    await page.goto('/admin/home')
    await page
      .getByRole('button', { name: 'Encuentra tu perfume ideal' })
      .click()
    await page.getByRole('button', { name: 'Preguntas y opciones' }).click()
    await page
      .locator('.admin-home-finder-option-editor')
      .first()
      .screenshot({
        path: `artifacts/fragrance-finder/admin-option-${viewport.label}.png`,
      })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width)
  }
})
