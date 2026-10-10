/* global CSS, document, HTMLElement, HTMLInputElement, window */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'

const baseUrl = 'http://127.0.0.1:5173'
const phase = process.argv[2] ?? 'review'
const routeFilter = process.argv[3]?.trim()
const output = `artifacts/visual-ux-audit/${phase}`

const storeRoutes = [
  ['home', '/'],
  ['tienda', '/tienda'],
  ['busqueda', '/buscar?q=petale'],
  ['marcas', '/marcas'],
  ['marca', '/marcas/forme'],
  ['producto', '/producto/petale-nu'],
  ['producto-verde', '/producto/vert-silence'],
  ['producto-ambar', '/producto/ambre-lent'],
  ['producto-neroli', '/producto/neroli-matin'],
  ['producto-iris', '/producto/iris-velours'],
  ['producto-figue', '/producto/figue-douce'],
  ['producto-santal', '/producto/santal-nuit'],
  ['producto-cedre', '/producto/bois-clair'],
  ['favoritos', '/favoritos'],
  ['carrito', '/carrito'],
  ['checkout', '/checkout'],
  ['confirmacion', '/checkout/confirmacion'],
  ['seguir-pedido', '/seguir-pedido'],
  ['cuenta-acceso', '/cuenta'],
  ['cuenta-resumen', '/cuenta'],
  ['cuenta-datos', '/cuenta/datos'],
  ['cuenta-direcciones', '/cuenta/direcciones'],
  ['cuenta-pedidos', '/cuenta/pedidos'],
  ['cuenta-pedido', '/cuenta/pedidos/AI-A1B2C3D4E5F60708'],
  ['cuenta-favoritos', '/cuenta/favoritos'],
  ['cuenta-pagos', '/cuenta/pagos'],
  ['nosotros', '/nosotros'],
  ['contacto', '/contacto'],
  ['envios', '/envios'],
  ['devoluciones', '/devoluciones'],
  ['privacidad', '/privacidad'],
  ['terminos', '/terminos'],
  ['reclamaciones', '/libro-de-reclamaciones'],
]

const adminRoutes = [
  ['admin-inicio', '/admin'],
  ['admin-productos', '/admin/productos'],
  ['admin-producto-nuevo', '/admin/productos/nuevo'],
  ['admin-producto-editar', '/admin/productos/cedre'],
  ['admin-marcas', '/admin/marcas'],
  ['admin-pedidos', '/admin/pedidos'],
  ['admin-pedido', '/admin/pedidos/AI-A1B2C3D4E5F60708'],
  ['admin-clientes', '/admin/clientes'],
  ['admin-promociones', '/admin/promociones'],
  ['admin-envios', '/admin/envios'],
  ['admin-home', '/admin/home'],
]

const matchesRouteFilter = ([name, route]) =>
  !routeFilter || name.includes(routeFilter) || route.includes(routeFilter)

const selectedStoreRoutes = storeRoutes.filter(matchesRouteFilter)
const selectedAdminRoutes = adminRoutes.filter(matchesRouteFilter)

await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome' })
const report = []

async function settle(page) {
  await page.locator('h1').first().waitFor({ state: 'visible' })
  await page.evaluate(async () => {
    await document.fonts.ready
    const images = [...document.images]
    // Full-page screenshots must wait for photographs below the fold too.
    for (const image of images) image.loading = 'eager'
    for (
      let top = 0;
      top < document.documentElement.scrollHeight;
      top += Math.max(600, window.innerHeight * 0.8)
    ) {
      window.scrollTo({ top, behavior: 'instant' })
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
    }
    await Promise.race([
      Promise.allSettled(images.map((image) => image.decode())),
      new Promise((resolve) => window.setTimeout(resolve, 7000)),
    ])
    window.scrollTo({ top: 0, behavior: 'instant' })
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    await new Promise((resolve) =>
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)),
    )
  })
}

async function activateAccountDemo(page) {
  await page.locator('.account-page, .account-access').waitFor()
  const demoNote = page.locator('.account-demo-note')
  if (await demoNote.isVisible().catch(() => false)) return

  const access = page.getByRole('button', {
    name: 'Ver mi cuenta',
  })
  await access.waitFor({ state: 'visible' })
  await access.click()
  await demoNote.waitFor({ state: 'visible' })
  await page.locator('.account-content h1').waitFor({ state: 'visible' })
}

async function seedCart(page) {
  await page.goto(`${baseUrl}/producto/petale-nu`)
  await settle(page)
  const add = page.getByRole('button', { name: /Añadir al carrito/i })
  if (await add.isEnabled()) {
    await add.click()
    await page.keyboard.press('Escape')
  }
}

