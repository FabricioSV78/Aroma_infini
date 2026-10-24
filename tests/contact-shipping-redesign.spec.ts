import { expect, test } from '@playwright/test'

const viewports = [
  { name: 'desktop-1920', width: 1920, height: 1080 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'laptop-1366', width: 1366, height: 768 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
] as const

const routes = [
  { slug: 'contact', path: '/contacto', title: 'Contacto' },
  { slug: 'shipping', path: '/envios', title: 'Envíos y entregas' },
] as const

for (const viewport of viewports) {
  test(`Contacto y envíos conservan su estructura en ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    for (const route of routes) {
      await page.goto(route.path)
      await page.evaluate(() => document.fonts.ready.then(() => true))
      await expect(page.locator('main h1')).toHaveText(route.title)
      await expect(
        page.locator('main nav[aria-label="Ruta de navegación"]'),
      ).toBeVisible()
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
      ).toBe(false)

      await page.screenshot({
        path: `artifacts/service-pages-final/after/${route.slug}-${viewport.name}.png`,
        fullPage: true,
        animations: 'disabled',
      })
    }

    expect(pageErrors).toEqual([])
  })
}

test('Las acciones de atención se recorren con teclado y las tarifas siguen legibles a 320 px', async ({
  page,
}) => {
  await page.goto('/contacto')
  const whatsapp = page.getByRole('link', { name: 'Escribir por WhatsApp' })
  await whatsapp.focus()
  await expect(whatsapp).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    page.locator('main').getByRole('link', { name: 'Seguir pedido' }),
  ).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(
    page.locator('main').getByRole('link', { name: 'Envíos y entregas' }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/envios$/)
  const table = page.getByRole('table', {
    name: /Modalidades, tarifas y plazo/,
  })
  await expect(table.getByRole('columnheader')).toHaveText([
    'Modalidad',
    'Tarifa',
    'Plazo estimado',
  ])
  await expect(table.getByRole('rowheader')).toHaveText([
    'Courier',
    'Motorizado',
  ])
  await page.setViewportSize({ width: 320, height: 780 })
  await expect(table).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
  ).toBe(false)
  const help = page.getByRole('navigation', { name: 'Seguimiento y ayuda' })
  await help.getByRole('link', { name: /Seguir pedido/ }).focus()
  await page.keyboard.press('Tab')
  await expect(
    help.getByRole('link', { name: /Consultar entrega/ }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/contacto$/)
})
