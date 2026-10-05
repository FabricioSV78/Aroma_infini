/* global document, HTMLElement, window */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const output = 'artifacts/phase-8'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const measurements = []

async function capture(page, route, name) {
  await page.goto(`http://127.0.0.1:5173${route}`)
  await page.locator('h1').waitFor()
  await page.evaluate(async () => {
    await document.fonts.ready
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur()
    window.scrollTo({ top: 0, behavior: 'instant' })
    await new Promise((resolve) =>
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)),
    )
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
    await capture(page, '/nosotros', `nosotros-${width}`)
    await capture(page, '/privacidad', `privacidad-${width}`)
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
