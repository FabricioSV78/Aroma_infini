import { mkdir, readFile } from 'node:fs/promises'
import type { HomeHeroDestination } from '../src/types/home'
import { expect, test, type Page } from './test'

const captures = 'artifacts/hero-campaigns-2026-11-04/playback-screenshots'
const firstVideo = `/media/public/dynamic/aa000000-0000-4000-8000-000000000601/${'a'.repeat(64)}/video.mp4`
const secondVideo = `/media/public/dynamic/aa000000-0000-4000-8000-000000000602/${'b'.repeat(64)}/video.mp4`
const mobileVideo = `/media/public/dynamic/aa000000-0000-4000-8000-000000000603/${'c'.repeat(64)}/video.mp4`
const posterBytes = await readFile(
  'public/images/hero-v2-lumiere-desktop-960.webp',
)
const poster = `data:image/webp;base64,${posterBytes.toString('base64')}`
const videoBytes = await readFile('public/videos/perfume-editorial-wide.mp4')

async function campaignFixture(
  page: Page,
  options: {
    first?: 'image' | 'video'
    showButton?: boolean
    showText?: boolean
    published?: boolean
    destination?: HomeHeroDestination
    alternateMobile?: boolean
  } = {},
) {
  const requested: string[] = []
  await page.route('**/media/public/dynamic/**/video.mp4', (route) => {
    requested.push(new URL(route.request().url()).pathname)
    return route.fulfill({
      status: 200,
      contentType: 'video/mp4',
      body: videoBytes,
      headers: { 'access-control-allow-origin': '*', 'accept-ranges': 'bytes' },
    })
  })
  await page.goto('/')
  await page.evaluate(
    async ({ options, firstVideo, secondVideo, mobileVideo, poster }) => {
      const editorPath = '/src/content/home-editor.ts'
      const servicePath = '/src/services/admin-service.ts'
      const { createDefaultHomeContent } = (await import(
        editorPath
      )) as typeof import('../src/content/home-editor')
      const { adminService } = (await import(
        servicePath
      )) as typeof import('../src/services/admin-service')
      const content = createDefaultHomeContent()
      content.hero = content.hero
        .slice(0, 3)
        .map((slide, index) => ({ ...slide, order: index }))
      const first = content.hero[0]
      first.mediaType = options.first ?? 'video'
      first.title = 'Campaña de prueba'
      first.video = firstVideo
      first.poster = poster
      first.mobileVideo = options.alternateMobile ? mobileVideo : null
      first.mobilePoster = options.alternateMobile ? poster : null
      first.showButton = options.showButton ?? true
      first.showText = options.showText ?? true
      first.published = options.published ?? true
      first.destination = options.destination ?? { type: 'shop' }
      const second = content.hero[1]
      second.mediaType = 'video'
      second.video = secondVideo
      second.poster = poster
      second.title = 'Segunda película'
      const result = adminService.saveHome(
        adminService.getSnapshot().homeMedia,
        content,
      )
      if (result.kind !== 'saved') throw new Error(JSON.stringify(result))
      await adminService.flush()
    },
    { options, firstVideo, secondVideo, mobileVideo, poster },
  )
  await page.reload()
  await expect(page.locator('.hero-position-tracks button')).toHaveCount(
    options.published === false ? 2 : 3,
  )
  await expect(page.locator('.hero-image img').first()).toBeVisible()
  return requested
}

test('Solo el video activo recibe un src; silenciado, inline y con portada previa', async ({
  page,
}) => {
  const requested = await campaignFixture(page)
  const player = page.locator('.hero video')
  await expect(player).toHaveCount(1)
  await expect(player).toHaveAttribute('src', firstVideo)
  await expect(player).toHaveAttribute('playsinline', '')
  await expect(player).toHaveAttribute('preload', 'none')
  await expect(player).toHaveAttribute('poster', poster)
  expect(await player.evaluate((video: HTMLVideoElement) => video.muted)).toBe(
    true,
  )
  await expect.poll(() => requested.includes(firstVideo)).toBe(true)
  expect(requested.includes(secondVideo)).toBe(false)
  await page.getByRole('button', { name: 'Diapositiva siguiente' }).click()
  await expect(page.locator('.hero-slide.is-active')).toHaveAttribute(
    'data-media-type',
    'video',
  )
  await expect(page.locator('.hero video')).toHaveCount(1)
  await expect(page.locator('.hero video')).toHaveAttribute('src', secondVideo)
  expect(await page.locator('.hero video[src]').count()).toBe(1)
})

test('Movimiento reducido mantiene portadas sin descargar videos y conserva navegación', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const requested = await campaignFixture(page)
  await expect(page.locator('.hero video[src]')).toHaveCount(0)
  expect(requested).toEqual([])
  await page.getByRole('button', { name: 'Diapositiva siguiente' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.hero-slide.is-active .hero-title')).toHaveText(
    'Segunda película',
  )
  await expect(page.locator('.hero video[src]')).toHaveCount(0)
  expect(requested).toEqual([])
})

test('Ahorro de datos conserva el póster sin iniciar descargas de video', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: Object.assign(new EventTarget(), { saveData: true }),
    }),
  )
  const requested = await campaignFixture(page)
  await expect(page.locator('.hero video[src]')).toHaveCount(0)
  expect(requested).toEqual([])
})

