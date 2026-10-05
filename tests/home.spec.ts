import { expect, test } from '@playwright/test'

test('La portada presenta la selección sin avisos de popularidad no verificada', async ({
  page,
}) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Más vendidos' }),
  ).toBeVisible()
  await expect(page.locator('.commercial-preview-notice')).toHaveCount(0)
})

const widths = [360, 375, 390, 430, 768, 1024, 1280, 1440]
for (const width of widths) {
  test(`Home sin overflow ni imágenes rotas a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (['error', 'warning'].includes(message.type()))
        errors.push(message.text())
    })
    await page.addInitScript(() => {
      ;(window as unknown as { layoutShift: number }).layoutShift = 0
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & {
            value: number
            hadRecentInput: boolean
          }
          if (!shift.hadRecentInput)
            (window as unknown as { layoutShift: number }).layoutShift +=
              shift.value
        }
      }).observe({ type: 'layout-shift', buffered: true })
    })
    await page.goto('/')
    await page.getByRole('heading', { level: 1 }).waitFor()
    await page.evaluate(() => document.fonts.ready)
    for (const section of await page.locator('[data-home-section]').all()) {
      await section.scrollIntoViewIfNeeded()
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true)
    }
    await page.waitForFunction(() =>
      [...document.images].every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    )
    expect(
      await page.locator('img:not([width]), img:not([height])').count(),
    ).toBe(0)
    expect(errors).toEqual([])
    const cls = await page.evaluate(
      () => (window as unknown as { layoutShift: number }).layoutShift,
    )
    expect(cls).toBeLessThan(0.1)
    console.log(`${width}px: CLS observado=${cls}`)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await page.screenshot({
      path: `artifacts/home-${width}.png`,
      fullPage: true,
    })
  })
}

test('Menú móvil: teclado, foco contenido y retorno con Escape', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByText('Saltar al contenido')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toBeFocused()
  const trigger = page.getByRole('button', { name: 'Abrir menú' })
  await trigger.focus()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Explorar', exact: true })
  await expect(dialog).toBeVisible()
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab')
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await dialog.getByRole('link', { name: 'Para ella' }).click()
  await expect(page).toHaveURL(/tienda\?genero=mujer/)
  await expect(page.locator('main')).toBeFocused()
})

test('Buscador, enlaces informativos y navegación del hero', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Buscar perfumes' }).click()
  await page.getByLabel('Perfume o marca').fill('Bois Clair & Forme')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'No encontramos coincidencias.' }),
  ).toBeVisible()
  await expect(page.locator('main')).toBeFocused()
  await page
    .locator('main')
    .getByRole('link', { name: 'Inicio', exact: true })
    .click()
  await page.getByRole('button', { name: 'Ver campaña 2' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Lo sutil también',
  )
  await page.getByRole('button', { name: 'Ver campaña 1' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Una fragancia.',
  )
  await page.getByRole('button', { name: 'Carrito', exact: true }).click()
  const cartDialog = page.getByRole('dialog', { name: 'Tu carrito' })
  await expect(cartDialog).toBeVisible()
  await cartDialog.getByRole('link', { name: /Ver carrito/ }).click()
  await expect(page.getByRole('heading', { name: 'Tu carrito' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tu carrito' })).toBeVisible()
})

test('Movimiento reducido y ayuda accesible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  expect(
    await page.evaluate(
      () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
  ).toBe(true)
  expect(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    ),
  ).toBe('auto')
  const duration = await page
    .locator('.category img')
    .first()
    .evaluate((element) => getComputedStyle(element).transitionDuration)
  expect(parseFloat(duration)).toBeLessThan(0.01)
  const trigger = page.getByRole('button', {
    name: /Abrir ayuda y contacto/,
  })
  await trigger.click()
  const dialog = page.getByRole('dialog', {
    name: '¿En qué podemos ayudarte?',
  })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('a[href^="tel:"]')).toHaveCount(0)
  await expect(dialog.getByLabel('Tu consulta')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
})

test('La ayuda móvil permanece flotante y dentro de la pantalla', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tienda')

  const help = page.locator('.help-button')
  await expect(help).toBeVisible()
  await expect(help).toHaveAccessibleName(/Abrir ayuda y contacto/)
  expect(
    await help.evaluate((element) => getComputedStyle(element).position),
  ).toBe('fixed')
  const box = await help.boundingBox()
  expect(box).not.toBeNull()
  if (!box) return
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  expect(box.y + box.height).toBeLessThanOrEqual(844)
})
