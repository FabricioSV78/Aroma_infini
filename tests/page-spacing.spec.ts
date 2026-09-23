import { expect, test } from '@playwright/test'

const routes = [
  '/catalogo',
  '/marcas',
  '/producto/bois-clair',
  '/producto/no-existe',
  '/favoritos',
  '/carrito',
  '/nosotros',
]

for (const width of [390, 1440]) {
  test(`El inicio de las páginas interiores es consistente a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })

    for (const route of routes) {
      await page.goto(route)
      const spacing = await page.locator('.store-page').evaluate((pageRoot) => {
        const header = document.querySelector<HTMLElement>('.site-header')
        const firstSection = pageRoot.firstElementChild as HTMLElement | null
        const token = Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            '--page-start-space',
          ),
        )

        return {
          actual:
            header && firstSection
              ? firstSection.getBoundingClientRect().top -
                header.getBoundingClientRect().bottom
              : Number.NaN,
          token,
        }
      })

      expect(spacing.actual, route).toBeCloseTo(spacing.token, 0)
    }
  })
}
