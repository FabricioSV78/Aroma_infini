/* global document, window */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const output = 'artifacts/editorial-review'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' })
  await page.goto('http://127.0.0.1:5173/')
  const poster = await page.evaluate(async () => {
    const film = document.createElement('video')
    film.muted = true
    film.src = '/videos/perfume-ritual.mp4'
    await new Promise((resolve, reject) => {
      film.onloadedmetadata = resolve
      film.onerror = reject
    })
    film.currentTime = 8
    await new Promise((resolve) => {
      film.onseeked = resolve
    })
    const canvas = document.createElement('canvas')
    canvas.width = 720
    canvas.height = 1280
    canvas.getContext('2d').drawImage(film, 0, 0, 720, 1280)
    film.removeAttribute('src')
    film.load()
    return canvas.toDataURL('image/webp', 0.8).split(',')[1]
  })
  await writeFile(
    'public/videos/perfume-ritual.webp',
    Buffer.from(poster, 'base64'),
  )
  const checks = []
  await page.goto('http://127.0.0.1:5173/cuenta')
  await page.getByRole('button', { name: 'Ver mi cuenta' }).click()
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 960 })
    for (const [name, route, selector] of [
      ['film', '/', '.editorial-film'],
      ['reviews', '/producto/petale-nu', '.product-reviews-preview'],
    ]) {
      await page.goto(`http://127.0.0.1:5173${route}`)
      const section = page.locator(selector)
      await section.scrollIntoViewIfNeeded()
      await section.evaluate((node) => {
        window.scrollTo({
          top: node.getBoundingClientRect().top + window.scrollY - 140,
          behavior: 'instant',
        })
      })
      await page.screenshot({ path: `${output}/${name}-${width}-viewport.png` })
      await section.screenshot({
        path: `${output}/${name}-${width}.png`,
        style:
          '.site-header, .skip-link, .contact-help { visibility: hidden !important; }',
      })
      checks.push({
        width,
        name,
        overflow: await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
      })
      if (name === 'reviews') {
        await section
          .getByRole('button', { name: 'Escribir una reseña' })
          .click()
        await page
          .locator('.review-form')
          .screenshot({ path: `${output}/form-${width}.png` })
      }
    }
  }
  await writeFile(`${output}/checks.json`, JSON.stringify(checks, null, 2))
  console.log(checks)
} finally {
  await browser.close()
}
