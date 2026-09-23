/* global document, window */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const output = 'artifacts/phase-5'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const report = []

try {
  for (const width of [390, 768, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion: 'reduce',
    })
    const messages = []
    page.on('pageerror', (error) => messages.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning')
        messages.push(message.text())
    })
    await page.addInitScript(() => {
      localStorage.setItem(
        'aroma-infini:favorites:v1',
        JSON.stringify({ version: 1, ids: ['cedre', 'petale', 'sillage'] }),
      )
      localStorage.setItem(
        'aroma-infini:cart:v1',
        JSON.stringify({
          version: 1,
          items: [
            { variantId: 'cedre-50', quantity: 2 },
            { variantId: 'petale-100', quantity: 1 },
          ],
        }),
      )
    })

    for (const route of ['favoritos', 'carrito']) {
      await page.goto(`http://127.0.0.1:5173/${route}`)
      await page.evaluate(() => document.fonts.ready)
      await page.locator('footer').scrollIntoViewIfNeeded()
      await page.locator('img').evaluateAll(async (images) => {
        images.forEach((image) => {
          image.loading = 'eager'
        })
        await Promise.all(
          images.map(
            (image) =>
              new Promise((resolve) => {
                if (image.complete) resolve()
                else {
                  image.addEventListener('load', resolve, { once: true })
                  image.addEventListener('error', resolve, { once: true })
                }
              }),
          ),
        )
      })
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
      await page.screenshot({
        path: `${output}/${route}-${width}.png`,
        fullPage: true,
      })
      report.push({
        route,
        width,
        overflow: await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
        brokenImages: await page.locator('img').evaluateAll(
          (images) => images.filter((image) => image.naturalWidth === 0).length,
        ),
        messages: [...messages],
      })
    }

    await page.goto('http://127.0.0.1:5173/producto/bois-clair')
    await page.getByRole('button', { name: 'Carrito', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: /Tu carrito/ })
    await drawer.screenshot({ path: `${output}/drawer-${width}.png` })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Añadir al carrito' }).click()
    await page.locator('.cart-notice').screenshot({
      path: `${output}/confirmation-${width}.png`,
    })
    await page.close()
  }
} finally {
  await browser.close()
}

await writeFile(`${output}/measurements.json`, JSON.stringify(report, null, 2))
console.log(report)
