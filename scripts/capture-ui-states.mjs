/* global document, window */
import { chromium, expect } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const phase = process.argv[2]
if (!['before', 'after', 'compare'].includes(phase))
  throw new Error(
    'Uso: node scripts/capture-ui-states.mjs before|after|compare',
  )

const output =
  process.env.UI_STATES_CAPTURE_OUTPUT ?? 'artifacts/ui-states/2026-10-23'
const baseURL =
  process.env.UI_STATES_CAPTURE_URL ??
  (phase === 'before'
    ? (process.env.UI_STATES_BASELINE_URL ?? 'http://127.0.0.1:5174')
    : (process.env.UI_STATES_AFTER_URL ?? 'http://127.0.0.1:5173'))
const onlyNames = new Set(
  (process.env.UI_STATES_ONLY ?? '').split(',').filter(Boolean),
)
const viewports = [
  { name: 'desktop-large', width: 1920, height: 1080 },
  { name: 'desktop-medium', width: 1440, height: 900 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
]
const scenarios = [
  { name: 'favorites-empty', route: '/favoritos' },
  { name: 'cart-empty', route: '/carrito' },
  {
    name: 'cart-drawer-empty',
    route: '/carrito',
    async prepare(page) {
      await page.getByRole('button', { name: 'Carrito', exact: true }).click()
      await page
        .getByRole('dialog', { name: 'Tu carrito', exact: true })
        .waitFor()
    },
  },
  { name: 'catalog-no-matches', route: '/tienda?min=99999' },
  { name: 'search-no-matches', route: '/buscar?q=zzzz' },
  {
    name: 'brands-empty',
    route: '/marcas',
    controls: { getBrandPreviews: { empty: true } },
  },
  {
    name: 'brands-error',
    route: '/marcas',
    controls: { getBrandPreviews: { fail: true } },
  },
  { name: 'product-missing', route: '/producto/producto-inexistente' },
  {
    name: 'admin-customers-no-matches',
    route: '/admin/clientes',
    async prepare(page) {
      await page.getByLabel('Buscar cliente', { exact: true }).fill('zzzzzz')
      await expect(page.locator('.admin-customer-result')).toContainText(
        '0 clientes',
      )
    },
  },
  {
    name: 'catalog-initial-pending',
    route: '/tienda',
    controls: { getCatalog: { wait: true } },
    initialPending: true,
  },
  {
    name: 'catalog-filter-pending',
    route: '/tienda',
    controls: {},
    async prepare(page) {
      const cards = page.locator('.catalog-results .product-card')
      await expect(cards).not.toHaveCount(0)
      const previousCards = await cards.count()
      await page.evaluate(() => {
        window.__uiStateReads.getCatalog.wait = true
      })
      await page
        .getByLabel('Ordenar', { exact: true })
        .selectOption('precio-desc')
      await page.waitForFunction(
        () => typeof window.__uiStateReads?.getCatalog?.release === 'function',
      )
      if (phase === 'after')
        await expect(page.locator('.catalog-results')).toHaveAttribute(
          'aria-busy',
          'true',
        )
      await expect(cards).toHaveCount(previousCards)
    },
  },
]

await mkdir(output, { recursive: true })
if (phase === 'compare') {
  const failures = await writeGallery()
  if (failures)
    throw new Error(
      `${failures} capturas requieren revisión. Consulta ${output}/comparison.json.`,
    )
  process.exit(0)
}

await mkdir(join(output, phase), { recursive: true })
let results = []
if (onlyNames.size) {
  try {
    results = JSON.parse(
      await readFile(join(output, `${phase}.json`), 'utf8'),
    ).filter((result) => !onlyNames.has(result.name))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const viewport of viewports) {
    for (const scenario of scenarios) {
      if (onlyNames.size && !onlyNames.has(scenario.name)) continue
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        reducedMotion: 'reduce',
        deviceScaleFactor: 1,
      })
      const page = await context.newPage()
      page.setDefaultTimeout(15_000)
      const pageErrors = []
      const consoleErrors = []
      const result = {
        name: scenario.name,
        viewport: viewport.name,
        width: viewport.width,
        height: viewport.height,
        route: scenario.route,
        filename: `${scenario.name}-${viewport.name}.png`,
        pageErrors,
        consoleErrors,
      }
      page.on('pageerror', (error) => pageErrors.push(error.message))
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text())
      })
      try {
        if (scenario.controls) await controlReads(page, scenario.controls)
        await page.goto(new URL(scenario.route, baseURL).href, {
          waitUntil: scenario.initialPending
            ? 'domcontentloaded'
            : 'networkidle',
        })
        if (scenario.initialPending)
          await page.waitForFunction(
            () =>
              typeof window.__uiStateReads?.getCatalog?.release === 'function',
          )
        else await page.locator('h1').first().waitFor()
        await scenario.prepare?.(page)
        await settleCapture(page)
        result.metrics = await measure(page)
        await page.screenshot({
          path: join(output, phase, result.filename),
          fullPage: (await page.locator('dialog[open]').count()) === 0,
          animations: 'disabled',
        })
        result.overflow =
          result.metrics.scrollWidth > result.metrics.viewportWidth + 1 ||
          result.metrics.dialogOverflow
        result.failed =
          result.overflow ||
          pageErrors.length > 0 ||
          consoleErrors.length > 0 ||
          result.metrics.brokenImages.length > 0
      } catch (error) {
        result.failed = true
        result.captureError = error.message
        try {
          await page.screenshot({
            path: join(output, phase, result.filename),
            animations: 'disabled',
          })
        } catch {
          // The original capture error remains in the machine-readable report.
        }
      } finally {
        results.push(result)
        await writeFile(
          join(output, `${phase}.json`),
          JSON.stringify(results, null, 2),
        )
        await context.close()
      }
      console.log(
        `${phase}: ${scenario.name} ${viewport.name}${result.failed ? ' FAIL' : ''}`,
      )
    }
  }
} finally {
  await browser.close()
}
await writeGallery()
const failed = results.filter((result) => result.failed)
console.log(
  JSON.stringify(
    { phase, baseURL, captures: results.length, failed: failed.length, output },
    null,
    2,
  ),
)
if (failed.length)
  throw new Error(
    `${failed.length} capturas requieren revisión. Consulta ${output}/${phase}.json.`,
  )

