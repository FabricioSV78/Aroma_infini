/* global document, window, getComputedStyle */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const directory = ['premium', 'refinement', 'final'].includes(process.argv[2])
  ? `artifacts/navigation/${process.argv[2]}`
  : 'artifacts/navigation'
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
try {
  for (const width of [390, 1280, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: width === 390 ? 844 : 900 },
      reducedMotion: 'reduce',
    })
    await page.goto('http://127.0.0.1:5173')
    await page.evaluate(() => document.fonts.ready)
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector('.site-header'))
          .backgroundColor === 'rgba(0, 0, 0, 0)',
    )
    await page.screenshot({ path: `${directory}/closed-${width}.png` })
    if (width < 1200)
      await page.getByRole('button', { name: 'Abrir menú' }).click()
    for (const group of ['perfumes', 'marcas']) {
      if (width >= 1200) {
        const trigger = page.locator(`#nav-trigger-${group}`)
        await trigger.focus()
        await page.keyboard.press('Enter')
        await page.locator(`#nav-panel-${group}`).waitFor({ state: 'visible' })
      } else {
        const trigger = page.locator(
          `button[aria-controls="mobile-group-${group}"]`,
        )
        if ((await trigger.getAttribute('aria-expanded')) === 'false')
          await trigger.click()
        await page
          .locator('.menu-dialog')
          .evaluate((element) =>
            element.scrollTo({ top: 0, behavior: 'instant' }),
          )
      }
      await page.screenshot({ path: `${directory}/${group}-${width}.png` })
      if (width >= 1200) await page.keyboard.press('Escape')
    }
    const aboutLink = page.getByRole('link', {
      name: 'Aroma Infini',
      exact: true,
    })
    await aboutLink.last().scrollIntoViewIfNeeded()
    await aboutLink.last().focus()
    await page.screenshot({ path: `${directory}/aroma-infini-${width}.png` })
    console.log(
      `${width}px:`,
      await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      })),
    )
    await page.close()
  }
} finally {
  await browser.close()
}
