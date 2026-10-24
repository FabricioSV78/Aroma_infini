/* global document, window */
import { chromium } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

const phase = process.argv[2]
if (!['before', 'after', 'compare'].includes(phase))
  throw new Error(
    'Uso: node scripts/capture-technical-audit.mjs before|after|compare',
  )
const output = process.env.AUDIT_CAPTURE_OUTPUT ?? 'artifacts/technical-audit/2026-10-23'
const baseURL = process.env.AUDIT_CAPTURE_URL ?? 'http://127.0.0.1:5173'
const onlyRoute = process.argv[3]
const viewports = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
]
const routes = [
  ['home', '/'],
  ['catalog', '/tienda'],
  ['brands', '/marcas'],
  ['product', '/producto/bois-clair'],
  ['favorites', '/favoritos'],
  ['cart', '/carrito'],
  ['checkout', '/checkout'],
  ['about', '/nosotros'],
  ['contact', '/contacto'],
  ['tracking', '/seguir-pedido'],
  ['shipping', '/envios'],
  ['returns', '/devoluciones'],
  ['account', '/cuenta'],
  ['admin-dashboard', '/admin'],
  ['admin-products', '/admin/productos'],
  ['admin-new-product', '/admin/productos/nuevo'],
  ['admin-edit-product', '/admin/productos/cedre'],
  ['admin-orders', '/admin/pedidos'],
  ['admin-order-detail', '/admin/pedidos/AI-210926-01'],
  ['admin-customers', '/admin/clientes'],
  ['admin-brands', '/admin/marcas'],
  ['admin-promotions', '/admin/promociones'],
  ['admin-shipping', '/admin/envios'],
  ['admin-home', '/admin/home'],
]

