/* global getComputedStyle */
import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto('http://127.0.0.1:5173/producto/bois-clair')
  const button = page.locator('.product-cart-button')
  const color = () => button.evaluate(node => getComputedStyle(node, '::before').transform)
  const initial = await color()
  await button.hover()
  await page.waitForTimeout(220)
  await button.screenshot({ path: 'artifacts/cart-button-mid-enter.png' })
  await page.waitForTimeout(330)
  const hovered = await color()
  await page.mouse.move(0, 0)
  await page.waitForTimeout(220)
  await button.screenshot({ path: 'artifacts/cart-button-mid-exit.png' })
  await page.waitForTimeout(330)
  const restored = await color()
  if (initial === hovered || initial !== restored) throw new Error('Hover transition did not return to its original color')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const reducedDuration = await button.evaluate(node => getComputedStyle(node, '::before').transitionDuration)
  console.log({ initial, hovered, restored, reducedDuration })
} finally { await browser.close() }
