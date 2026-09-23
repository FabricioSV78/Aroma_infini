/* global document, window, getComputedStyle */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const phase = process.argv[2] === 'before' ? 'before' : 'after'
const homeUrl = process.argv[3] ?? 'http://127.0.0.1:5173'
const output = `artifacts/home-customer/${phase}`
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const report = []
try {
  for (const width of [360, 375, 390, 430, 768, 1024, 1280, 1440, 1920]) {
    const page = await browser.newPage({
      viewport: { width, height: width < 768 ? 844 : 900 },
      reducedMotion: 'reduce',
    })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type()))
        errors.push(message.text())
    })
    await page.goto(homeUrl)
    await page.evaluate(() => document.fonts.ready)
    for (const section of await page
      .locator('[data-home-section], footer')
      .all())
      await section.scrollIntoViewIfNeeded()
    await page.waitForFunction(() =>
      [...document.images].every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    )
    const measurement = await page.evaluate(() => {
      const rounded = (value) => Math.round(value * 100) / 100
      const texts = [
        ...document.querySelectorAll(
          'main h1, main h2, main h3, main p, main .brand-name',
        ),
      ].filter((element) => !element.closest('[aria-hidden="true"], .sr-only'))
      const clippedText = texts.flatMap((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        const box = range.getBoundingClientRect()
        let parent = element
        while (parent && parent !== document.documentElement) {
          const style = getComputedStyle(parent)
          const bounds = parent.getBoundingClientRect()
          if (
            ['hidden', 'clip'].includes(style.overflowX) &&
            (box.left < bounds.left - 2 || box.right > bounds.right + 2)
          )
            return [
              { text: element.textContent, clippingParent: parent.className },
            ]
          parent = parent.parentElement
        }
        return []
      })
      return {
        pageHeight: document.documentElement.scrollHeight,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
        clippedText,
        sections: [
          ...document.querySelectorAll('[data-home-section], footer'),
        ].map((element) => {
          const box = element.getBoundingClientRect()
          return {
            name: element.dataset.homeSection ?? 'footer',
            top: rounded(box.top + window.scrollY),
            width: rounded(box.width),
            height: rounded(box.height),
          }
        }),
        images: [...document.querySelectorAll('main img')].map((image) => {
          const box = image.getBoundingClientRect()
          const style = getComputedStyle(image)
          const sourceRatio = image.naturalWidth / image.naturalHeight
          const boxRatio = box.width / box.height
          const visibleFraction =
            style.objectFit === 'cover'
              ? Math.min(sourceRatio / boxRatio, boxRatio / sourceRatio)
              : 1
          return {
            src: image.currentSrc.split('/').at(-1),
            width: rounded(box.width),
            height: rounded(box.height),
            objectFit: style.objectFit,
            objectPosition: style.objectPosition,
            sourceVisiblePercent: rounded(visibleFraction * 100),
          }
        }),
      }
    })
    report.push({ width, errors, ...measurement })
    if ([390, 768, 1440].includes(width)) {
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: 'instant' }),
      )
      await page.screenshot({
        path: `${output}/home-${width}.png`,
        fullPage: true,
      })
      for (const name of ['brands', 'editorial', 'featured', 'trust']) {
        const section = page.locator(`[data-home-section="${name}"]`)
        if (await section.count())
          await section.screenshot({ path: `${output}/${name}-${width}.png` })
      }
      await page.locator('footer').screenshot({
        path: `${output}/footer-${width}.png`,
      })
    }
    await page.close()
  }
} finally {
  await browser.close()
}
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
console.log(
  JSON.stringify(
    report.map(({ width, overflow, errors, clippedText }) => ({
      width,
      overflow,
      errors,
      clippedText,
    })),
    null,
    2,
  ),
)