async function measure(page, name, route, width, messages) {
  const metrics = await page.evaluate(() => {
    const root = document.documentElement
    const headings = [...document.querySelectorAll('h1')]
    const visible = (element) => {
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0
      )
    }
    const selectors = [
      'button',
      'summary',
      '[role="tab"]',
      'input[type="checkbox"]',
      'input[type="radio"]',
    ]
    const smallTargets = [...document.querySelectorAll(selectors.join(','))]
      .filter(visible)
      .filter((element) => !element.classList.contains('sr-only'))
      .map((element) => {
        const ownRect = element.getBoundingClientRect()
        const label =
          element instanceof HTMLInputElement
            ? (element.closest('label') ??
              (element.id
                ? document.querySelector(
                    `label[for="${CSS.escape(element.id)}"]`,
                  )
                : null))
            : null
        const rect =
          label && visible(label) ? label.getBoundingClientRect() : ownRect
        return {
          element: element.tagName.toLowerCase(),
          label:
            element.getAttribute('aria-label') ??
            element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        }
      })
      .filter(({ width, height }) => width < 44 || height < 44)

    const clipped = [
      ...document.querySelectorAll('h1,h2,h3,p,span,a,button,label'),
    ]
      .filter(visible)
      .filter((element) => !element.closest('.sr-only'))
      .filter((element) => {
        const style = window.getComputedStyle(element)
        return (
          element.scrollWidth > element.clientWidth + 2 &&
          ['hidden', 'clip'].includes(style.overflowX)
        )
      })
      .slice(0, 12)
      .map((element) => ({
        element: element.tagName.toLowerCase(),
        text: element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 100),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }))

    return {
      title: document.title,
      h1Count: headings.length,
      h1: headings.map((heading) => heading.textContent?.trim()),
      firstHeadingTop: headings[0]
        ? Math.round(headings[0].getBoundingClientRect().top)
        : null,
      documentHeight: root.scrollHeight,
      viewportHeight: window.innerHeight,
      scrollScreens: Number(
        (root.scrollHeight / window.innerHeight).toFixed(2),
      ),
      horizontalOverflow: root.scrollWidth > window.innerWidth,
      overflowPixels: Math.max(0, root.scrollWidth - window.innerWidth),
      brokenImages: [...document.images]
        .filter((image) => image.complete && image.naturalWidth === 0)
        .map((image) => image.currentSrc || image.src),
      pendingImages: [...document.images]
        .filter(
          (image) =>
            !image.complete &&
            !image.closest('.hero-slide[aria-hidden="true"]'),
        )
        .map((image) => image.currentSrc || image.src),
      smallTargets,
      clipped,
    }
  })

  await page.screenshot({
    path: `${output}/${name}-${width}x${metrics.viewportHeight}.jpg`,
    fullPage: true,
    type: 'jpeg',
    quality: 76,
  })

  report.push({ name, route, width, ...metrics, messages: [...messages] })
}

try {
  for (const { width, height } of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
    { width: 2560, height: 1440 },
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: width < 1024,
      reducedMotion: 'reduce',
      colorScheme: 'light',
    })
    const page = await context.newPage()
    const messages = []
    page.on('pageerror', (error) =>
      messages.push(`pageerror: ${error.message}`),
    )
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type())) {
        messages.push(`${message.type()}: ${message.text()}`)
      }
    })

    if (
      selectedStoreRoutes.some(([name]) =>
        ['carrito', 'checkout', 'confirmacion'].includes(name),
      )
    ) {
      await seedCart(page)
    }

    for (const [name, route] of selectedStoreRoutes) {
      messages.length = 0
      await page.goto(`${baseUrl}${route}`)
      if (name.startsWith('cuenta-') && name !== 'cuenta-acceso') {
        await activateAccountDemo(page)
      }
      await settle(page)
      await measure(page, name, route, width, messages)
    }

    for (const [name, route] of selectedAdminRoutes) {
      messages.length = 0
      await page.goto(`${baseUrl}${route}`)
      await settle(page)
      await measure(page, name, route, width, messages)
    }

    await context.close()
  }
} finally {
  await browser.close()
}

await writeFile(
  `${output}/report.json`,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      phase,
      routes: report.length,
      report,
    },
    null,
    2,
  ),
)

const failures = report.filter(
  (entry) =>
    entry.horizontalOverflow ||
    entry.brokenImages.length > 0 ||
    entry.pendingImages.length > 0 ||
    entry.messages.length > 0 ||
    entry.h1Count !== 1,
)

console.log(
  JSON.stringify(
    {
      captures: report.length,
      failures: failures.map(({ name, width, route }) => ({
        name,
        width,
        route,
      })),
      smallTargetFindings: report.reduce(
        (total, entry) => total + entry.smallTargets.length,
        0,
      ),
      clippedTextFindings: report.reduce(
        (total, entry) => total + entry.clipped.length,
        0,
      ),
    },
    null,
    2,
  ),
)
