/* global document, window, innerWidth, getComputedStyle */
import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const origin = 'http://127.0.0.1:5173'
const output = new URL('../artifacts/admin-operations-audit/', import.meta.url)
await mkdir(output, { recursive: true })

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const cases = [
  ['pedidos', '/admin/pedidos'],
  ['pedido', '/admin/pedidos/AI-210926-01'],
  ['clientes', '/admin/clientes'],
  ['marcas', '/admin/marcas'],
  ['promociones', '/admin/promociones'],
]
const viewports = [
  ['small-mobile', 320, 760],
  ['mobile', 390, 844],
  ['tablet', 768, 1024],
  ['compact-desktop', 1024, 900],
  ['desktop', 1440, 900],
]
const results = []

for (const [name, width, height] of viewports) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  for (const [routeName, path] of cases) {
    await page.goto(`${origin}${path}`)
    await page.locator('.admin-page h1').waitFor({ state: 'visible' })
    if (routeName === 'promociones') {
      await page.getByRole('button', { name: 'Nueva promoción' }).click()
    }
    if (routeName === 'marcas') {
      await page.getByRole('button', { name: 'Nueva marca' }).click()
    }
    if (routeName === 'pedido') {
      await page.getByRole('button', { name: 'Completar datos de entrega' }).click()
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: fileURLToPath(new URL(`${routeName}-${name}.png`, output)), fullPage: true })
    const metrics = await page.evaluate(() => {
      const root = document.documentElement
      const main = document.querySelector('.admin-page')
      const rect = main?.getBoundingClientRect()
      const overflow = [...document.querySelectorAll('.admin-page *')]
        .filter((item) => {
          const box = item.getBoundingClientRect()
          return box.width > 0 && box.right > innerWidth + 2 && getComputedStyle(item).position !== 'fixed'
        })
        .slice(0, 10)
        .map((item) => ({ tag: item.tagName.toLowerCase(), class: item.className, right: Math.round(item.getBoundingClientRect().right) }))
      return {
        documentWidth: root.scrollWidth,
        viewportWidth: innerWidth,
        mainLeft: Math.round(rect?.left ?? 0),
        mainRight: Math.round(rect?.right ?? 0),
        mainHeight: Math.round(rect?.height ?? 0),
        overflow,
      }
    })
    results.push({ routeName, name, ...metrics })
  }
  await page.close()
}
await writeFile(new URL('metrics.json', output), JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
await browser.close()
