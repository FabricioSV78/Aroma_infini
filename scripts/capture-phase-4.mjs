/* global document, window */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const output = 'artifacts/phase-4'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const measurements = []

async function loadAllImages(page) {
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
    await page.goto('http://127.0.0.1:5173/producto/bois-clair')
    await page.evaluate(() => document.fonts.ready)
    await page.locator('footer').scrollIntoViewIfNeeded()
    await loadAllImages(page)
    const metrics = await page.evaluate(() => ({
      width: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      documentHeight: document.documentElement.scrollHeight,
      brokenImages: [...document.images].filter(
        (image) => !image.complete || image.naturalWidth === 0,
      ).length,
    }))
    measurements.push({ ...metrics, messages })
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await page.screenshot({
      path: `${output}/product-${width}.png`,
      fullPage: true,
    })
    await page.screenshot({
      path: `${output}/product-fold-${width}.png`,
    })
    await page.close()
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto('http://127.0.0.1:5173/producto/ambre-lent')
  await page.evaluate(() => document.fonts.ready)
  await page.locator('footer').scrollIntoViewIfNeeded()
  await loadAllImages(page)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.screenshot({ path: `${output}/sold-out-1440.png`, fullPage: true })
  await page.close()

  const informationPage = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce',
  })
  await informationPage.goto('http://127.0.0.1:5173/producto/bois-clair')
  await informationPage
    .locator('.product-info-nav')
    .getByRole('link', { name: /Familia olfativa/ })
    .click()
  await informationPage.locator('#informacion-producto').scrollIntoViewIfNeeded()
  await informationPage.screenshot({
    path: `${output}/product-family-tab-1440.png`,
  })
  await informationPage
    .locator('.product-info-tabs')
    .getByRole('tab', { name: /Descripción/ })
    .click()
  await informationPage.screenshot({
    path: `${output}/product-description-tab-1440.png`,
  })
  await informationPage.close()
} finally {
  await browser.close()
}

await writeFile(
  `${output}/measurements.json`,
  JSON.stringify(measurements, null, 2),
)
