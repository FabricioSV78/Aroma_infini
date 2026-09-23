/* global document, window, getComputedStyle */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

await mkdir('artifacts/home-refinement', { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
try {
  for (const width of [390, 1440, 1920]) {
    const page = await browser.newPage({
      viewport: { width, height: 940 },
      reducedMotion: 'reduce',
    })
    await page.goto('http://127.0.0.1:5173')
    await page.evaluate(() => document.fonts.ready)
    for (const section of await page.locator('[data-home-section]').all())
      await section.scrollIntoViewIfNeeded()
    await page.waitForFunction(() =>
      [...document.images].every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    )
    await page.evaluate(() =>
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'instant',
      }),
    )
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector('.site-header'))
          .backgroundColor === 'rgb(255, 255, 255)',
    )
    await page.screenshot({
      path: `artifacts/home-refinement/closing-${width}.png`,
    })
    console.log(`${width}px: cierre capturado con imágenes cargadas`)
    await page.close()
  }
} finally {
  await browser.close()
}
