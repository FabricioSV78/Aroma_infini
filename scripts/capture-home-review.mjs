/* global document, window, getComputedStyle */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const output = 'artifacts/home-editorial'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
try {
  for (const width of [390, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: width === 390 ? 844 : 900 },
      reducedMotion: 'reduce',
    })
    await page.goto('http://127.0.0.1:5173')
    await page.evaluate(() => document.fonts.ready)
    for (const section of await page.locator('[data-home-section]').all()) {
      await section.scrollIntoViewIfNeeded()
    }
    await page.waitForFunction(() =>
      [...document.images].every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    )
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector('.site-header'))
          .backgroundColor === 'rgba(0, 0, 0, 0)',
    )
    await page.screenshot({
      path: `${output}/home-${width}.png`,
      fullPage: true,
    })
    for (const [name, selector] of Object.entries({
      brands: '#marcas',
      categories: '.discovery-section',
      bestsellers: '.bestsellers-section',
      editorial: '.editorial',
      featured: '.featured-section',
    })) {
      const section = page.locator(selector)
      const height = await section.evaluate(
        (element) => element.getBoundingClientRect().height,
      )
      await page.setViewportSize({
        width,
        height: Math.max(1000, Math.ceil(height) + 200),
      })
      await section.scrollIntoViewIfNeeded()
      // Hide the floating header only for isolated section captures.
      await page.addStyleTag({
        content:
          '.site-header, .help-button, .skip-link { visibility: hidden !important; }',
      })
      await section.screenshot({ path: `${output}/${name}-${width}.png` })
    }
    const favorite = page
      .locator('.bestsellers-section .product-favorite')
      .first()
    await favorite.focus()
    console.log(
      `${width}px favorite:`,
      await favorite.evaluate((element) => ({
        width: element.clientWidth,
        height: element.clientHeight,
        outline: getComputedStyle(element).outlineStyle,
        focused: document.activeElement === element,
      })),
    )
    await page
      .locator('.bestsellers-section .product-card')
      .first()
      .screenshot({ path: `${output}/product-focus-${width}.png` })
    await page.close()
  }
} finally {
  await browser.close()
}
