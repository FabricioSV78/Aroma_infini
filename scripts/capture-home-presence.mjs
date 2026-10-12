/* global document, window, getComputedStyle, innerWidth */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
const mode = process.argv[2] ?? 'before'
const captureRoot = process.argv[3] ?? 'artifacts/home-presence'
const output = `${captureRoot}/${mode}`
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
try {
  if (mode === 'references') {
    const results = await Promise.allSettled(
      [
        ['aerre', 'https://aerre.co/'],
        ['dsdurga', 'https://www.dsanddurga.com/'],
        ['phlur', 'https://phlur.com/'],
        ['jovoy', 'https://www.jovoyparis.com/en/'],
        ['saison', 'https://www.saison.com.au/'],
      ].map(async ([name, url]) => {
        const page = await browser.newPage({
          viewport: { width: 1440, height: 1000 },
        })
        try {
          await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 45000,
          })
          await page.waitForTimeout(3500)
          await page.screenshot({ path: `${output}/${name}.jpg`, quality: 75 })
          const typography = await page
            .locator('h1,h2,h3')
            .evaluateAll((elements) =>
              elements
                .filter((el) => el.getBoundingClientRect().height)
                .slice(0, 12)
                .map((el) => ({
                  text: el.textContent.trim(),
                  font: getComputedStyle(el).font,
                  color: getComputedStyle(el).color,
                })),
            )
          await page.evaluate(() => window.scrollTo(0, 1100))
          await page.waitForTimeout(1200)
          await page.screenshot({
            path: `${output}/${name}-middle.jpg`,
            quality: 75,
          })
          return { name, typography }
        } finally {
          await page.close()
        }
      }),
    )
    await writeFile(
      `${output}/observations.json`,
      JSON.stringify(results, null, 2),
    )
    console.log(JSON.stringify(results))
  } else {
    const results = []
    for (const [width, height] of [
      [1920, 1080],
      [1366, 768],
      [768, 1024],
      [390, 844],
    ]) {
      const page = await browser.newPage({
        viewport: { width, height },
        reducedMotion: 'reduce',
      })
      await page.goto('http://127.0.0.1:5173')
      await page.locator('.home h1').waitFor()
      await page.evaluate(() => document.fonts.ready)
      if (mode === 'after' && [1366, 390].includes(width)) {
        for (let slide = 0; slide < 5; slide += 1) {
          await page.locator('.hero-position-tracks button').nth(slide).click()
          await page
            .locator('.hero-slide.is-active img')
            .evaluate((image) => image.decode())
          await page
            .locator('.hero')
            .screenshot({ path: `${output}/hero-${width}-${slide + 1}.png` })
        }
        await page.locator('.hero-position-tracks button').first().click()
      }
      for (const section of await page.locator('[data-home-section]').all()) {
        await section.scrollIntoViewIfNeeded()
        await page.waitForTimeout(150)
      }
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: 'instant' }),
      )
      await page.evaluate(() => document.activeElement?.blur())
      await page.waitForTimeout(400)
      await page.locator('.home h1').waitFor()
      await page.screenshot({
        path: `${output}/home-${width}.png`,
        fullPage: true,
      })
      results.push(
        await page.evaluate(() => ({
          width: innerWidth,
          overflow: document.documentElement.scrollWidth > innerWidth,
          h1: document.querySelectorAll('h1').length,
          headings: [...document.querySelectorAll('.home h1,.home h2')].map(
            (el) => ({
              text: el.textContent,
              font: getComputedStyle(el).font,
              color: getComputedStyle(el).color,
            }),
          ),
          brokenImages: [...document.images]
            .filter((el) => el.complete && !el.naturalWidth)
            .map((el) => el.src),
        })),
      )
      for (const [name, selector] of [
        ['bestsellers', '.bestsellers-section'],
        ['brands', '.brand-gallery'],
        ['featured', '.featured-section'],
        ['footer', '.site-footer'],
      ]) {
        await page.evaluate(() => document.activeElement?.blur())
        await page.mouse.move(0, 0)
        await page.locator(selector).screenshot({
          path: `${output}/${name}-${width}.png`,
          style:
            '.site-header, .skip-link, .help-button { visibility: hidden !important; }',
        })
      }
      if (mode === 'after') {
        await page
          .locator('.discovery-section')
          .screenshot({ path: `${output}/categories-${width}.png` })
        const film = page.locator('.editorial-film')
        await film.scrollIntoViewIfNeeded()
        await film
          .getByRole('button', { name: 'Reproducir video editorial' })
          .click()
        await page.waitForFunction(
          () => document.querySelector('.editorial-film video').readyState >= 2,
        )
        await film
          .getByRole('button', { name: 'Pausar video editorial' })
          .click()
        await film.locator('video').evaluate(async (video) => {
          video.currentTime = 1
          await new Promise((resolve) =>
            video.addEventListener('seeked', resolve, { once: true }),
          )
        })
        await film.screenshot({ path: `${output}/video-${width}.png` })
      }
      await page.close()
    }
    await writeFile(`${output}/checks.json`, JSON.stringify(results, null, 2))
    console.log(JSON.stringify(results))
    if (mode === 'after') {
      await writeFile(
        `${captureRoot}/comparison.html`,
        `<!doctype html>
<html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Aroma Infini · Antes y después del Home</title>
<style>
body{margin:0;font:16px/1.5 system-ui,sans-serif;color:#242827;background:#f4f4f1}
header{padding:24px 4vw;background:white;border-bottom:1px solid #e5e7e5}
h1{font-size:26px;margin:0 0 8px}p{margin:8px 0}select{font:inherit;padding:8px;margin-left:12px}
main{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:24px}figure{margin:0;min-width:0}
figcaption{font-weight:700;margin-bottom:12px}img{width:100%;height:auto;display:block}
a:focus-visible,select:focus-visible{outline:3px solid #003935;outline-offset:4px}
@media(max-width:600px){main{padding:12px;gap:12px}h1{font-size:21px}}
</style>
<header><h1>Aroma Infini · Antes y después</h1><p>Capturas reales del mismo Home y el mismo tamaño de pantalla. Abre una imagen para examinarla a tamaño completo.</p>
<label for="size">Pantalla<select id="size"><option value="1920">Desktop · 1920 × 1080</option><option value="1366" selected>Laptop · 1366 × 768</option><option value="768">Tablet · 768 × 1024</option><option value="390">Móvil · 390 × 844</option></select></label>
<label for="section">Vista<select id="section"><option value="home">Home completo</option><option value="bestsellers">Más vendidos</option><option value="brands">Firmas con carácter</option><option value="featured">Dos perfumes, dos perfiles</option><option value="footer">Footer</option></select></label></header>
<main><figure><figcaption>Antes</figcaption><a id="before-link" href="before/home-1366.png"><img id="before" src="before/home-1366.png" alt="Home antes, laptop"></a></figure>
<figure><figcaption>Después</figcaption><a id="after-link" href="after/home-1366.png"><img id="after" src="after/home-1366.png" alt="Home después, laptop"></a></figure></main>
<script>function update(){const width=document.getElementById('size').value;const section=document.getElementById('section').value;for(const phase of ['before','after']){const path=phase+'/'+section+'-'+width+'.png';document.getElementById(phase).src=path;document.getElementById(phase).alt=section+' '+(phase==='before'?'antes':'después')+', '+width+' píxeles';document.getElementById(phase+'-link').href=path;}}document.getElementById('size').addEventListener('change',update);document.getElementById('section').addEventListener('change',update);</script></html>`,
      )
    }
  }
} finally {
  await browser.close()
}
