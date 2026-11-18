import { expect, test } from './test'

const routes = [
  '/tienda',
  '/marcas',
  '/producto/bois-clair',
  '/producto/no-existe',
  '/favoritos',
  '/carrito',
  '/nosotros',
]

const breadcrumbRoutes = [
  '/tienda',
  '/buscar?q=bois',
  '/marcas',
  '/producto/bois-clair',
  '/seguir-pedido',
  '/cuenta',
  '/nosotros',
  '/contacto',
  '/envios',
  '/devoluciones',
  '/privacidad',
  '/terminos',
  '/libro-de-reclamaciones',
]

for (const width of [390, 1440]) {
  for (const route of routes) {
    test(`El inicio de ${route} es consistente a ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })

      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('.store-page')).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
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
    })
  }
}

for (const width of [390, 1440]) {
  for (const route of breadcrumbRoutes) {
    test(`Las migajas de ${route} mantienen la distancia de la cabecera a ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ reducedMotion: 'reduce' })

      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await expect(
        page.getByRole('navigation', { name: 'Ruta de navegación' }),
      ).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      const spacing = await page
        .getByRole('navigation', { name: 'Ruta de navegación' })
        .evaluate((breadcrumb) => {
          const header = document.querySelector<HTMLElement>('.site-header')
          return header
            ? breadcrumb.getBoundingClientRect().top -
                header.getBoundingClientRect().bottom
            : Number.NaN
        })
      expect(spacing, route).toBeCloseTo(24, 0)
    })
  }
}
