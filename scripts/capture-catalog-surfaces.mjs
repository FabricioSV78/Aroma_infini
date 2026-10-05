/* global document, window */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
const output = 'artifacts/catalog-surfaces'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' })
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 })
    await page.goto('http://127.0.0.1:5173/tienda')
    await page.locator('.product-card').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/catalog-${width}.png` })
    const images = page.locator('.product-image-link')
    await images.first().hover()
    await page.screenshot({ path: `${output}/alternate-${width}.png` })
    console.log({ width, overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth) })
    await page.goto('http://127.0.0.1:5173/producto/petale-nu')
    await page.locator('.product-reviews-footer').screenshot({ path: `${output}/pagination-${width}.png` })
  }
} finally { await browser.close() }