async function controlReads(page, controls) {
  await page.addInitScript((initial) => {
    window.__uiStateReads = initial
  }, controls)
  await page.route(
    (url) => url.pathname === '/src/services/catalog-service.ts',
    async (route) => {
      const response = await route.fetch()
      await route.fulfill({
        response,
        body:
          (await response.text()) +
          `\nfor (const method of ['getCatalog', 'getBrandPreviews']) {
            const original = catalogService[method];
            catalogService[method] = async (...args) => {
              const controls = window.__uiStateReads ||= {};
              const control = controls[method] ||= {};
              control.calls = (control.calls || 0) + 1;
              if (control.wait) await new Promise(resolve => { control.release = resolve; });
              if (control.fail) throw new Error('Controlled visual-audit read failure');
              const result = await original(...args);
              return control.empty ? [] : result;
            };
          }`,
      })
    },
  )
}

async function settleCapture(page) {
  await page.evaluate(async () => {
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
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)),
    )
  })
  // Capture-only settling for reveal/focus observers, never a product delay.
  await page.waitForTimeout(150)
}

async function measure(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('dialog[open]')
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      dialogOverflow: dialog
        ? dialog.scrollWidth > dialog.clientWidth + 1
        : false,
      headings: [...document.querySelectorAll('h1,h2,h3')].map((heading) =>
        heading.textContent?.trim(),
      ),
      busyRegions: [...document.querySelectorAll('[aria-busy="true"]')].map(
        (element) => element.className,
      ),
      statuses: [...document.querySelectorAll('[role="status"],[role="alert"]')]
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => element.textContent?.trim()),
      brokenImages: [...document.images]
        .filter(
          (image) => image.complete && image.currentSrc && !image.naturalWidth,
        )
        .map((image) => image.currentSrc),
    }
  })
}

