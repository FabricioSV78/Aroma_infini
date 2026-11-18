import { expect, test } from './test'
import { mkdir, readFile } from 'node:fs/promises'

test('el panel guarda una imagen móvil independiente y la ficha editorial no monta video en móvil', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.setViewportSize({ width: 1440, height: 900 })
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
  await expect(
    page.getByRole('button', { name: 'Usar video original', exact: true }),
  ).toBeVisible({ timeout: 60_000 })
  await expect(
    page.getByText('Preparando archivo…', { exact: true }),
  ).not.toBeVisible({ timeout: 60_000 })
  await page
    .getByLabel('Subir imagen editorial para móvil')
    .setInputFiles('public/images/hero-v2-lumiere-mobile-780.webp')
  await expect(
    page.getByRole('button', { name: 'Usar portada del video', exact: true }),
  ).toBeVisible({ timeout: 30_000 })
  await expect(
    page.getByText('Preparando archivo…', { exact: true }),
  ).not.toBeVisible()
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
  expect(state.mobilePoster).toMatch(/^data:image\/webp;base64,/)
  expect(state.mobilePoster).not.toBe(state.poster)
  await page.setViewportSize({ width: 390, height: 844 })
  const requests: string[] = []
  page.on('request', (r) => {
    if (r.resourceType() === 'media') requests.push(r.url())
  })
  await page.goto('/')
  const film = page.locator('.editorial-film')
  await film.scrollIntoViewIfNeeded()
  await expect(film.locator('img')).toHaveAttribute('src', state.mobilePoster!)
  await expect(page.locator('video')).toHaveCount(0)
  expect(requests).toEqual([])
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(film.locator('video')).toHaveAttribute('poster', state.poster!)
})

test('la vista previa móvil del editor usa una imagen; escritorio conserva su reproductor', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/admin/home')
  await page
    .getByRole('button', { name: 'Video editorial', exact: true })
    .click()
  await expect(
    page.getByText('Imagen alternativa para móvil', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByLabel('Subir video editorial', { exact: true }),
  ).toHaveAttribute('accept', 'video/mp4')
  await expect(
    page.getByLabel('Subir imagen editorial para móvil'),
  ).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp,image/avif')
  await expect(
    page.getByLabel('Subir video editorial para celular'),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Abrir vista previa' }).click()
  const format = page.getByRole('group', {
    name: 'Formato de vista previa del video',
  })
  await expect(
    page.getByLabel('Vista previa del video editorial'),
  ).toHaveAttribute('src', '/videos/perfume-editorial-wide.mp4')
  await format.getByRole('button', { name: 'Móvil' }).click()
  await expect(page.locator('video')).toHaveCount(0)
  await expect(
    page.getByRole('img', { name: 'Vista previa de imagen editorial' }),
  ).toHaveAttribute('src', '/videos/perfume-editorial-mobile.webp')
  await mkdir('artifacts/mobile-video-policy-2026-11-12/screens', {
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
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `artifacts/mobile-video-policy-2026-11-12/screens/admin-film-${viewport.width}.png`,
    })
  }
})
