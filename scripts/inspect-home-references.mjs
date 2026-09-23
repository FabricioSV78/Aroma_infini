/* global document, window */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
const output = 'artifacts/reference-revisit'
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const results = await Promise.allSettled(
    [
      ['jovoy', 'https://www.jovoyparis.com/en/'],
      ['aedes', 'https://www.aedes.com/'],
      ['dsdurga', 'https://www.dsanddurga.com/'],
      ['vilhelm', 'https://vilhelmparfumerie.com/'],
      ['twistedlily', 'https://twistedlily.com/'],
      ['phlur', 'https://phlur.com/'],
    ].map(async ([name, url]) => {
      const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
      })
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
        await page.screenshot({
          path: `${output}/${name}-top.png`,
          timeout: 10000,
        })
        const summary = await page.evaluate(() => ({
          title: document.title,
          headings: [...document.querySelectorAll('h1,h2,h3')]
            .map((el) => el.textContent.trim())
            .filter(Boolean)
            .slice(0, 30),
        }))
        await page.evaluate(() => window.scrollTo(0, 1400))
        await page.screenshot({
          path: `${output}/${name}-middle.png`,
          timeout: 10000,
        })
        return { name, ...summary }
      } finally {
        await page.close()
      }
    }),
  )
  await writeFile(
    `${output}/observations.json`,
    JSON.stringify(results, null, 2),
  )
  console.log(results)
} finally {
  await browser.close()
}
