/* global document, window */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
await mkdir('artifacts/phase-3', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
try {
  for (const width of [390, 768, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: 'reduce',
    })
    for (const [name, route] of Object.entries({
      tienda: '/tienda',
      marcas: '/marcas',
      marca: '/marcas/atelier-01',
      busqueda: '/buscar?q=petale',
      vacio: '/tienda?max=10',
    })) {
      await page.goto('http://127.0.0.1:5173' + route)
      await page.evaluate(() => document.fonts.ready)
      await page.locator('footer').scrollIntoViewIfNeeded()
      await page.waitForFunction(() =>
        [...document.images].every(
          (img) => img.complete && img.naturalWidth > 0,
        ),
      )
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: 'instant' }),
      )
      await page.screenshot({
        path: `artifacts/phase-3/${name}-${width}.png`,
        fullPage: true,
      })
    }
    await page.goto('http://127.0.0.1:5173/tienda')
    if (width < 1024)
      await page.getByRole('button', { name: /^Filtros/ }).click()
    await page.screenshot({ path: `artifacts/phase-3/filtros-${width}.png` })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Buscar perfumes' }).click()
    await page.getByRole('dialog').getByLabel('Perfume o marca').fill('petale')
    await page
      .locator('.search-suggestions')
      .getByText('Pétale Nu', { exact: true })
      .waitFor()
    await page.screenshot({
      path: `artifacts/phase-3/sugerencias-${width}.png`,
    })
    await page.close()
  }
} finally {
  await browser.close()
}
