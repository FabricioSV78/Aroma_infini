/* global document, window, getComputedStyle */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const phase = [
  'before',
  'after',
  'premium',
  'refinement',
  'composition',
  'rhythm',
  'gallery',
].includes(process.argv[2])
  ? process.argv[2]
  : 'after'
const output = `artifacts/home-audit/${phase}`
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const report = []
try {
  for (const width of [360, 375, 390, 430, 768, 1024, 1280, 1440]) {
    const height = width < 768 ? 844 : 900
    const page = await browser.newPage({
      viewport: { width, height },
      reducedMotion: 'reduce',
    })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type()))
        errors.push(message.text())
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
    const sections = await page
      .locator('[data-home-section], .site-footer')
      .evaluateAll((elements) =>
        elements.map((element) => {
          const section = element.querySelector('section') ?? element
          const box = element.getBoundingClientRect()
          const style = getComputedStyle(section)
          return {
            name: element.getAttribute('data-home-section') ?? 'footer',
            height: Math.round(box.height),
            top: Math.round(box.top + window.scrollY),
            paddingTop: style.paddingTop,
            paddingBottom: style.paddingBottom,
            marginTop: style.marginTop,
          }
        }),
      )
    report.push({
      width,
      height: await page.evaluate(() => document.documentElement.scrollHeight),
      overflow: await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      errors,
      sections,
    })
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
    await page.addStyleTag({
      content:
        '.site-header, .help-button, .skip-link {visibility:hidden !important}',
    })
    for (const section of await page
      .locator('[data-home-section], .site-footer')
      .all()) {
      const name = (await section.getAttribute('data-home-section')) ?? 'footer'
      if (name === 'hero') continue
      const box = await section.boundingBox()
      await page.setViewportSize({
        width,
        height: Math.max(1000, Math.ceil(box.height) + 220),
      })
      await section.screenshot({ path: `${output}/${name}-${width}.png` })
    }
    if (phase === 'gallery' && width >= 768) {
      const brands = page.locator('#marcas')
      await brands.getByRole('link', { name: /^FORME/ }).focus()
      await page.waitForFunction(() =>
        document
          .querySelector('.brand-preview-frame.is-active figcaption')
          ?.textContent.includes('FORME'),
      )
      await brands.screenshot({ path: `${output}/brands-forme-${width}.png` })
    }
    await page.close()
  }
} finally {
  await browser.close()
}
await writeFile(`${output}/measurements.json`, JSON.stringify(report, null, 2))
console.log(
  report.map(({ width, height, overflow, errors }) => ({
    width,
    height,
    overflow,
    errors,
  })),
)
