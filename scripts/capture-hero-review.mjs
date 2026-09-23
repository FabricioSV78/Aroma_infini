/* global document, window, getComputedStyle, NodeFilter, innerWidth */
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'

const output = 'artifacts/home-refinement/hero'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const viewports = process.argv.includes('--all')
    ? [
        [360, 740],
        [375, 812],
        [390, 844],
        [430, 932],
        [768, 1024],
        [1024, 900],
        [1280, 900],
        [1440, 900],
      ]
    : [
        [1440, 900],
        [390, 844],
      ]
  for (const [width, height] of viewports) {
    const page = await browser.newPage({
      viewport: { width, height },
      reducedMotion: 'reduce',
    })
    await page.goto('http://127.0.0.1:5173/')
    await page.getByRole('heading', { level: 1 }).waitFor()
    await page.evaluate(() => document.fonts.ready)
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.hero-image img')].every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    )
    for (const slide of [1, 2, 3]) {
      await page.getByRole('button', { name: `Ver campaña ${slide}` }).focus()
      await page.keyboard.press('Enter')
      await page.waitForFunction((number) => {
        const active = document.querySelector('.hero-slide.is-active')
        return (
          active?.getAttribute('aria-label') === `${number} de 3` &&
          active.querySelector('img')?.complete &&
          getComputedStyle(active).opacity === '1'
        )
      }, slide)
      await page.evaluate(() => document.activeElement?.blur())
      // Click can scroll a control into view on short screens; captures start at top.
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: 'instant' }),
      )
      await page.screenshot({ path: `${output}/${width}-slide-0${slide}.png` })
      const textAreas = await page
        .locator(
          '.site-header .wordmark, .desktop-nav > a, .header-actions > *, .hero-slide.is-active .eyebrow, .hero-slide.is-active .hero-title, .hero-slide.is-active .hero-description',
        )
        .evaluateAll((elements) =>
          elements.flatMap((element) => {
            if (element.getClientRects().length === 0) return []
            const areas = []
            const walker = document.createTreeWalker(
              element,
              NodeFilter.SHOW_TEXT,
            )
            while (walker.nextNode()) {
              if (!walker.currentNode.textContent.trim()) continue
              const range = document.createRange()
              range.selectNodeContents(walker.currentNode)
              for (const rect of range.getClientRects())
                areas.push({
                  label: walker.currentNode.textContent.trim(),
                  rect: rect.toJSON(),
                  large: element.classList.contains('hero-title'),
                })
            }
            if (!areas.length)
              areas.push({
                label: element.getAttribute('aria-label'),
                rect: element.getBoundingClientRect().toJSON(),
                large: false,
              })
            return areas
          }),
        )
      // Sample the rendered photographic background without text obscuring it.
      // Taking the darkest pixel in each full bounding box is conservative.
      const hideText = await page.addStyleTag({
        content:
          '.site-header, .site-header *, .hero-copy > *, .hero-copy > * *, .hero-accessibility, .hero-accessibility * { visibility: hidden !important; }',
      })
      const background = await page.screenshot({
        path: `${output}/${width}-background-0${slide}.png`,
      })
      const { data, info } = await sharp(background)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      await hideText.evaluate((element) => element.remove())
      const linear = (value) =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      const foreground = linear(32 / 255)
      let lowest = Infinity
      for (const area of textAreas) {
        let minimumLuminance = 1
        for (
          let y = Math.max(0, Math.floor(area.rect.top));
          y < Math.min(info.height, Math.ceil(area.rect.bottom));
          y++
        ) {
          for (
            let x = Math.max(0, Math.floor(area.rect.left));
            x < Math.min(info.width, Math.ceil(area.rect.right));
            x++
          ) {
            const index = (y * info.width + x) * info.channels
            const luminance =
              0.2126 * linear(data[index] / 255) +
              0.7152 * linear(data[index + 1] / 255) +
              0.0722 * linear(data[index + 2] / 255)
            minimumLuminance = Math.min(minimumLuminance, luminance)
          }
        }
        const ratio = (minimumLuminance + 0.05) / (foreground + 0.05)
        lowest = Math.min(lowest, ratio)
        if (ratio < (area.large ? 3 : 4.5))
          throw new Error(
            `${width}px / slide ${slide}: contraste ${ratio.toFixed(2)} en ${area.label}`,
          )
      }
      console.log(
        `${width}px / slide ${slide}: contraste mínimo conservador ${lowest.toFixed(2)}:1`,
      )
      console.log(
        JSON.stringify(
          await page.evaluate(() => ({
            viewport: innerWidth,
            activeSlide: document
              .querySelector('.hero-slide.is-active')
              .getAttribute('aria-label'),
            hero: document
              .querySelector('.hero')
              .getBoundingClientRect()
              .toJSON(),
            heading: document
              .querySelector('h1')
              .getBoundingClientRect()
              .toJSON(),
            headerBackground: getComputedStyle(
              document.querySelector('.site-header'),
            ).backgroundColor,
            overflow: document.documentElement.scrollWidth > innerWidth,
          })),
        ),
      )
    }
    await page.evaluate(() =>
      window.scrollTo({
        top: document.querySelector('.hero').offsetHeight - 180,
        behavior: 'instant',
      }),
    )
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector('.site-header'))
          .backgroundColor === 'rgb(255, 255, 255)',
    )
    await page.screenshot({ path: `${output}/${width}-transition.png` })
    await page.close()
  }
} finally {
  await browser.close()
}