await mkdir(join(output, phase), { recursive: true })
if (phase === 'compare') {
  const baseline = JSON.parse(
    await readFile(join(output, 'before.json'), 'utf8'),
  )
  const results = []
  for (const previous of baseline) {
    const filename = `${previous.name}-${previous.viewport}.png`
    const before = await sharp(join(output, 'before', filename))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const after = await sharp(join(output, 'after', filename))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    if (
      before.info.width !== after.info.width ||
      before.info.height !== after.info.height
    ) {
      results.push({
        filename,
        sameDimensions: false,
        before: before.info,
        after: after.info,
      })
      continue
    }
    let changed = 0
    let substantial = 0
    for (let i = 0; i < before.data.length; i += 4) {
      const difference = Math.max(
        Math.abs(before.data[i] - after.data[i]),
        Math.abs(before.data[i + 1] - after.data[i + 1]),
        Math.abs(before.data[i + 2] - after.data[i + 2]),
      )
      if (difference) changed++
      if (difference > 12) substantial++
    }
    const pixels = before.info.width * before.info.height
    results.push({
      filename,
      sameDimensions: true,
      changedPixels: changed,
      changedPercent: (changed / pixels) * 100,
      substantialPercent: (substantial / pixels) * 100,
    })
  }
  await writeFile(
    join(output, 'visual-comparison.json'),
    JSON.stringify(results, null, 2),
  )
  console.log(
    JSON.stringify(
      {
        captures: results.length,
        identical: results.filter((r) => r.changedPixels === 0).length,
        differentDimensions: results.filter((r) => !r.sameDimensions).length,
        largestDifferences: [...results]
          .sort(
            (a, b) => (b.substantialPercent || 0) - (a.substantialPercent || 0),
          )
          .slice(0, 8),
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const results = onlyRoute
  ? JSON.parse(await readFile(join(output, `${phase}.json`), 'utf8')).filter(
      (result) => result.route !== onlyRoute,
    )
  : []
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport,
      reducedMotion: 'reduce',
      deviceScaleFactor: 1,
    })
    await context.addInitScript(() => {
      window.localStorage.setItem(
        'aroma-infini:cart:v1',
        JSON.stringify({
          version: 1,
          items: [{ variantId: 'cedre-50', quantity: 1 }],
        }),
      )
      window.localStorage.setItem(
        'aroma-infini:favorites:v1',
        JSON.stringify({ version: 1, ids: ['cedre', 'petale'] }),
      )
    })
    let page
    const failures = []
    for (const [name, route] of routes) {
      if (onlyRoute && route !== onlyRoute) continue
      page = await context.newPage()
      failures.length = 0
      page.on('dialog', (dialog) => dialog.accept())
      page.on('pageerror', (error) => failures.push(error.message))
      await page.goto(`${baseURL}${route}`, {
        waitUntil: 'networkidle',
      })
      await page.locator('h1').first().waitFor()
      await capture(name)
      if (name === 'home') {
        await page
          .getByRole('button', { name: 'Encontrar mi perfume', exact: true })
          .click()
        const dialog = page.getByRole('dialog', {
          name: 'Encuentra tu perfume ideal',
          exact: true,
        })
        await dialog
          .getByRole('heading', { name: '¿Qué aroma te atrae más?' })
          .waitFor()
        await capture('finder-question')
        for (const option of [/Floral/, 'Diario', 'Suave']) {
          await dialog
            .getByRole('checkbox', {
              name: option,
              exact: typeof option === 'string',
            })
            .check()
          await dialog
            .getByRole('button', { name: 'Continuar', exact: true })
            .click()
        }
        await dialog
          .getByRole('radio', { name: 'Hasta S/ 500', exact: true })
          .check()
        await dialog
          .getByRole('button', { name: 'Ver mis perfumes', exact: true })
          .click()
        await dialog
          .getByRole('heading', { name: 'Pétale Nu', exact: true })
          .waitFor()
        await capture('finder-result')
      }
      if (name === 'catalog') {
        const filter = page
          .getByRole('button', { name: /Filtrar|Filtros/ })
          .first()
        if (viewport.width < 1000 && (await filter.isVisible())) {
          await filter.click()
          await capture('catalog-filters')
        }
      }
      if (name === 'admin-products') {
        const disclosure = page.locator('.admin-product-import > summary')
        if (await disclosure.count()) {
          await disclosure.click()
          await capture('admin-import-panel')
        }
        const button = page
          .getByRole('button', { name: /Importar.*Excel/ })
          .first()
        if (await button.isVisible()) {
          await button.click()
          await capture('admin-import-modal')
        }
      }
      if (name === 'admin-edit-product') {
        await page
          .getByRole('button', { name: /Vista previa/i })
          .first()
          .click()
        await capture('admin-product-preview')
      }
      if (name === 'admin-home') {
        await page
          .getByRole('button', { name: /Para él, para ella y unisex/ })
          .click()
        await capture('admin-home-categories')
        await page
          .getByRole('button', {
            name: 'Encuentra tu perfume ideal',
            exact: true,
          })
          .click()
        await capture('admin-home-finder')
        await page.getByRole('button', { name: 'Marcas', exact: true }).click()
        await capture('admin-home-featured-brand')
      }
      await page.close()
    }
    await context.close()

    async function capture(name) {
      await page.evaluate(async () => {
        const family = window.getComputedStyle(document.body).fontFamily
        await Promise.all(
          [300, 400, 500, 600, 700].map((weight) =>
            document.fonts.load(`${weight} 16px ${family}`),
          ),
        )
        await document.fonts.ready
        for (const image of document.images) image.loading = 'eager'
        await Promise.all(
          [...document.images].map((image) =>
            image.decode().catch(() => undefined),
          ),
        )
        for (const video of document.querySelectorAll('video')) video.pause()
        window.scrollTo(0, 0)
        await new Promise((resolve) =>
          window.requestAnimationFrame(() =>
            window.requestAnimationFrame(resolve),
          ),
        )
      })
      // Intersection observers and focus/scroll locks settle before either snapshot.
      await page.waitForTimeout(150)
      await page.screenshot({
        path: join(output, phase, `${name}-${viewport.name}.png`),
        fullPage: (await page.locator('dialog[open]').count()) === 0,
        animations: 'disabled',
      })
      results.push({
        name,
        viewport: viewport.name,
        route: new URL(page.url()).pathname,
        metrics: await page.evaluate(() => ({
          width: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          height: document.querySelector('dialog[open]')
            ? window.innerHeight
            : document.documentElement.scrollHeight,
          headings: [...document.querySelectorAll('h1,h2,h3')].map(
            (h) => h.textContent,
          ),
          brokenImages: [...document.images]
            .filter((i) => i.currentSrc && !i.naturalWidth)
            .map((i) => i.currentSrc),
        })),
        failures: [...failures],
      })
      await writeFile(
        join(output, `${phase}.json`),
        JSON.stringify(results, null, 2),
      )
      console.log(`${phase}: ${name} ${viewport.name}`)
    }
  }
} finally {
  await browser.close()
}
