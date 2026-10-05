/* global getComputedStyle */
import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' })
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const route of ['/tienda', '/marcas', '/contacto', '/nosotros', '/envios', '/cuenta', '/producto/bois-clair']) {
      await page.goto(`http://127.0.0.1:5173${route}`)
      const breadcrumb = page.getByRole('navigation', { name: 'Ruta de navegación', exact: true })
      await breadcrumb.waitFor()
      console.log(width, route, await breadcrumb.evaluate(node => {
        const next = node.nextElementSibling
        return { gap: Math.round(next.getBoundingClientRect().top - node.getBoundingClientRect().bottom), padding: getComputedStyle(next).paddingTop }
      }))
    }
  }
} finally { await browser.close() }
