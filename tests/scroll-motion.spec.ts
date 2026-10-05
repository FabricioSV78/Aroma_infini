import { expect, test, type Page } from '@playwright/test'

const mobileRoutes = [
  '/',
  '/tienda',
  '/marcas',
  '/producto/petale-nu',
  '/carrito',
  '/checkout',
  '/cuenta',
  '/nosotros',
  '/seguir-pedido',
]

const desktopRoutes = ['/', '/tienda', '/producto/petale-nu', '/nosotros']

async function revealEverySection(page: Page) {
  const elements = page.locator('[data-scroll-reveal], [data-reveal]')
  const count = await elements.count()
  expect(count).toBeGreaterThan(0)

  for (let index = 0; index < count; index += 1) {
    const element = elements.nth(index)
    const participatesInLayout = await element.evaluate(
      (node) => node.getClientRects().length > 0,
    )
    if (!participatesInLayout) continue
    await element.evaluate((node) =>
      node.scrollIntoView({ block: 'center', behavior: 'smooth' }),
    )
    await expect(element).toHaveAttribute('data-revealed', '', {
      timeout: 2_000,
    })
  }

  await page.waitForTimeout(900)
}

for (const { width, routes } of [
  { width: 390, routes: mobileRoutes },
  { width: 1440, routes: desktopRoutes },
]) {
  test(`El scroll revela cada bloque público sin recortes ni errores a ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const errors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })
    page.on('pageerror', (error) => errors.push(error.message))

    for (const route of routes) {
      await page.goto(route)
      await expect(page.locator('.store-layout')).toHaveAttribute(
        'data-scroll-ready',
        '',
      )
      await revealEverySection(page)

      expect(
        await page.locator('img').evaluateAll((images) =>
          images
            .filter((image) => image.getClientRects().length > 0)
            .filter(
              (image) =>
                image instanceof HTMLImageElement &&
                image.complete &&
                image.naturalWidth === 0,
            )
            .map((image) => (image as HTMLImageElement).currentSrc),
        ),
      ).toEqual([])
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        ),
      ).toBeLessThanOrEqual(1)
      expect(
        await page
          .locator(
            '[data-scroll-reveal]:not([data-revealed]), [data-reveal]:not([data-revealed])',
          )
          .evaluateAll(
            (nodes) =>
              nodes.filter((node) => node.getClientRects().length > 0).length,
          ),
      ).toBe(0)
    }

    expect(errors).toEqual([])
  })
}

test('Movimiento reducido mantiene todo visible y elimina el desplazamiento animado', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  await expect(page.locator('.store-layout')).toHaveAttribute(
    'data-scroll-ready',
    '',
  )
  const states = await page
    .locator('[data-scroll-reveal], [data-reveal]')
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        revealed: node.hasAttribute('data-revealed'),
        opacity: getComputedStyle(node).opacity,
        transform: getComputedStyle(node).transform,
      })),
    )

  expect(states.length).toBeGreaterThan(0)
  expect(states.every((state) => state.revealed)).toBe(true)
  expect(states.every((state) => state.opacity === '1')).toBe(true)
  expect(states.every((state) => state.transform === 'none')).toBe(true)
})
