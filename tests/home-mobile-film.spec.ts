import { expect, test } from './test'
import { mkdir, readFile } from 'node:fs/promises'

test('El video editorial usa la versión móvil y conserva el póster del mismo archivo', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/admin/home')
  await page
    .getByRole('button', { name: 'Video editorial', exact: true })
    .click()
  await page
    .getByLabel('Subir video editorial', { exact: true })
    .setInputFiles({
      name: 'principal.mp4',
      mimeType: 'video/mp4',
      buffer: await readFile('public/videos/perfume-editorial-wide.mp4'),
    })
  await expect(page.getByText('Preparando archivo…')).not.toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Usar video original', exact: true }),
  ).toBeVisible()
  await page.getByLabel('Subir video editorial para celular').setInputFiles({
    name: 'celular.mp4',
    mimeType: 'video/mp4',
    buffer: await readFile('public/videos/perfume-editorial-mobile.mp4'),
  })
  await expect(page.getByText('Preparando archivo…')).not.toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Usar el video principal', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Guardar cambios del Home' }).click()
  await expect(page.getByText('Todo guardado', { exact: true })).toBeVisible()
  const state = await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    return adminService.getSnapshot().homeContent.film
  })
  expect(state.video).toMatch(/^data:video\/mp4;base64,/)
  expect(state.mobileVideo).toMatch(/^data:video\/mp4;base64,/)
  expect(state.mobileVideo).not.toBe(state.video)
  expect(state.mobilePoster).toMatch(/^data:image\/webp;base64,/)
  await page.goto('/')
  const film = page.locator('.editorial-film')
  await film.scrollIntoViewIfNeeded()
  const video = film.locator('video')
  await expect(video).toHaveAttribute('poster', state.mobilePoster!)
  await expect(video).not.toHaveAttribute('src')
  await page.getByRole('button', { name: 'Reproducir video editorial' }).click()
  await expect(video).toHaveAttribute('src', state.mobileVideo!)
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(film.locator('video')).toHaveAttribute('poster', state.poster!)
})

test('La gestión del video mantiene la versión móvil opcional junto al archivo principal', async ({
  page,
}) => {
  await page.goto('/admin/home')
  await page
    .getByRole('button', { name: 'Video editorial', exact: true })
    .click()
  await expect(page.getByText('Versión para celular (opcional)')).toBeVisible()
  await expect(
    page.getByLabel('Subir video editorial', { exact: true }),
  ).toHaveAttribute('accept', 'video/mp4')
  await expect(
    page.getByLabel('Subir video editorial para celular'),
  ).toHaveAttribute('accept', 'video/mp4')
  await page.getByRole('button', { name: 'Abrir vista previa' }).click()
  const format = page.getByRole('group', {
    name: 'Formato de vista previa del video',
  })
  await format.getByRole('button', { name: 'Móvil' }).click()
  await expect(format.getByRole('button', { name: 'Móvil' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(
    page.getByLabel('Vista previa del video editorial'),
  ).toHaveAttribute('src', '/videos/perfume-editorial-mobile.mp4')
  await expect
    .poll(() =>
      page
        .getByLabel('Vista previa del video editorial')
        .evaluate((video: HTMLVideoElement) => video.readyState),
    )
    .toBeGreaterThanOrEqual(2)
  await page
    .getByLabel('Vista previa del video editorial')
    .evaluate((video: HTMLVideoElement) => video.play())
  await expect
    .poll(() =>
      page
        .getByLabel('Vista previa del video editorial')
        .evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeGreaterThan(0.1)
  await page
    .getByLabel('Vista previa del video editorial')
    .evaluate((video: HTMLVideoElement) => video.pause())
  await mkdir('artifacts/performance-2026-10-29/home-ui-captures', {
    recursive: true,
  })
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `artifacts/performance-2026-10-29/home-ui-captures/film-preview-${viewport.width}.png`,
    })
  }
})
