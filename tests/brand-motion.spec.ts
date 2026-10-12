import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await page.addStyleTag({
    content: 'html { scroll-behavior: auto !important; }',
  })
  await page.evaluate(() => document.fonts.ready)
})

test('Avance suave, pausa al hover y pausa persistente accesible desde el teclado', async ({
  page,
}) => {
  const gallery = page.locator('#marcas')
  const rail = gallery.locator('.brand-signatures-viewport')
  await gallery.scrollIntoViewIfNeeded()
  await page.mouse.move(0, 0)
  const position = () => rail.evaluate((element) => element.scrollLeft)
  const before = await position()
  await expect.poll(position).toBeGreaterThan(before + 2)
  await rail.hover()
  const hovered = await position()
  await page.waitForTimeout(300)
  expect(Math.abs((await position()) - hovered)).toBeLessThan(1)
  const toggle = gallery.getByRole('button', { name: 'Pausar movimiento' })
  expect(await toggle.evaluate((el) => getComputedStyle(el).clipPath)).toBe(
    'inset(50%)',
  )
  await toggle.focus()
  await page.keyboard.press('Space')
  await page.mouse.move(0, 0)
  await page.keyboard.press('Tab')
  const paused = await position()
  await page.waitForTimeout(400)
  expect(Math.abs((await position()) - paused)).toBeLessThan(1)
  await expect(
    gallery.getByRole('button', { name: 'Reanudar movimiento' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await gallery.getByRole('button', { name: 'Reanudar movimiento' }).focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('Shift+Tab')
  await expect.poll(position).toBeGreaterThan(paused + 2)
})

test('El arrastre mueve las marcas sin abrir enlaces y el avance retoma su posición', async ({
  page,
}) => {
  const rail = page.locator('.brand-signatures-viewport')
  await rail.scrollIntoViewIfNeeded()
  const box = (await rail.boundingBox())!
  const x = box.x + box.width * 0.65,
    y = box.y + box.height / 2
  await page.mouse.move(x, y)
  const before = await rail.evaluate((el) => el.scrollLeft)
  await page.mouse.down()
  await page.mouse.move(x - 180, y, { steps: 12 })
  await page.mouse.up()
  await expect(page).toHaveURL('/')
  const dragged = await rail.evaluate((el) => el.scrollLeft)
  expect(dragged - before).toBeGreaterThan(175)
  expect(dragged - before).toBeLessThan(185)
  await page.waitForTimeout(300)
  expect(
    Math.abs((await rail.evaluate((el) => el.scrollLeft)) - dragged),
  ).toBeLessThan(1)
  await page.mouse.move(0, 0)
  await expect
    .poll(() => rail.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(dragged + 2)
  expect((await rail.evaluate((el) => el.scrollLeft)) - dragged).toBeLessThan(
    45,
  )
})

test('El ciclo continúa sin espacios y una marca repetida sigue siendo un enlace', async ({
  page,
}) => {
  const gallery = page.locator('#marcas')
  const rail = gallery.locator('.brand-signatures-viewport')
  await gallery.scrollIntoViewIfNeeded()
  await rail.hover()
  const width = await gallery
    .locator('.brand-signatures-group')
    .first()
    .evaluate((el) => el.getBoundingClientRect().width)
  await rail.evaluate((el, end) => {
    el.scrollLeft = end - 8
  }, width)
  await page.waitForTimeout(100)
  await page.mouse.move(0, 0)
  await expect.poll(() => rail.evaluate((el) => el.scrollLeft)).toBeLessThan(45)
  await rail.hover()
  await rail.evaluate((el, end) => {
    el.scrollLeft = end - 8
  }, width)
  const repeated = gallery
    .locator('.brand-signatures-group[aria-hidden="true"] .brand-signature')
    .first()
  await repeated.click()
  await expect(page).toHaveURL('/marcas/atelier-01')
})

test('El teclado alcanza cada marca en móvil sin repetir los enlaces del ciclo', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const gallery = page.locator('#marcas')
  await gallery.scrollIntoViewIfNeeded()
  await expect(
    gallery.getByRole('link', { name: /^Ver perfumes de/ }),
  ).toHaveCount(4)
  const brands = gallery.locator(
    '.brand-signatures-group:not([aria-hidden]) .brand-signature',
  )
  await brands.first().focus()
  for (let index = 0; index < 4; index++) {
    await expect(brands.nth(index)).toBeFocused()
    const bounds = await brands.nth(index).boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
    if (index < 3) await page.keyboard.press('Tab')
  }
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/marcas/matiere-04')
})

test('Movimiento reducido deja todas las marcas estáticas y accesibles', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const gallery = page.locator('#marcas')
  await expect(gallery.getByRole('button', { name: /movimiento/ })).toHaveCount(
    0,
  )
  const brands = gallery.getByRole('link', { name: /^Ver perfumes de/ })
  await expect(brands).toHaveCount(4)
  for (const brand of await brands.all()) {
    await brand.scrollIntoViewIfNeeded()
    await expect(brand).toBeVisible()
  }
  expect(
    await gallery
      .locator('.brand-signatures-track')
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none')
})

test('El deslizamiento táctil permite explorar sin impedir el scroll vertical ni los enlaces', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'no-preference',
  })
  const page = await context.newPage()
  await page.goto('/')
  await page.addStyleTag({
    content: 'html { scroll-behavior: auto !important; }',
  })
  await page.evaluate(() => document.fonts.ready)
  const rail = page.locator('.brand-signatures-viewport')
  await rail.scrollIntoViewIfNeeded()
  const box = (await rail.boundingBox())!
  const x = box.x + box.width * 0.8,
    y = box.y + box.height / 2
  const client = await context.newCDPSession(page)
  const before = await rail.evaluate((el) => el.scrollLeft)
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }],
  })
  for (let step = 1; step <= 10; step++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: x - step * 16, y }],
    })
  }
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
  await expect(page).toHaveURL('/')
  expect((await rail.evaluate((el) => el.scrollLeft)) - before).toBeGreaterThan(
    145,
  )
  const scrollY = await page.evaluate(() => window.scrollY)
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y }],
  })
  for (let step = 1; step <= 8; step++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y - step * 12 }],
    })
  }
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(scrollY + 30)
  const link = rail.locator('.brand-signature').nth(1)
  await link.tap()
  await expect(page).toHaveURL('/marcas/forme')
  await context.close()
})
