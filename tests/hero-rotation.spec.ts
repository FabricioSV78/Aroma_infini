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
      images.length === 5 &&
      images.every((image) => image.complete && image.naturalWidth > 0)
    )
  })
}

async function expectCurrentIndicator(page: Page, index: number) {
  const indicators = page.locator('.hero-position-tracks > button')
  await expect(indicators).toHaveCount(5)
  await expect(page.locator('.hero-position-tracks > .is-current')).toHaveCount(
    1,
  )
  await expect(indicators.nth(index)).toHaveClass(/is-current/)
}

test('Cinco campañas cambian cada tres segundos sin alterar la altura', async ({
  page,
}) => {
  await prepare(page)
  const hero = page.locator('.hero')
  const height = (await hero.boundingBox())!.height
  await expect(hero.locator('[role="status"]')).toHaveAttribute(
    'aria-live',
    'off',
  )
  await expectCurrentIndicator(page, 0)
  const titles = [
    'Lo sutil también',
    'Tu esencia.',
    'Aromas que',
    'La frescura',
    'Una fragancia.',
  ]
  for (const [index, title] of titles.entries()) {
    await page.clock.runFor(3100)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(title)
    await expectCurrentIndicator(page, (index + 1) % 5)
    expect((await hero.boundingBox())!.height).toBe(height)
  }
})

test('Flechas permiten ir, volver y recorrer el límite del carrusel', async ({
  page,
}) => {
  await prepare(page)
  const previous = page.getByRole('button', { name: 'Diapositiva anterior' })
  const next = page.getByRole('button', { name: 'Diapositiva siguiente' })
  for (const control of [previous, next]) {
    await expect(control).toBeVisible()
    const box = (await control.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
  const heroBox = (await page.locator('.hero').boundingBox())!
  const previousBox = (await previous.boundingBox())!
  const nextBox = (await next.boundingBox())!
  expect(previousBox.x + previousBox.width).toBeLessThan(
    heroBox.x + heroBox.width / 4,
  )
  expect(nextBox.x).toBeGreaterThan(heroBox.x + (heroBox.width * 3) / 4)
  await previous.click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'La frescura',
  )
  await expectCurrentIndicator(page, 4)
  await next.click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Una fragancia.',
  )
  await next.click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Lo sutil también',
  )
  await page.clock.runFor(9000)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Lo sutil también',
  )
})

test('Las flechas pausan el carrusel mientras el usuario las explora', async ({
  page,
}) => {
  await prepare(page)
  const next = page.getByRole('button', { name: 'Diapositiva siguiente' })
  await next.hover()
  await page.clock.runFor(6100)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Una fragancia.',
  )
  await page.mouse.move(0, 0)
  await expect(page.locator('.hero [role="status"]')).toHaveAttribute(
    'aria-live',
    'off',
  )
  await page.clock.runFor(3100)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Lo sutil también',
  )
})

test('El gesto horizontal cambia de slide y el vertical no lo hace', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const hero = page.locator('.hero')
  await hero.dispatchEvent('pointerdown', {
    pointerType: 'touch',
    pointerId: 1,
    clientX: 320,
    clientY: 280,
  })
  await hero.dispatchEvent('pointerup', {
    pointerType: 'touch',
    pointerId: 1,
    clientX: 110,
    clientY: 292,
  })
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Lo sutil también',
  )
  await hero.dispatchEvent('pointerdown', {
    pointerType: 'touch',
    pointerId: 2,
    clientX: 310,
    clientY: 300,
  })
  await hero.dispatchEvent('pointerup', {
    pointerType: 'touch',
    pointerId: 2,
    clientX: 260,
    clientY: 620,
  })
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Lo sutil también',
  )
})

test('El foco pausa el carrusel y el teclado permite navegar sin control de pausa visible', async ({
  page,
}) => {
  await prepare(page)
  const controls = page.locator('.hero-accessibility')
  await controls.getByRole('button', { name: 'Ver campaña 1' }).focus()
  await expect(controls).toHaveCSS('clip-path', 'none')
  await page.clock.runFor(9000)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Una fragancia.',
  )
  await expect(controls).toBeVisible()
  await expect(controls.getByRole('button')).toHaveCount(5)
  await page.getByRole('button', { name: 'Ver campaña 5' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'La frescura',
  )
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Una fragancia.',
  )
})

test('Movimiento reducido desactiva autoplay y permite visitar las cinco campañas', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await prepare(page)
  await page.clock.runFor(22000)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Una fragancia.',
  )
  await expect(page.locator('.hero-position-tracks > button')).toHaveCount(5)
  await page.getByRole('button', { name: 'Ver campaña 5' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'La frescura',
  )
})

test('Una fotografía fallida se omite sin interrumpir las campañas disponibles', async ({
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
  await page.clock.runFor(3100)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Lo sutil también',
  )
  await page.waitForFunction(() => {
    const image = document.querySelector<HTMLImageElement>(
      '.hero-image img[src*="hero-v4-amber"]',
    )
    return image?.complete && image.naturalWidth > 0
  })
  await page.clock.runFor(3100)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Aromas que',
  )
  await expect(page.locator('.hero-slide.is-active img')).toBeVisible()
})
