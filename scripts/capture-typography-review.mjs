/* global document, window, getComputedStyle */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const output = 'artifacts/typography'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const review = []

const routes = {
  home: '/',
  catalog: '/tienda',
  brands: '/marcas',
  product: '/producto/bois-clair',
}

const selectors = {
  home: [
    '.hero-title',
    '.section-heading h2',
    '.brand-intro h2',
    '.editorial-copy h2',
    '.featured-intro h2',
    '.product-meta h3',
  ],
  catalog: ['.catalog-heading h1', '.product-meta h3', '.catalog-heading > p'],
  brands: ['.catalog-heading h1', '.brands-directory h2'],
  product: [
    '.product-purchase h1',
    '.olfactory-profile-heading h2',
    '.product-description-copy',
    '.product-recommendations h2',
  ],
}

try {
  for (const width of [390, 1440]) {
    for (const [name, route] of Object.entries(routes)) {
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
      await page.goto(`http://127.0.0.1:5173${route}`)
      await page.evaluate(() => document.fonts.ready)
      const metrics = await page.evaluate((pageSelectors) => {
        const type = Object.fromEntries(
          pageSelectors.map((selector) => {
            const element = document.querySelector(selector)
            if (!element) return [selector, null]
            const style = getComputedStyle(element)
            return [
              selector,
              {
                family: style.fontFamily,
                size: style.fontSize,
                lineHeight: style.lineHeight,
                letterSpacing: style.letterSpacing,
              },
            ]
          }),
        )
        return {
          newsreaderLoaded: document.fonts.check('32px "Newsreader Variable"'),
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          type,
        }
      }, selectors[name])
      review.push({ name, width, messages, ...metrics })
      await page.screenshot({ path: `${output}/${name}-${width}.png` })

      if (name === 'product') {
        const recommendations = page.locator('.product-recommendations')
        await recommendations.evaluate((element) => {
          const headerOffset =
            document.querySelector('.site-header')?.getBoundingClientRect()
              .height ?? 0
          window.scrollTo({
            top: element.getBoundingClientRect().top + window.scrollY - headerOffset - 16,
            behavior: 'instant',
          })
        })
        await recommendations.screenshot({
          path: `${output}/product-recommendations-${width}.png`,
        })
      }
      await page.close()
    }
  }
} finally {
  await browser.close()
}

await writeFile(`${output}/review.json`, JSON.stringify(review, null, 2))
