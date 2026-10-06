import { expect, test, type Page } from '@playwright/test'

async function geometry(page: Page, anchor: string) {
  return page.locator(anchor).evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return { x: bounds.x, width: bounds.width, scroll: window.scrollY }
  })
}

for (const width of [390, 768, 1440]) {
  test(`Las ventanas conservan el ancho y el scroll del fondo a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const cases = [
      {
        route: '/tienda',
        trigger: 'Buscar perfumes',
        dialog: '#search',
        anchor: '.catalog-page',
        scroll: 260,
      },
      {
        route: '/tienda',
        trigger: 'Carrito',
        dialog: '#cart-drawer',
        anchor: '.catalog-page',
        scroll: 260,
      },
      {
        route: '/tienda',
        trigger: 'Abrir ayuda y contacto',
        dialog: '#help',
        anchor: '.catalog-page',
        scroll: 260,
      },
      {
        route: '/producto/petale-nu',
        trigger: 'Escribir una reseña',
        dialog: '#review-dialog',
        anchor: '.product-reviews-inner',
        scroll: 0,
      },
      ...(width < 1024
        ? [
            {
              route: '/tienda',
              trigger: 'Abrir menú',
              dialog: '#mobile-navigation',
              anchor: '.catalog-page',
              scroll: 260,
            },
            {
              route: '/tienda',
              trigger: 'Filtros',
              dialog: '#catalog-filters',
              anchor: '.catalog-page',
              scroll: 0,
            },
            {
              route: '/admin',
              trigger: 'Abrir menú administrativo',
              dialog: '.admin-sidebar',
              anchor: '#admin-content',
              scroll: 0,
            },
          ]
        : []),
    ]
    for (const item of cases) {
      await page.goto(item.route)
      if (item.trigger === 'Escribir una reseña')
        await page.getByRole('tab', { name: 'Reseñas' }).click()
      await expect(page.locator(item.anchor)).toBeVisible()
      const trigger = page.getByRole('button', {
        name: item.trigger,
        exact: true,
      })
      await expect(trigger).toBeVisible()
      await trigger.scrollIntoViewIfNeeded()
      if (item.scroll)
        await page.evaluate(
          (top) => window.scrollTo({ top, behavior: 'instant' }),
          item.scroll,
        )
      await trigger.focus({ timeout: 5000 })
      const before = await geometry(page, item.anchor)
      await page.keyboard.press('Enter')
      await expect(page.locator(item.dialog)).toBeVisible()
      expect(
        await geometry(page, item.anchor),
        `${item.trigger}: abrir`,
      ).toEqual(before)
      await page.keyboard.press('Escape')
      if (item.dialog !== '.admin-sidebar')
        await expect(page.locator(item.dialog)).not.toBeVisible()
      expect(
        await geometry(page, item.anchor),
        `${item.trigger}: cerrar`,
      ).toEqual(before)
      await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden')
    }
  })
}