test('La película activa pausa fuera de pantalla, en pestaña oculta y por elección del visitante', async ({
  page,
}) => {
  await campaignFixture(page)
  const video = page.locator('.hero video')
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => !element.paused))
    .toBe(true)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.paused))
    .toBe(true)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => !element.paused))
    .toBe(true)
  await page.getByRole('button', { name: 'Pausar video de campaña' }).click()
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.paused))
    .toBe(true)
  await page.locator('.discovery-section').scrollIntoViewIfNeeded()
  await page.locator('.hero').scrollIntoViewIfNeeded()
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.paused))
    .toBe(true)
  await page
    .getByRole('button', { name: 'Reproducir video de campaña' })
    .click()
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => !element.paused))
    .toBe(true)
})

test('El fin de video avanza en modo automático y un video largo no supera 15 segundos', async ({
  page,
}) => {
  // Install before navigation so both campaigns schedule managed timers. A
  // clock installed after the transition cannot advance an existing interval.
  await page.clock.install()
  await campaignFixture(page)
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLImageElement>('.hero-image img')].every(
      (image) => image.complete,
    ),
  )
  await page.locator('.hero video').dispatchEvent('ended')
  await expect(page.locator('.hero-slide.is-active .hero-title')).toHaveText(
    'Segunda película',
  )
  await page.clock.runFor(15100)
  await expect(page.locator('.hero-slide.is-active')).toHaveAttribute(
    'data-media-type',
    'image',
  )
})

test('Un video fallido conserva su portada, textos y acceso al destino', async ({
  page,
}) => {
  await campaignFixture(page)
  await page
    .locator('.hero video')
    .evaluate((video) => video.dispatchEvent(new Event('error')))
  await expect(page.locator('.hero video')).toHaveCount(0)
  await expect(page.locator('.hero-slide.is-active img')).toBeVisible()
  await expect(page.locator('.hero-slide.is-active .hero-cta')).toHaveAttribute(
    'href',
    '/tienda',
  )
  await expect(
    page.getByRole('button', { name: 'Reproducir video de campaña' }),
  ).toBeVisible()
})

test('Después de una selección manual el fin no avanza y una reproducción larga se detiene a los 15 segundos', async ({
  page,
}) => {
  await campaignFixture(page)
  await page.getByRole('button', { name: 'Ver campaña 2' }).click()
  const player = page.locator('.hero video')
  await expect(player).toHaveAttribute('src', secondVideo)
  await player.evaluate((video: HTMLVideoElement) => {
    Object.defineProperty(video, 'currentTime', {
      configurable: true,
      writable: true,
      value: 16,
    })
    video.dispatchEvent(new Event('timeupdate'))
  })
  await expect(page.locator('.hero-slide.is-active .hero-title')).toHaveText(
    'Segunda película',
  )
  await expect
    .poll(() => player.evaluate((video: HTMLVideoElement) => video.paused))
    .toBe(true)
  await expect(
    page.getByRole('button', { name: 'Reproducir video de campaña' }),
  ).toBeVisible()
})

test('Textos y botones son opcionales; un destino eliminado no crea enlaces rotos', async ({
  page,
}) => {
  await campaignFixture(page, { showText: false, showButton: false })
  await expect(page.locator('.hero-slide.is-active .hero-copy')).toHaveCount(0)
  await expect(page.locator('.hero-slide.is-active .hero-cta')).toHaveCount(0)
  await campaignFixture(page, {
    destination: { type: 'product', productId: 'producto-eliminado' },
  })
  await expect(page.locator('.hero-slide.is-active .hero-cta')).toHaveCount(0)
  await expect(page.locator('.hero-slide.is-active .hero-title')).toHaveText(
    'Campaña de prueba',
  )
})

test('Campañas ocultas no descargan su video; los enlaces a categoría son HTML reales', async ({
  page,
}) => {
  const requested = await campaignFixture(page, { published: false })
  await expect(page.locator('.hero-slide')).toHaveCount(2)
  expect(requested.includes(firstVideo)).toBe(false)
  await campaignFixture(page, {
    first: 'image',
    destination: { type: 'category', category: 'mujer' },
  })
  await expect(page.locator('.hero-slide.is-active .hero-cta')).toHaveAttribute(
    'href',
    '/tienda?genero=mujer',
  )
})

test('La versión móvil usa su propio archivo y su póster; cambiar tamaño sustituye un solo player', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await campaignFixture(page, { alternateMobile: true })
  await expect(page.locator('.hero video')).toHaveAttribute('src', mobileVideo)
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.locator('.hero video')).toHaveCount(1)
  await expect(page.locator('.hero video')).toHaveAttribute('src', firstVideo)
})

for (const viewport of [
  { name: 'monitor', width: 1920, height: 1080 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
])
  test(`Campaña multimedia: composición ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await campaignFixture(page)
    await page.evaluate(() => document.fonts.ready)
    await mkdir(captures, { recursive: true })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false)
    const bounds = (await page.locator('.hero').boundingBox())!
    const button = (await page
      .locator('.hero-slide.is-active .hero-cta')
      .boundingBox())!
    expect(button.x).toBeGreaterThanOrEqual(bounds.x)
    expect(button.x + button.width).toBeLessThanOrEqual(bounds.x + bounds.width)
    expect(button.y + button.height).toBeLessThanOrEqual(
      bounds.y + bounds.height,
    )
    await page.screenshot({
      path: `${captures}/hero-video-${viewport.name}.png`,
      animations: 'disabled',
    })
  })
