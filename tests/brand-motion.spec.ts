import { expect, test } from '@playwright/test'

test('Las marcas avanzan, se detienen al interactuar y conservan la pausa elegida', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  // Keep Playwright's implicit scrolling from moving the rail out of the pointer.
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' })
  await page.evaluate(() => document.fonts.ready)
  const gallery = page.locator('#marcas')
  const rail = gallery.locator('.brand-signatures-track')
  await gallery.scrollIntoViewIfNeeded()
  await page.mouse.move(0, 0)
  const position = () =>
    rail.evaluate(
      (element) =>
        new DOMMatrixReadOnly(getComputedStyle(element).transform).m41,
    )
  const before = await position()
  await expect.poll(position).toBeLessThan(before - 2)

  await gallery.locator('.brand-signatures-viewport').hover()
  await expect
    .poll(() =>
      rail.evaluate((element) => getComputedStyle(element).animationPlayState),
    )
    .toBe('paused')
  // Let the compositor finish the frame in which the hover pause took effect.
  await rail.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
  const hovered = await position()
  await page.waitForTimeout(250)
  expect(Math.abs((await position()) - hovered)).toBeLessThan(0.5)

  await gallery.getByRole('button', { name: 'Pausar movimiento' }).click()
  await page.mouse.move(0, 0)
  const paused = await position()
  await page.waitForTimeout(250)
  expect(Math.abs((await position()) - paused)).toBeLessThan(0.5)
  await expect(
    gallery.getByRole('button', { name: 'Reanudar movimiento' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await gallery.getByRole('button', { name: 'Reanudar movimiento' }).click()
  await expect.poll(position).toBeLessThan(paused - 2)
})

test('Una marca repetida al final del ciclo se abre al hacer clic', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' })
  await page.evaluate(() => document.fonts.ready)
  const gallery = page.locator('#marcas')
  await gallery.scrollIntoViewIfNeeded()
  await gallery.locator('.brand-signatures-viewport').hover()
  await gallery.locator('.brand-signatures-track').evaluate((element) => {
    const animation = element.getAnimations()[0]
    const duration = Number(animation.effect?.getTiming().duration)
    animation.currentTime = duration - 100
  })
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
