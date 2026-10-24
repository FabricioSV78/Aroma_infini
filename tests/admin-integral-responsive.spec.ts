import { expect, test } from '@playwright/test'

const routes = [
  { name: 'dashboard', path: '/admin', capture: true },
  { name: 'orders', path: '/admin/pedidos', capture: true },
  { name: 'order-detail', path: '/admin/pedidos/AI-210926-01', capture: true },
  { name: 'products', path: '/admin/productos', capture: true },
  { name: 'product-form', path: '/admin/productos/nuevo', capture: true },
  { name: 'customers', path: '/admin/clientes', capture: true },
  { name: 'brands', path: '/admin/marcas', capture: true },
  { name: 'promotions', path: '/admin/promociones', capture: true },
  { name: 'shipping', path: '/admin/envios', capture: true },
  { name: 'home-editor', path: '/admin/home', capture: true },
] as const

const viewports = [
  { name: 'desktop-large', width: 1600, height: 1000 },
  { name: 'laptop', width: 1280, height: 900 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'mobile', width: 390, height: 844 },
] as const

test('Cada pantalla administrativa conserva su jerarquía y cabe en cuatro tamaños', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    for (const route of routes) {
      await page.goto(route.path)
      await expect(
        page.locator('#admin-content h1'),
        `${route.name} a ${viewport.width}px`,
      ).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
        `${route.name} a ${viewport.width}px`,
      ).toBeLessThanOrEqual(viewport.width)
      if (route.capture) {
        await page.screenshot({
          path: `artifacts/admin-integral/${route.name}-${viewport.name}.png`,
          animations: 'disabled',
        })
      }
    }
  }
})
