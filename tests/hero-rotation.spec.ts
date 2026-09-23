import { expect, test, type Page } from '@playwright/test'

async function prepare(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.clock.install()
  await page.goto('/')
  await page.waitForFunction(() => {
    const images = [
      ...document.querySelectorAll<HTMLImageElement>('.hero-image img'),
    ]
    return (
      images.length === 3 &&
      images.every((image) => image.complete && image.naturalWidth > 0)
    )
  })
}

test('Tres campañas: imagen, texto y enlace cambian cada tres segundos sin variar la altura', async ({
  page,
}) => {
  await prepare(page)
  const hero = page.locator('.hero')
  const height = (await hero.boundingBox())!.height
  await expect(hero.locator('[role="status"]')).toHaveAttribute(
    'aria-live',
    'off',
  )
  await hero.hover({ position: { x: 900, y: 200 } })
  await expect(page.locator('.hero-position')).toContainText('01 / 03')
  await expect(page.locator('.hero-accessibility')).toHaveCSS(
    'clip-path',
    'inset(50%)',
  )
  await expect(
    page.getByRole('button', { name: 'Diapositiva siguiente' }),
  ).toHaveCount(0)
  await page.clock.runFor(3100)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Lo sutil también',
  )
  await expect(hero.getByRole('link')).toHaveAttribute('href', '/#destacados')
  await expect(page.locator('.hero-position')).toContainText('02 / 03')
  await expect(hero.locator('.is-active img')).toHaveAttribute('src', /silence/)
  await page.clock.runFor(800)
  await expect(hero.locator('.is-active')).toHaveCSS('opacity', '1')
  expect((await hero.boundingBox())!.height).toBe(height)
  await page.clock.runFor(2200)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Tu esencia.',
  )
  await expect(hero.getByRole('link')).toHaveAttribute(
    'href',
    '/catalogo?marca=forme',
  )
  await expect(hero.locator('.is-active img')).toHaveAttribute('src', /petale/)
  expect((await hero.boundingBox())!.height).toBe(height)
  await page.clock.runFor(3000)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Una fragancia.',
  )
  await expect(hero.getByRole('link')).toHaveAttribute('href', '/catalogo')
})

test('Los controles se descubren por teclado y permiten detener o reanudar las campañas', async ({
  page,
}) => {
  await prepare(page)
  const controls = page.locator('.hero-accessibility')
  await controls.locator('button').first().focus()
  await expect(controls).toHaveCSS('clip-path', 'none')
  await page.locator('.site-header a').first().focus()
  await expect(controls).toHaveCSS('clip-path', 'inset(50%)')
  await page.clock.runFor(15000)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Una fragancia.',
  )
  await page.getByRole('button', { name: 'Reanudar cambio automático' }).focus()
  await page.keyboard.press('Enter')
  await page.clock.runFor(3100)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Lo sutil también',
  )
  await page.keyboard.press('Enter')
  await page.clock.runFor(15000)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Lo sutil también',
  )
  await page.getByRole('button', { name: 'Ver campaña 3' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Tu esencia.',
  )
})

test('Hover y salida del viewport suspenden la rotación', async ({ page }) => {
  await prepare(page)
  const status = page.locator('.hero [role="status"]')
  await page.locator('.hero-slide.is-active .hero-cta').hover()
  await expect(status).toHaveAttribute('aria-live', 'polite')
  await page.clock.runFor(15000)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Una fragancia.',
  )
  await page.mouse.move(0, 0)
  await expect(status).toHaveAttribute('aria-live', 'off')
  await page.evaluate(() => window.scrollTo({ top: 2200, behavior: 'instant' }))
  await expect(status).toHaveAttribute('aria-live', 'polite')
  await page.clock.runFor(15000)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Una fragancia.',
  )
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await expect(status).toHaveAttribute('aria-live', 'off')
  await page.clock.runFor(3100)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Lo sutil también',
  )
})

test('Movimiento reducido desactiva autoplay y permite visitar las tres campañas por teclado', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await prepare(page)
  await page.clock.runFor(22000)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Una fragancia.',
  )
  await expect(
    page.getByRole('button', {
      name: 'Cambio automático desactivado por movimiento reducido',
    }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Ver campaña 3' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Tu esencia.',
  )
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Lo sutil también',
  )
})

test('Una tercera fotografía fallida no interrumpe las campañas disponibles', async ({
  page,
}) => {
  await page.clock.install()
  await page.route('**/hero-v3-petale-*.webp', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/webp',
      body: 'invalid image',
    }),
  )
  await page.goto('/')
  await expect(page.locator('.hero-image img')).toHaveCount(2)
  await expect(page.locator('.hero [role="status"]')).toHaveAttribute(
    'aria-live',
    'off',
  )
  await page.clock.runFor(3100)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Lo sutil también',
  )
  await page.clock.runFor(3000)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Una fragancia.',
  )
  await expect(page.locator('.hero-slide.is-active img')).toBeVisible()
})
