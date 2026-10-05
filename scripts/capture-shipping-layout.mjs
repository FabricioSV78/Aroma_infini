/* global document, window */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
await mkdir('artifacts/shipping-layout', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' })
  for (const width of [320, 390, 768, 1440, 1890]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('http://127.0.0.1:5173/envios')
    await page.getByRole('heading', { level: 1 }).waitFor()
    await page.screenshot({ path: `artifacts/shipping-layout/${width}.png`, fullPage: true })
    console.log({ width, overflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth) })
  }
} finally { await browser.close() }
