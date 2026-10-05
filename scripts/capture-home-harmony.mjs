/* global document, window, getComputedStyle */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
const output = 'artifacts/home-harmony'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' })
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('http://127.0.0.1:5173/')
    for (const name of ['categories', 'brands']) {
      const section = page.locator(`[data-home-section='${name}']`)
      await section.scrollIntoViewIfNeeded()
      await section.screenshot({ path: `${output}/${name}-${width}.png` })
    }
    await page.goto('http://127.0.0.1:5173/producto/neroli-matin')
    await page.screenshot({ path: `${output}/product-${width}.png` })
    const metrics = await page.evaluate(() => ({
      width: window.innerWidth,
      breadcrumbGap: getComputedStyle(document.querySelector('.product-breadcrumb')).marginBottom,
      purchaseBottom: document.querySelector('.product-cart-button').getBoundingClientRect().bottom,
      viewport: window.innerHeight,
    }))
    console.log(metrics)
  }
} finally { await browser.close() }
