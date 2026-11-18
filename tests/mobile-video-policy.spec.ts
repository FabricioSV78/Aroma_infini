import { mkdir, readFile } from 'node:fs/promises'
import { expect, test, type Page } from './test'

const captures = 'artifacts/mobile-video-policy-2026-11-12/screens'
const video = `/media/public/dynamic/aa000000-0000-4000-8000-000000000701/${'a'.repeat(64)}/video.mp4`
const legacyVideo = `/media/public/dynamic/aa000000-0000-4000-8000-000000000702/${'b'.repeat(64)}/video.mp4`
const bytes = await readFile('public/videos/perfume-editorial-wide.mp4')
const poster = `data:image/webp;base64,${(await readFile('public/images/hero-v2-lumiere-desktop-960.webp')).toString('base64')}`
const alternative = `data:image/webp;base64,${(await readFile('public/images/hero-v2-lumiere-mobile-780.webp')).toString('base64')}`

async function configure(
  page: Page,
  fallback: 'alternative' | 'legacy-poster' | 'poster' = 'alternative',
) {
  const requested: string[] = []
  page.on('request', (request) => {
    if (
      /\.(mp4|webm|mov)(?:$|\?)/i.test(request.url()) ||
      request.resourceType() === 'media'
    )
      requested.push(request.url())
  })
  await page.route('**/media/public/dynamic/**/video.mp4', (route) =>
    route.fulfill({
      contentType: 'video/mp4',
      body: bytes,
    }),
  )
  await page.addInitScript(() => {
    let count = 0
    Object.defineProperty(window, '__createdVideos', { get: () => count })
    const create = Document.prototype.createElement
    Object.defineProperty(Document.prototype, 'createElement', {
      value: function (
        this: Document,
        tag: string,
        options?: ElementCreationOptions,
      ) {
        if (tag.toLowerCase() === 'video') count++
        return create.call(this, tag, options)
      },
    })
  })
  await page.goto('/')
  await page.evaluate(
    async ({ video, legacyVideo, poster, alternative, fallback }) => {
      const path = '/src/services/admin-service.ts'
      const { adminService } = (await import(
        path
      )) as typeof import('../src/services/admin-service')
      const content = structuredClone(adminService.getSnapshot().homeContent)
      content.hero = content.hero.slice(0, 2).map((slide, index) => ({
        ...slide,
        order: index,
        mediaType: 'video',
        video,
        poster,
        mobileVideo: fallback === 'alternative' ? legacyVideo : null,
        mobilePoster: fallback === 'poster' ? null : alternative,
        mobileImage: fallback === 'alternative' ? alternative : null,
        title: `Campaña ${index + 1}`,
        published: true,
        destination: { type: 'shop' },
      }))
      content.film = {
        ...content.film,
        video,
        poster,
        mobileVideo: legacyVideo,
        mobilePoster: fallback === 'poster' ? null : alternative,
      }
      const result = adminService.saveHome(
        adminService.getSnapshot().homeMedia,
        content,
      )
      if (result.kind !== 'saved') throw Error(JSON.stringify(result))
      await adminService.flush()
    },
    { video, legacyVideo, poster, alternative, fallback },
  )
  await page.reload()
  await expect(page.locator('.hero-image img').first()).toBeVisible()
  return requested
}

for (const viewport of [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 599, height: 900 },
  { width: 600, height: 390 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 1023, height: 768 },
]) {
  test(`sin reproductores ni solicitudes de vídeo a ${viewport.width} × ${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    const requested = await configure(page)
    await expect
      .poll(() =>
        page
          .locator('.hero-slide.is-active img')
          .evaluate((img: HTMLImageElement) => img.currentSrc),
      )
      .toBe(alternative)
    await page
      .getByRole('button', { name: 'Ver campaña 2', exact: true })
      .click()
    await expect(page.locator('.hero-slide.is-active .hero-title')).toHaveText(
      'Campaña 2',
    )
    const film = page.locator('.editorial-film')
    await film.scrollIntoViewIfNeeded()
    await expect(film.locator('img')).toHaveAttribute('src', alternative)
    await expect(film.locator('img')).toBeVisible()
    await expect
      .poll(() =>
        film
          .locator('img')
          .evaluate(
            (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
          ),
      )
      .toBe(true)
    await expect(page.locator('video')).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: /(?:Reproducir|Pausar) video/ }),
    ).toHaveCount(0)
    await page.waitForTimeout(300)
    expect(requested).toEqual([])
    expect(
      await page.evaluate(
        () => (window as Window & { __createdVideos?: number }).__createdVideos,
      ),
    ).toBe(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false)
    if ([390, 768, 844].includes(viewport.width)) {
      await mkdir(captures, { recursive: true })
      await page.screenshot({ path: `${captures}/film-${viewport.width}.png` })
      await page.locator('.hero').scrollIntoViewIfNeeded()
      await page.screenshot({ path: `${captures}/hero-${viewport.width}.png` })
    }
  })
}

for (const fallback of ['legacy-poster', 'poster'] as const) {
  test(`móvil conserva el ${fallback} sin utilizar vídeos antiguos`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 844, height: 390 })
    const requested = await configure(page, fallback)
    const expected = fallback === 'poster' ? poster : alternative
    await expect
      .poll(() =>
        page
          .locator('.hero-slide.is-active img')
          .evaluate((img: HTMLImageElement) => img.currentSrc),
      )
      .toBe(expected)
    await page.locator('.editorial-film').scrollIntoViewIfNeeded()
    await expect(page.locator('.editorial-film img')).toHaveAttribute(
      'src',
      expected,
    )
    await expect(page.locator('video')).toHaveCount(0)
    expect(requested).toEqual([])
  })
}

for (const width of [1024, 1366, 1920]) {
  test(`escritorio conserva el vídeo y sus controles a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const requested = await configure(page)
    await expect(page.locator('.hero video')).toHaveAttribute('src', video)
    await expect(
      page.getByRole('button', {
        name: 'Pausar video de campaña',
        exact: true,
      }),
    ).toBeVisible()
    await page.locator('.editorial-film').scrollIntoViewIfNeeded()
    await expect(page.locator('.editorial-film video')).toHaveAttribute(
      'src',
      video,
    )
    await expect(
      page.getByRole('button', { name: 'Pausar video editorial', exact: true }),
    ).toBeVisible()
    expect(requested.some((url) => url.includes(legacyVideo))).toBe(false)
  })
}

