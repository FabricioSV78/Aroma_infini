/* global document, window, getComputedStyle */
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

const browser = await chromium.launch({ channel: 'chrome' })
const output = 'artifacts/admin-home-products-audit'
await mkdir(output, { recursive: true })
const results = []

for (const width of [320, 390, 768, 1024, 1280, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
  for (const screen of ['home-categories', 'home-featured', 'productos', 'productos/cedre', 'productos/nuevo']) {
    const route = screen.startsWith('home') ? 'home' : screen
    await page.goto(`http://127.0.0.1:5173/admin/${route}`)
    if (screen === 'home-featured') await page.getByRole('button', { name: 'Destacados', exact: true }).click()
    if (screen === 'home-categories') await page.getByRole('button', { name: 'Para él, para ella y unisex' }).click()
    if (screen === 'productos') await page.locator('.admin-table--products tbody tr').first().waitFor()
    if (screen.startsWith('productos/')) {
      await page.locator('h1').waitFor()
      if (width <= 390) await page.getByRole('button', { name: 'Mostrar vista previa' }).click()
    }
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: `${output}/${screen.replace('/', '-')}-${width}.png`, fullPage: true })
    if (width === 320 && screen.startsWith('productos/')) {
      await page.screenshot({ path: `${output}/${screen.replace('/', '-')}-${width}-viewport.png` })
    }
    const metrics = await page.evaluate(() => {
      const root = document.documentElement
      const content = document.querySelector('.admin-page')
      const main = document.querySelector('.admin-main')
      const wide = [...document.querySelectorAll('body *')]
        .filter((node) => {
          const rect = node.getBoundingClientRect()
          const css = getComputedStyle(node)
          return rect.width > 0 && rect.right > window.innerWidth + 2 && css.position !== 'fixed'
        })
        .slice(0, 12)
        .map((node) => ({ selector: node.className || node.tagName, right: Math.round(node.getBoundingClientRect().right) }))
      return {
        bodyWidth: document.body.scrollWidth,
        rootWidth: root.scrollWidth,
        viewportWidth: window.innerWidth,
        contentWidth: content?.getBoundingClientRect().width,
        mainWidth: main?.getBoundingClientRect().width,
        pageHeight: root.scrollHeight,
        table: (() => { const wrap = document.querySelector('.admin-table-wrap--products'); const table = document.querySelector('.admin-table--products'); return wrap && table ? { wrap: wrap.clientWidth, scroll: wrap.scrollWidth, table: table.getBoundingClientRect().width, columns: [...table.querySelectorAll('thead th')].map(el => Math.round(el.getBoundingClientRect().width)) } : null })(),
        wide,
      }
    })
    results.push({ width, screen, ...metrics })
  }
  await page.close()
}

await writeFile(`${output}/metrics.json`, JSON.stringify(results, null, 2))
await browser.close()
const failures = results.filter((result) =>
  result.rootWidth > result.viewportWidth ||
  (result.table && result.table.scroll > result.table.wrap)
)
if (failures.length) throw new Error(`Overflow detectado: ${JSON.stringify(failures)}`)
console.log(`Capturadas ${results.length} vistas sin overflow de página ni de tabla.`)
