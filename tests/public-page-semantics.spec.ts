import { expect, test } from '@playwright/test'

const indexablePaths = [
  '/',
  '/tienda',
  '/marcas',
  '/marcas/atelier-01',
  '/marcas/forme',
  '/marcas/studio-sillage',
  '/marcas/matiere-04',
  '/producto/bois-clair',
  '/producto/petale-nu',
  '/producto/vert-silence',
  '/producto/ambre-lent',
  '/producto/neroli-matin',
  '/producto/iris-velours',
  '/producto/figue-douce',
  '/producto/santal-nuit',
]

const publicPaths = [
  ...indexablePaths,
  '/nosotros',
  '/contacto',
  '/envios',
  '/devoluciones',
  '/privacidad',
  '/terminos',
  '/libro-de-reclamaciones',
]

for (const path of publicPaths) {
  test(`${path} conserva una jerarquía de encabezados y metadatos básicos`, async ({
    page,
  }) => {
    await page.goto(path)
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { level: 1 })).toHaveCount(1)

    const headingLevels = await main
      .getByRole('heading')
      .evaluateAll((headings) =>
        headings.map((heading) => Number(heading.tagName.slice(1))),
      )
    expect(headingLevels[0]).toBe(1)
    headingLevels.slice(1).forEach((level, index) => {
      expect(level, `Encabezado ${index + 2} en ${path}`).toBeLessThanOrEqual(
        headingLevels[index] + 1,
      )
    })

    const imagesWithoutAlt = await main
      .locator('img:not([alt])')
      .evaluateAll((images) => images.map((image) => image.outerHTML))
    expect(imagesWithoutAlt).toEqual([])
    const imagesWithoutDimensions = await main
      .locator('img:not([width]), img:not([height])')
      .evaluateAll((images) => images.map((image) => image.outerHTML))
    expect(imagesWithoutDimensions).toEqual([])

    await expect(page.locator('meta[name="description"]')).toHaveCount(1)
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /\S.{30,}/,
    )
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      'content',
      'noindex,nofollow',
    )
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(
      indexablePaths.includes(path) ? 1 : 0,
    )
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1)
  })
}