async function writeGallery() {
  const phases = {}
  for (const key of ['before', 'after']) {
    try {
      phases[key] = JSON.parse(
        await readFile(join(output, `${key}.json`), 'utf8'),
      )
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      phases[key] = []
    }
  }
  const pairs = new Map()
  for (const key of ['before', 'after'])
    for (const result of phases[key]) {
      const pair = pairs.get(result.filename) ?? {
        name: result.name,
        viewport: result.viewport,
        width: result.width,
        height: result.height,
        filename: result.filename,
      }
      pair[key] = result
      pairs.set(result.filename, pair)
    }
  const comparison = [...pairs.values()]
  await writeFile(
    join(output, 'comparison.json'),
    JSON.stringify(comparison, null, 2),
  )
  const escape = (value) =>
    String(value).replace(/[&<>"']/g, (character) => {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[character]
    })
  const panels = comparison
    .map(
      (pair) => `<section id="${escape(pair.filename)}">
        <h2>${escape(pair.name)} <small>${pair.width} × ${pair.height}</small></h2>
        <div class="pair">${['before', 'after']
          .map((key) => {
            const result = pair[key]
            return `<figure><figcaption>${key === 'before' ? 'Antes' : 'Después'}${result?.failed ? ' · Requiere revisión' : ''}</figcaption>${
              result
                ? `<a href="${key}/${escape(pair.filename)}" target="_blank" rel="noopener"><img loading="lazy" src="${key}/${escape(pair.filename)}" alt="${key === 'before' ? 'Antes' : 'Después'}: ${escape(pair.name)}, ${escape(pair.viewport)}"></a><p>${result.metrics?.scrollWidth ?? '—'} px de contenido · ${result.pageErrors.length} errores · ${result.overflow ? 'Desbordamiento' : 'Sin desbordamiento detectado'}</p>${result.captureError ? `<p class="error">${escape(result.captureError)}</p>` : ''}`
                : '<p>Captura pendiente</p>'
            }</figure>`
          })
          .join('')}</div>
      </section>`,
    )
    .join('\n')
  await writeFile(
    join(output, 'comparison.html'),
    `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aroma Infini · Auditoría de estados</title>
    <style>body{margin:0;padding:24px;background:#f5f3ef;color:#183c35;font:15px/1.5 system-ui,sans-serif}main{max-width:1800px;margin:auto}h1{font-size:28px}h2{margin:0 0 12px;font-size:19px}small{font-size:13px;font-weight:400}section{padding:24px 0;border-top:1px solid #cbd4cf}.pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}figure{margin:0;min-width:0}figcaption{font-weight:650;margin-bottom:8px}img{display:block;width:100%;height:auto;background:white;border:1px solid #d5d8d3;box-sizing:border-box}p{font-size:13px}.error{color:#9c3037}a{color:inherit}@media(max-width:720px){.pair{grid-template-columns:1fr}body{padding:16px}}</style>
    <main><h1>Aroma Infini · Estados vacíos, carga y errores</h1><p>Antes a la izquierda, después a la derecha. Abre cada imagen para inspeccionarla a resolución completa. Las promesas retenidas pertenecen únicamente a esta captura controlada.</p><p><a href="before.json">Métricas anteriores</a> · <a href="after.json">Métricas actuales</a> · <a href="comparison.json">Comparación JSON</a></p><p><a href="admin-states/admin-save-pending-mobile.png">Guardado en móvil</a> · <a href="admin-states/admin-save-error-laptop.png">Error y reintento en el panel</a> · <a href="admin-states/report.json">20 capturas administrativas</a> · <a href="pages/after.json">126 capturas del recorrido general</a></p>${panels}</main></html>`,
  )
  return comparison.reduce(
    (count, pair) =>
      count +
      Number(Boolean(pair.before?.failed)) +
      Number(Boolean(pair.after?.failed)),
    0,
  )
}
