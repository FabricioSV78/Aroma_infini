import { expect, test } from '@playwright/test'

test('La segunda campaña espera a la imagen prioritaria y se revela solo cuando está preparada', async ({
  page,
}) => {
  let releaseFirst: () => void = () => {}
  let releaseSecond: () => void = () => {}
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  const secondGate = new Promise<void>((resolve) => {
    releaseSecond = resolve
  })
  let secondaryRequests = 0
  await page.route('**/hero-v2-lumiere-*.webp', async (route) => {
    await firstGate
    await route.continue()
  })
  await page.route('**/hero-v2-silence-*.webp', async (route) => {
    secondaryRequests++
    await secondGate
    await route.continue()
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Una fragancia.',
  )
  expect(secondaryRequests).toBe(0)
  await expect(page.locator('.hero-image img')).toHaveCount(1)
  await expect(page.locator('.hero-image img')).toHaveAttribute(
    'fetchpriority',
    'high',
  )
  releaseFirst()
  await expect.poll(() => secondaryRequests).toBe(1)
  const height = (await page.locator('.hero').boundingBox())!.height
  await page.getByRole('button', { name: 'Ver campaña 2' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Una fragancia.',
  )
  releaseSecond()
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Lo sutil también',
  )
  expect(
    await page
      .locator('.hero-slide.is-active img')
      .evaluate((element) => (element as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0)
  expect((await page.locator('.hero').boundingBox())!.height).toBe(height)
})

test('Una pulsación rápida de ida y vuelta no activa una fotografía tardía', async ({
  page,
}) => {
  let release: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/hero-v2-silence-*.webp', async (route) => {
    await gate
    await route.continue()
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Ver campaña 2' }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Ver campaña 1' }).focus()
  await page.keyboard.press('Enter')
  release()
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll<HTMLImageElement>('.hero-image img')]
        .length === 3 &&
      [...document.querySelectorAll<HTMLImageElement>('.hero-image img')].every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
  )
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Una fragancia.',
  )
  await page.getByRole('button', { name: 'Ver campaña 2' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Lo sutil también',
  )
})

for (const width of [390, 1440]) {
  test(`Hero ${width}px: composición, cambio de slide y header al desplazar`, async ({
    page,
  }) => {
    const height = width === 390 ? 844 : 900
    await page.setViewportSize({ width, height })
    await page.goto('/')
    await page.getByRole('heading', { level: 1 }).waitFor()
    await page.evaluate(() => document.fonts.ready)
    const header = page.locator('.site-header')
    await expect(header).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    const hero = page.getByRole('region', { name: 'Selección editorial' })
    const initialBox = await hero.boundingBox()
    expect(initialBox?.x).toBe(0)
    expect(initialBox?.width).toBe(width)
    expect(initialBox?.height).toBeGreaterThan(height * 0.85)
    expect(initialBox!.y + initialBox!.height).toBeLessThanOrEqual(height + 1)
    const next = page.getByRole('button', { name: 'Ver campaña 2' })
    await next.focus()
    await expect(next).toBeInViewport()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Lo sutil también',
    )
    await expect(page.locator('.hero-slide.is-active')).toHaveCSS(
      'opacity',
      '1',
    )
    await expect(next).toBeFocused()
    const secondBox = await hero.boundingBox()
    expect(secondBox?.height).toBe(initialBox?.height)
    await expect(
      page.locator('.hero-slide:not(.is-active)').first(),
    ).toHaveAttribute('inert', '')
    await expect(hero.getByRole('link')).toHaveCount(1)
    await page.keyboard.press('ArrowLeft')
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Una fragancia.',
    )
    const image = page.locator('.hero-slide.is-active img')
    expect(
      await image.evaluate(
        (element) => (element as HTMLImageElement).currentSrc,
      ),
    ).toContain(width === 390 ? '-mobile-' : '-desktop-')
    const headerHeight = (await header.boundingBox())?.height
    await page.evaluate(() =>
      window.scrollTo({ top: 100, behavior: 'instant' }),
    )
    await expect(header).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    expect((await header.boundingBox())?.height).toBe(headerHeight)
    expect((await header.boundingBox())?.y).toBe(0)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    await expect(header).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await page.goto('/#marcas')
    await expect(page.locator('#marcas')).toBeFocused()
    const brandsTop = (await page.locator('#marcas').boundingBox())!.y
    expect(brandsTop).toBeGreaterThanOrEqual(headerHeight!)
  })
}

test('La navegación móvil prioriza menú, marca, búsqueda y carrito sin solaparse', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/')
  const header = page.locator('.site-header')
  await expect(header.getByRole('link', { name: 'Favoritos' })).toBeHidden()
  await expect(header.getByRole('link', { name: 'Mi cuenta' })).toBeHidden()
  const controls = [
    header.getByRole('button', { name: 'Abrir menú' }),
    header.getByRole('link', { name: 'Aroma Infini, inicio' }),
    header.getByRole('button', { name: 'Buscar perfumes' }),
    header.getByRole('button', { name: 'Carrito' }),
  ]
  let previousRight = 0
  for (const control of controls) {
    const box = (await control.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.x).toBeGreaterThanOrEqual(previousRight)
    previousRight = box.x + box.width
  }
  await header.getByRole('button', { name: 'Buscar perfumes' }).click()
  await expect(
    page.getByRole('dialog', { name: '¿Qué aroma tienes en mente?' }),
  ).toBeVisible()
})

test('El fundido se reduce con la preferencia de movimiento reducido', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const slide = page.locator('.hero-slide').first()
  const reducedDuration = await slide.evaluate((element) =>
    parseFloat(getComputedStyle(element).transitionDuration),
  )
  expect(reducedDuration).toBeLessThan(0.01)
  await page.getByRole('button', { name: 'Ver campaña 2' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.hero-slide.is-active')).toHaveCSS('opacity', '1')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const regularDuration = await slide.evaluate((element) =>
    parseFloat(getComputedStyle(element).transitionDuration),
  )
  expect(regularDuration).toBeGreaterThanOrEqual(0.65)
  expect(regularDuration).toBeLessThanOrEqual(0.8)
})
