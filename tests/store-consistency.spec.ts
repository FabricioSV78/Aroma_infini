import { expect, test } from '@playwright/test'

const breadcrumbRoutes = [
  ['/catalogo', '.catalog-breadcrumb'],
  ['/marcas', '.catalog-breadcrumb'],
  ['/producto/petale-nu', '.product-breadcrumb'],
  ['/cuenta', '.account-breadcrumb'],
  ['/seguir-pedido', '.checkout-breadcrumb'],
  ['/nosotros', '.institutional-breadcrumb'],
  ['/contacto', '.institutional-breadcrumb'],
] as const

for (const width of [390, 768, 1440]) {
  test(`La entrada y las migas mantienen el mismo eje a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const positions: {
      route: string
      x: number
      y: number
      textCenterDelta: number
    }[] = []
    for (const [route, selector] of breadcrumbRoutes) {
      await page.goto(route)
      const breadcrumb = page.locator(selector)
      const box = await breadcrumb.boundingBox()
      expect(box, route).not.toBeNull()
      const textCenters = await breadcrumb.evaluate((element) =>
        [...element.children]
          .filter((child) => child.getAttribute('aria-hidden') !== 'true')
          .map((child) => {
            const range = document.createRange()
            range.selectNodeContents(child)
            const rect = range.getBoundingClientRect()
            return rect.top + rect.height / 2
          }),
      )
      positions.push({
        route,
        x: box!.x,
        y: box!.y,
        textCenterDelta: Math.max(...textCenters) - Math.min(...textCenters),
      })
    }
    const [reference] = positions
    for (const position of positions) {
      const context = `${position.route}: ${JSON.stringify(positions)}`
      expect(Math.abs(position.x - reference.x), context).toBeLessThan(2)
      expect(Math.abs(position.y - reference.y), context).toBeLessThan(2)
      expect(position.textCenterDelta, context).toBeLessThan(1)
    }
  })
}

test('La tienda y el panel usan una sola familia tipográfica', async ({
  page,
}) => {
  for (const route of ['/', '/catalogo', '/producto/petale-nu', '/admin']) {
    await page.goto(route)
    const families = await page.evaluate(() => {
      const visibleTextElements = [
        ...document.querySelectorAll<HTMLElement>('body *'),
      ]
        .filter((element) =>
          [...element.childNodes].some(
            (node) =>
              node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
          ),
        )
        .filter((element) => {
          const style = getComputedStyle(element)
          return style.display !== 'none' && style.visibility !== 'hidden'
        })
      return [
        ...new Set(
          visibleTextElements.map(
            (element) => getComputedStyle(element).fontFamily,
          ),
        ),
      ]
    })
    expect(families, route).toEqual(['"IBM Plex Sans", Arial, sans-serif'])
  }
})
