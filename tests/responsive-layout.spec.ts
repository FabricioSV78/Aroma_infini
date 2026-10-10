import { expect, test, type Page } from '@playwright/test'

const viewports = [
  { width: 320, height: 700 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1600, height: 900 },
  { width: 1904, height: 947 },
  { width: 844, height: 390 },
  { width: 1280, height: 600 },
  { width: 2560, height: 1440 },
]

const storeRoutes = [
  '/',
  '/tienda',
  '/marcas',
  '/producto/petale-nu',
  '/carrito',
  '/checkout',
  '/seguir-pedido',
  '/nosotros',
  '/envios',
  '/libro-de-reclamaciones',
]

const adminRoutes = [
  '/admin',
  '/admin/productos',
  '/admin/productos/petale',
  '/admin/pedidos',
  '/admin/pedidos/AI-A1B2C3D4E5F60708',
  '/admin/promociones',
  '/admin/envios',
  '/admin/home',
]

interface LayoutAudit {
  bodyWidth: number
  scrollWidth: number
  outsideControls: string[]
  brokenImages: string[]
  widestContainer: number
}

async function auditRoute(page: Page, route: string) {
  await page.goto(route)
  await page.evaluate(async () => {
    const maximum = document.documentElement.scrollHeight - innerHeight
    const steps = Math.min(6, Math.max(1, Math.ceil(maximum / innerHeight)))
    for (let index = 1; index <= steps; index += 1) {
      scrollTo(0, (maximum * index) / steps)
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    scrollTo(0, 0)
  })

  return page.evaluate<LayoutAudit>(() => {
    const bodyWidth = document.body.clientWidth
    const isVisible = (element: Element) => {
      const style = getComputedStyle(element)
      const bounds = element.getBoundingClientRect()
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        bounds.width > 0 &&
        bounds.height > 0
      )
    }
    const isClippedByContainer = (element: Element) => {
      const bounds = element.getBoundingClientRect()
      let ancestor = element.parentElement
      while (ancestor && ancestor !== document.body) {
        const overflow = getComputedStyle(ancestor).overflowX
        if (['auto', 'clip', 'hidden', 'scroll'].includes(overflow)) {
          const ancestorBounds = ancestor.getBoundingClientRect()
          if (
            bounds.left < ancestorBounds.left - 1 ||
            bounds.right > ancestorBounds.right + 1
          )
            return true
        }
        ancestor = ancestor.parentElement
      }
      return false
    }
    const outsideControls = [
      ...document.querySelectorAll(
        'a, button, input, select, textarea, [role="button"], [role="tab"]',
      ),
    ]
      .filter(isVisible)
      .filter((element) => {
        const bounds = element.getBoundingClientRect()
        return (
          (bounds.left < -1 || bounds.right > bodyWidth + 1) &&
          !isClippedByContainer(element)
        )
      })
      .map(
        (element) =>
          element.getAttribute('aria-label') ||
          element.textContent?.trim().slice(0, 80) ||
          element.tagName,
      )
    const brokenImages = [...document.images]
      .filter(
        (image) =>
          isVisible(image) && image.complete && image.naturalWidth === 0,
      )
      .map((image) => image.currentSrc || image.src)
    const widestContainer = Math.max(
      0,
      ...[...document.querySelectorAll('.container')]
        .filter(isVisible)
        .map((element) => element.getBoundingClientRect().width),
    )
    return {
      bodyWidth,
      scrollWidth: document.documentElement.scrollWidth,
      outsideControls,
      brokenImages,
      widestContainer,
    }
  })
}

for (const viewport of viewports) {
  test(`Tienda y panel conservan proporción y controles visibles a ${viewport.width}px`, async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const runtimeErrors: string[] = []
    page.on('pageerror', (error) => runtimeErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(message.text())
    })

    for (const route of [...storeRoutes, ...adminRoutes]) {
      const audit = await auditRoute(page, route)
      expect(audit.scrollWidth, route).toBeLessThanOrEqual(audit.bodyWidth + 1)
      expect(audit.outsideControls, route).toEqual([])
      expect(audit.brokenImages, route).toEqual([])

      if (viewport.width >= 1600 && route === '/tienda') {
        expect(audit.widestContainer, route).toBeGreaterThan(1500)
        expect(audit.widestContainer, route).toBeLessThanOrEqual(1680)
      }
    }

    expect(runtimeErrors).toEqual([])
  })
}

for (const viewport of [
  viewports[0],
  viewports[2],
  viewports[4],
  viewports[6],
]) {
  test(`La cuenta activa mantiene su pedido dentro de ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/cuenta')
    await page.getByRole('button', { name: 'Ver mi cuenta' }).click()

    for (const route of [
      '/cuenta',
      '/cuenta/datos',
      '/cuenta/direcciones',
      '/cuenta/pedidos/AI-A1B2C3D4E5F60708',
    ]) {
      const audit = await auditRoute(page, route)
      expect(audit.scrollWidth, route).toBeLessThanOrEqual(audit.bodyWidth + 1)
      expect(audit.outsideControls, route).toEqual([])
      expect(audit.brokenImages, route).toEqual([])
    }
  })
}
