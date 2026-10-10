import { expect, test } from '@playwright/test'

test('Los indicadores visibles permiten elegir una campaña en móvil', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const indicator = page.getByRole('button', { name: 'Ver campaña 4' })
  await indicator.click()
  await expect(indicator).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Aromas que',
  )
  await expect(page.locator('.hero-position-tracks > button')).toHaveCount(5)
})

test('El video conserva la pausa elegida al salir y volver a la sección', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('/')
  const section = page.locator('.editorial-film')
  const video = section.locator('video')
  await section.scrollIntoViewIfNeeded()
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => !el.paused))
    .toBe(true)
  await page.getByRole('button', { name: 'Pausar video editorial' }).click()
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.paused))
    .toBe(true)
  await page.locator('.hero').scrollIntoViewIfNeeded()
  await section.scrollIntoViewIfNeeded()
  await expect(
    page.getByRole('button', { name: 'Reproducir video editorial' }),
  ).toBeVisible()
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.paused))
    .toBe(true)
  await page.getByRole('button', { name: 'Reproducir video editorial' }).click()
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => !el.paused))
    .toBe(true)
})

test('Movimiento reducido mantiene el póster y permite reproducción voluntaria', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const video = page.locator('.editorial-film video')
  await video.scrollIntoViewIfNeeded()
  await expect(video).not.toHaveAttribute('src')
  await page.getByRole('button', { name: 'Reproducir video editorial' }).click()
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => !el.paused))
    .toBe(true)
  await page.getByRole('button', { name: 'Pausar video editorial' }).click()
  await expect
    .poll(() => video.evaluate((el: HTMLVideoElement) => el.paused))
    .toBe(true)
})
