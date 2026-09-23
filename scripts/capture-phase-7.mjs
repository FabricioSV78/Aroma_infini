/* global document, HTMLElement, window */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const output = 'artifacts/phase-7'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const measurements = []

async function screenshot(page, name) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur()
    window.scrollTo({ top: 0, behavior: 'instant' })
  })
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true })
}

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

    await page.goto('http://127.0.0.1:5173/cuenta')
    await page.evaluate(() => document.fonts.ready)
    await screenshot(page, `acceso-${width}`)

    await page
      .getByRole('button', { name: 'Explorar cuenta de demostración' })
      .click()
    await screenshot(page, `resumen-${width}`)

    await page.getByRole('link', { name: 'Mis pedidos', exact: true }).click()
    await screenshot(page, `pedidos-${width}`)
    await page.getByRole('link', { name: 'Ver pedido' }).click()
    await screenshot(page, `pedido-${width}`)

    await page.getByRole('link', { name: 'Pagos' }).click()
    await screenshot(page, `pagos-${width}`)

    measurements.push({
      width,
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      brokenImages: await page
        .locator('img')
        .evaluateAll(
          (images) =>
            images.filter((image) => image.complete && image.naturalWidth === 0)
              .length,
        ),
      messages,
    })
    await page.close()
  }
} finally {
  await browser.close()
}

await writeFile(
  `${output}/measurements.json`,
  JSON.stringify(measurements, null, 2),
)
console.log(measurements)