test('pasar a escritorio activa el vídeo principal y volver a móvil desmonta y libera ambos reproductores', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const requested = await configure(page)
  expect(requested).toEqual([])
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.locator('.hero video')).toHaveAttribute('src', video)
  await expect(page.locator('.hero video')).toHaveAttribute('preload', 'none')
  await expect(page.locator('.hero video')).toHaveAttribute('poster', poster)
  await expect
    .poll(() => requested.some((url) => url.endsWith(video)))
    .toBe(true)
  const previousHero = await page.locator('.hero video').elementHandle()
  await page.locator('.editorial-film').scrollIntoViewIfNeeded()
  await expect(page.locator('.editorial-film video')).toHaveAttribute(
    'src',
    video,
  )
  const previousFilm = await page
    .locator('.editorial-film video')
    .elementHandle()
  await page
    .getByRole('button', { name: 'Pausar video editorial', exact: true })
    .click()
  await expect(page.locator('.editorial-film video')).toHaveAttribute(
    'src',
    video,
  )
  await page.setViewportSize({ width: 768, height: 1024 })
  await expect(page.locator('video')).toHaveCount(0)
  for (const element of [previousHero, previousFilm]) {
    expect(
      await element!.evaluate((node: HTMLVideoElement) => ({
        paused: node.paused,
        src: node.getAttribute('src'),
      })),
    ).toEqual({ paused: true, src: null })
  }
  const afterResize = requested.length
  await page.waitForTimeout(300)
  expect(requested).toHaveLength(afterResize)
  expect(requested.some((url) => url.includes(legacyVideo))).toBe(false)
})

test('las vistas previas administrativas también muestran imágenes en móvil', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const requested = await configure(page)
  await page.goto('/admin/home')
  await page
    .getByRole('button', { name: 'Abrir vista previa', exact: true })
    .click()
  const heroPreview = page.locator('.admin-home-hero-preview')
  await expect(heroPreview.locator('img')).toHaveAttribute('src', alternative)
  await expect(page.locator('video')).toHaveCount(0)
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page
    .getByRole('button', { name: 'Video editorial', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Abrir vista previa', exact: true })
    .click()
  await expect(
    page.getByRole('img', { name: 'Vista previa de imagen editorial' }),
  ).toHaveAttribute('src', alternative)
  await expect(page.locator('video')).toHaveCount(0)
  expect(requested).toEqual([])
  expect(
    await page.evaluate(
      () => (window as Window & { __createdVideos?: number }).__createdVideos,
    ),
  ).toBe(0)
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page
    .getByLabel('Subir video editorial', { exact: true })
    .setInputFiles({
      name: 'solo-escritorio.mp4',
      mimeType: 'video/mp4',
      buffer: bytes,
    })
  await expect(page.getByRole('alertdialog')).toContainText(
    'Prepara los videos desde una computadora',
  )
  expect(
    await page.evaluate(
      () => (window as Window & { __createdVideos?: number }).__createdVideos,
    ),
  ).toBe(0)
  expect(requested).toEqual([])
})

test('el HTML prerenderizado conserva imágenes y contenido sin inicializar un vídeo antes de React', async ({
  page,
  context,
}) => {
  await page.goto('/contacto')
  const snapshot = await page.evaluate(async () => {
    const path = '/scripts/prerender-media.mjs'
    const { imageOnlySnapshot } = await import(path)
    const wrapper = document.createElement('section')
    wrapper.innerHTML =
      '<h2>Campaña</h2><img alt="Portada" src="/videos/perfume-editorial-mobile.webp"><video preload="none" poster="/videos/perfume-editorial-wide.webp"><source src="/video-should-never-load.mp4"></video><a href="/tienda">Explorar</a>'
    document.body.append(wrapper)
    const html = imageOnlySnapshot() as string
    return { html, originalCount: wrapper.querySelectorAll('video').length }
  })
  expect(snapshot.originalCount).toBe(1)
  expect(snapshot.html).not.toMatch(/<video\b/)
  expect(snapshot.html).toContain('Portada')
  const mobile = await context.newPage()
  await mobile.setViewportSize({ width: 390, height: 844 })
  const media: string[] = []
  mobile.on('request', (r) => {
    if (r.resourceType() === 'media' || r.url().includes('.mp4'))
      media.push(r.url())
  })
  // Disable scripts to inspect the shared initial HTML before any client code.
  await mobile.route('**/initial-fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: snapshot.html.replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''),
    }),
  )
  await mobile.goto(new URL('/initial-fixture', page.url()).href)
  await expect(mobile.getByRole('heading', { name: 'Campaña' })).toBeVisible()
  await expect(mobile.locator('video')).toHaveCount(0)
  expect(media).toEqual([])
})
