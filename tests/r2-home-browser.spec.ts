import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import type { Page } from '@playwright/test'
import type { HomeContent, HomeMedia } from '../src/types/home'
import type { ManagedMediaAsset, ManagedVideoAsset } from '../src/domain/media'
import { inspectMp4 } from '../worker/media-mp4'
import { DEFAULT_OLFACTORY_FAMILIES } from '../src/domain/olfactory-family'
import {
  expect,
  fixtureProject,
  signIn,
  test as authTest,
  type SupabaseAuthNetwork,
} from './supabase-auth-fixture'

const origin = `https://${fixtureProject}.supabase.co`
const mediaOrigin = 'https://media-home-fixture.invalid'
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST,GET,OPTIONS',
}
interface HomeFixture {
  version: number
  settingsVersion: number
  content: HomeContent | null
  media: HomeMedia | null
  assets: Map<string, ManagedMediaAsset | ManagedVideoAsset>
  objects: Map<string, Buffer>
  writes: Array<Record<string, unknown>>
  uploads: number
  videoUploads: number
  failSave: boolean
  conflict: boolean
  failUpload: boolean
  calls: string[]
}
const test = authTest.extend<{ homeNetwork: HomeFixture }>({
  homeNetwork: async ({ context, supabaseNetwork }, runFixture) => {
    void supabaseNetwork
    const state: HomeFixture = {
      version: 0,
      settingsVersion: 1,
      content: null,
      media: null,
      assets: new Map(),
      objects: new Map(),
      writes: [],
      uploads: 0,
      videoUploads: 0,
      failSave: false,
      conflict: false,
      failUpload: false,
      calls: [],
    }
    const document = (publicOnly = false) => {
      const content = state.content ? structuredClone(state.content) : null
      if (content && publicOnly)
        content.hero = content.hero.filter((slide) => slide.published)
      const references = new Set<string>()
      const visit = (value: unknown) => {
        if (typeof value === 'string') references.add(value)
        else if (Array.isArray(value)) value.forEach(visit)
        else if (value && typeof value === 'object')
          Object.values(value).forEach(visit)
      }
      visit(content)
      visit(state.media)
      return {
        version: state.version,
        content,
        media: state.media,
        mediaAssets: [...state.assets.values()].filter((asset) =>
          references.has(asset.src),
        ),
      }
    }
    await context.route(`${origin}/rest/v1/rpc/*`, async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)!
      if (
        !name.startsWith('catalog_') &&
        !name.startsWith('admin_') &&
        name !== 'home_document'
      ) {
        await route.fallback()
        return
      }
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers })
        return
      }
      state.calls.push(name)
      const body = route.request().postDataJSON() as Record<string, unknown>
      const settings = {
        features: { complementsEnabled: false },
        featuredBrandId: null,
        olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
        homeAnnouncement: state.content?.announcement ?? null,
        homeVersion: state.version,
      }
      if (name === 'admin_home_document' || name === 'home_document') {
        await route.fulfill({
          json: document(name === 'home_document'),
          headers,
        })
      } else if (name === 'admin_catalog_page') {
        await route.fulfill({
          json: {
            ...settings,
            products: [],
            brands: [],
            productVersions: {},
            brandVersions: {},
            total: 0,
            settingsVersion: state.settingsVersion,
          },
          headers,
        })
      } else if (name === 'catalog_settings') {
        await route.fulfill({ json: settings, headers })
      } else if (name === 'catalog_home_context') {
        await route.fulfill({
          json: { ...settings, brands: [], profiles: [], items: [] },
          headers,
        })
      } else if (name === 'catalog_brand_previews') {
        await route.fulfill({ json: { brands: [], mediaAssets: [] }, headers })
      } else if (name === 'catalog_brands') {
        await route.fulfill({ json: [], headers })
      } else if (name === 'catalog_browse') {
        await route.fulfill({
          json: {
            ...settings,
            items: [],
            total: 0,
            availableTotal: 0,
            page: 1,
            pages: 1,
            brands: [],
            familyCodes: [],
          },
          headers,
        })
      } else if (
        name === 'catalog_products' ||
        name === 'catalog_products_by_ids'
      ) {
        await route.fulfill({ json: { items: [], total: 0 }, headers })
      } else if (name === 'admin_save_home') {
        state.writes.push(body)
        expect(JSON.stringify(body)).not.toMatch(
          /data:image|data:video|base64|blob:|\/media\//,
        )
        if (
          state.conflict ||
          body.p_expected_version !== state.version ||
          body.p_expected_settings_version !== state.settingsVersion
        ) {
          await route.fulfill({
            status: 409,
            json: { code: 'PT409', message: 'Fixture optimistic conflict' },
            headers,
          })
          return
        }
        if (state.failSave) {
          await route.fulfill({
            status: 503,
            json: { code: 'PGRST000', message: 'Fixture temporary failure' },
            headers,
          })
          return
        }
        const replace = (value: unknown): unknown => {
          if (typeof value === 'string' && state.assets.has(value))
            return state.assets.get(value)!.src
          if (Array.isArray(value)) return value.map(replace)
          if (value && typeof value === 'object')
            return Object.fromEntries(
              Object.entries(value).map(([key, value]) => [
                key,
                replace(value),
              ]),
            )
          return value
        }
        state.media = replace(body.p_media) as HomeMedia
        state.content = replace(body.p_content) as HomeContent
        state.version++
        state.settingsVersion++
        await route.fulfill({
          json: {
            home: document(),
            features: settings.features,
            featuredBrandId: null,
            settingsVersion: state.settingsVersion,
          },
          headers,
        })
      } else {
        await route.fulfill({
          status: 404,
          json: { code: 'PGRST202' },
          headers,
        })
      }
    })
    await context.route('**/api/admin/media/upload', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers })
        return
      }
      expect(route.request().headers().authorization).toMatch(/^Bearer ey/)
      if (state.failUpload) {
        await route.fulfill({ status: 503, json: { code: 'storage' }, headers })
        return
      }
      const request = route.request()
      const form = await new Request('https://fixture.invalid/upload', {
        method: 'POST',
        headers: { 'content-type': request.headers()['content-type'] },
        body: new Uint8Array(request.postDataBuffer()!).buffer,
      }).formData()
      const files = await Promise.all(
        form.getAll('files').map(async (file) => {
          if (typeof file === 'string') throw new Error('Expected binary file')
          const bytes = Buffer.from(await file.arrayBuffer())
          const decoded = await sharp(bytes).metadata()
          return { bytes, width: decoded.width!, height: decoded.height! }
        }),
      )
      files.sort((a, b) => a.width - b.width)
      const master = files.at(-1)!
      const id = randomUUID(),
        hash = createHash('sha256').update(master.bytes).digest('hex')
      const variants = files.map((file) => {
        const src = `/media/public/dynamic/${id}/${hash}/${file.width}.webp`
        state.objects.set(src, file.bytes)
        return { src, width: file.width, height: file.height }
      })
      const asset = {
        id,
        src: variants.at(-1)!.src,
        width: master.width,
        height: master.height,
        variants,
      }
      state.assets.set(id, asset)
      state.uploads++
      await route.fulfill({ json: { asset }, headers })
    })
    await context.route('**/api/admin/media/video-upload', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers })
        return
      }
      const request = route.request()
      expect(request.headers().authorization).toMatch(/^Bearer ey/)
      const form = await new Request('https://fixture.invalid/video-upload', {
        method: 'POST',
        headers: { 'content-type': request.headers()['content-type'] },
        body: new Uint8Array(request.postDataBuffer()!).buffer,
      }).formData()
      const file = form.get('file')
      if (!file || typeof file === 'string')
        throw new Error('Expected binary MP4')
      expect(file.type).toBe('video/mp4')
      const bytes = Buffer.from(await file.arrayBuffer())
      const info = inspectMp4(new Uint8Array(bytes).buffer)
      const id = randomUUID(),
        hash = createHash('sha256').update(bytes).digest('hex')
      const asset: ManagedVideoAsset = {
        id,
        src: `/media/public/dynamic/${id}/${hash}/video.mp4`,
        ...info,
        byteSize: bytes.length,
        mimeType: 'video/mp4',
      }
      state.assets.set(id, asset)
      state.objects.set(asset.src, bytes)
      state.videoUploads++
      await route.fulfill({ json: { asset }, headers })
    })
    await context.route('**/media/public/dynamic/**', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers })
        return
      }
      const data = state.objects.get(new URL(route.request().url()).pathname)
      await route.fulfill(
        data
          ? {
              body: data,
              contentType: route.request().url().endsWith('.mp4')
                ? 'video/mp4'
                : 'image/webp',
              headers,
            }
          : { status: 404, body: 'missing' },
      )
    })
    await runFixture(state)
  },
})

async function openHome(page: Page, network: SupabaseAuthNetwork) {
  network.adminMembership = true
  await signIn(page, 'admin')
  await page
    .getByLabel('Código de verificación', { exact: true })
    .fill('123456')
  await page
    .getByRole('button', { name: 'Verificar y continuar', exact: true })
    .click()
  await expect(page).toHaveURL('/admin')
  await page.goto('/admin/home')
  await expect(
    page.getByRole('button', { name: 'Guardar cambios del Home' }),
  ).toBeVisible({ timeout: 20000 })
}
async function photo(width: number, height: number, name: string) {
  return {
    name,
    mimeType: 'image/webp',
    buffer: await sharp({
      create: { width, height, channels: 3, background: '#d3c5ac' },
    })
      .webp({ quality: 90 })
      .toBuffer(),
  }
}

test('Home guarda referencias canónicas y puede leerse de nuevo sin publicar la vista previa', async ({
  page,
  supabaseNetwork,
  homeNetwork,
}) => {
  await openHome(page, supabaseNetwork)
  await page
    .getByLabel('Subir imagen de escritorio de campaña 1')
    .setInputFiles(await photo(1600, 900, 'hero.webp'))
  await expect(page.getByText('Preparando archivo…')).not.toBeVisible()
  await page
    .getByLabel('Subir imagen móvil de campaña 1')
    .setInputFiles(await photo(780, 1170, 'hero-mobile.webp'))
  await expect(page.getByText('Preparando archivo…')).not.toBeVisible()
  await page.getByRole('button', { name: 'Abrir vista previa' }).click()
  expect(homeNetwork.uploads).toBe(0)
  expect(homeNetwork.writes).toHaveLength(0)
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.getByRole('button', { name: 'Guardar cambios del Home' }).click()
  await expect(page.getByText('Todo guardado', { exact: true })).toBeVisible()
  expect(homeNetwork.uploads).toBe(2)
  expect(homeNetwork.writes).toHaveLength(1)
  const canonical = await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    const state = adminService.getSnapshot()
    return { hero: state.homeContent.hero, version: state.homeVersion }
  })
  expect(canonical.version).toBe(1)
  expect(
    canonical.hero.some((slide) =>
      slide.desktopImage?.startsWith('/media/public/dynamic/'),
    ),
  ).toBe(true)
  await page.reload()
  await expect(page.getByText('Todo guardado', { exact: true })).toBeVisible()
  await page.goto('/')
  await expect(page.locator('.hero picture img').first()).toHaveAttribute(
    'src',
    /\/media\/public\/dynamic\//,
  )
  await expect(page.locator('.hero picture img').first()).toHaveAttribute(
    'srcset',
    /960w/,
  )
  await expect(page.locator('.hero picture img').first()).toHaveAttribute(
    'srcset',
    /1600w/,
  )
  const selected = canonical.hero.find((slide) =>
    slide.desktopImage?.startsWith('/media/public/dynamic/'),
  )!
  const mobileAsset = [...homeNetwork.assets.values()].find(
    (asset) => asset.src === selected.mobileImage,
  )
  if (!mobileAsset || !('variants' in mobileAsset))
    throw new Error('Expected verified mobile candidates')
  const mobileCandidates = mobileAsset.variants.map(
    (variant) => mediaOrigin + variant.src,
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(async () =>
      mobileCandidates.includes(
        await page
          .locator('.hero picture img')
          .first()
          .evaluate((image) => (image as HTMLImageElement).currentSrc),
      ),
    )
    .toBe(true)
  await expect(page.locator('.hero picture source').first()).toHaveAttribute(
    'srcset',
    /780w/,
  )
  await page.setViewportSize({ width: 1920, height: 1080 })
  await expect
    .poll(() =>
      page
        .locator('.hero picture img')
        .first()
        .evaluate((image) => (image as HTMLImageElement).currentSrc),
    )
    .toBe(mediaOrigin + selected.desktopImage)
})

test('Los dos MP4 y sus pósteres se guardan por UUID y se reproducen desde el origen de medios tras recargar', async ({
  page,
  supabaseNetwork,
  homeNetwork,
}) => {
  test.setTimeout(120000)
  await openHome(page, supabaseNetwork)
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
  ).toBeVisible({ timeout: 60000 })
  await expect(
    page.getByText('Preparando archivo…', { exact: true }),
  ).not.toBeVisible({ timeout: 60000 })
  await page.getByLabel('Subir video editorial para celular').setInputFiles({
    name: 'movil.mp4',
    mimeType: 'video/mp4',
    buffer: await readFile('public/videos/perfume-editorial-mobile.mp4'),
  })
  await expect(
    page.getByRole('button', { name: 'Usar el video principal', exact: true }),
  ).toBeVisible({ timeout: 60000 })
  await expect(
    page.getByText('Preparando archivo…', { exact: true }),
  ).not.toBeVisible({ timeout: 60000 })
  await page.getByRole('button', { name: 'Abrir vista previa' }).click()
  expect(homeNetwork.uploads).toBe(0)
  expect(homeNetwork.videoUploads).toBe(0)
  expect(homeNetwork.writes).toHaveLength(0)
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page.getByRole('button', { name: 'Guardar cambios del Home' }).click()
  await expect(page.getByText('Todo guardado', { exact: true })).toBeVisible({
    timeout: 20000,
  })
  expect(homeNetwork.videoUploads).toBe(2)
  expect(homeNetwork.uploads).toBe(2)
  const write = homeNetwork.writes[0].p_content as {
    film: Record<string, unknown>
  }
  for (const key of ['video', 'mobileVideo', 'poster', 'mobilePoster'])
    expect(write.film[key]).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/)
  const film = homeNetwork.content!.film
  expect(film.video).not.toBe(film.mobileVideo)
  expect(film.poster).not.toBe(film.mobilePoster)
  await page.reload()
  await expect(page.getByText('Todo guardado', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const section = page.locator('.editorial-film')
  await section.scrollIntoViewIfNeeded()
  await expect(section.locator('video')).toHaveAttribute(
    'poster',
    mediaOrigin + film.mobilePoster,
  )
  await expect(section.locator('video')).not.toHaveAttribute('src')
  await page.getByRole('button', { name: 'Reproducir video editorial' }).click()
  await expect(section.locator('video')).toHaveAttribute(
    'src',
    mediaOrigin + film.mobileVideo,
  )
  await expect
    .poll(() =>
      section
        .locator('video')
        .evaluate((video: HTMLVideoElement) => video.readyState),
    )
    .toBeGreaterThanOrEqual(2)
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(section.locator('video')).toHaveAttribute(
    'poster',
    mediaOrigin + film.poster,
  )
  await expect(section.locator('video')).toHaveAttribute(
    'src',
    mediaOrigin + film.video,
  )
})

test('Una campaña de video conserva UUIDs, portada y versión móvil en el adaptador remoto tras recargar', async ({
  page,
  supabaseNetwork,
  homeNetwork,
}) => {
  test.setTimeout(120000)
  await openHome(page, supabaseNetwork)
  await page
    .getByLabel('Tipo de contenido', { exact: true })
    .selectOption('video')
  await page
    .getByLabel('Subir video de campaña 1', { exact: true })
    .setInputFiles({
      name: 'campana.mp4',
      mimeType: 'video/mp4',
      buffer: await readFile('public/videos/perfume-editorial-wide.mp4'),
    })
  await expect(
    page.getByRole('button', { name: 'Quitar video', exact: true }),
  ).toBeVisible({ timeout: 60000 })
  await expect(
    page.getByText('Preparando archivo…', { exact: true }),
  ).not.toBeVisible({ timeout: 60000 })
  await page
    .getByLabel('Subir video móvil de campaña 1', { exact: true })
    .setInputFiles({
      name: 'campana-movil.mp4',
      mimeType: 'video/mp4',
      buffer: await readFile('public/videos/perfume-editorial-mobile.mp4'),
    })
  await expect(
    page.getByRole('button', { name: 'Usar video principal', exact: true }),
  ).toBeVisible({ timeout: 60000 })
  await expect(
    page.getByText('Preparando archivo…', { exact: true }),
  ).not.toBeVisible({ timeout: 60000 })
  await page
    .getByRole('button', { name: 'Abrir vista previa', exact: true })
    .click()
  await expect(page.locator('.admin-home-hero-preview img')).toBeVisible()
  expect(homeNetwork.writes).toHaveLength(0)
  expect(homeNetwork.videoUploads).toBe(0)
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page
    .getByRole('button', { name: 'Guardar cambios del Home', exact: true })
    .click()
  await expect(page.getByText('Todo guardado', { exact: true })).toBeVisible({
    timeout: 20000,
  })
  expect(homeNetwork.videoUploads).toBe(2)
  expect(homeNetwork.uploads).toBe(2)
  const written = (homeNetwork.writes[0].p_content as HomeContent).hero[0]
  for (const field of [
    'video',
    'mobileVideo',
    'poster',
    'mobilePoster',
  ] as const)
    expect(written[field]).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/)
  const campaign = homeNetwork.content!.hero[0]
  await page.reload()
  await expect(
    page.getByLabel('Tipo de contenido', { exact: true }),
  ).toHaveValue('video')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const active = page.locator('.hero-slide.is-active')
  await expect(active.locator('video')).toHaveAttribute(
    'poster',
    mediaOrigin + campaign.mobilePoster,
  )
  await expect(active.locator('video')).not.toHaveAttribute('src')
  const mobileImages = [...homeNetwork.assets.values()].find(
    (asset) => asset.src === campaign.mobilePoster,
  )
  expect(mobileImages).toHaveProperty('variants')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(active.locator('video')).toHaveAttribute(
    'src',
    mediaOrigin + campaign.mobileVideo,
  )
  await expect
    .poll(() =>
      active
        .locator('video')
        .evaluate((video: HTMLVideoElement) => video.readyState),
    )
    .toBeGreaterThanOrEqual(2)
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(active.locator('video')).toHaveAttribute(
    'src',
    mediaOrigin + campaign.video,
  )
  await expect(page.locator('.hero video[src]')).toHaveCount(1)
})

test('Las campañas ocultas se conservan para editar pero el Home remoto no publica sus textos ni videos', async ({
  page,
  supabaseNetwork,
  homeNetwork,
}) => {
  await openHome(page, supabaseNetwork)
  await page
    .getByLabel('Título Una línea por renglón; máximo 3')
    .fill('Campaña futura privada')
  await page
    .getByLabel('Estado de campaña', { exact: true })
    .selectOption('hidden')
  await page
    .getByRole('button', { name: 'Guardar cambios del Home', exact: true })
    .click()
  await expect(page.getByText('Todo guardado', { exact: true })).toBeVisible()
  expect(homeNetwork.content!.hero).toHaveLength(5)
  expect(homeNetwork.content!.hero[0].published).toBe(false)
  await page.reload()
  await expect(
    page.getByLabel('Estado de campaña', { exact: true }),
  ).toHaveValue('hidden')
  await expect(
    page.getByLabel('Título Una línea por renglón; máximo 3'),
  ).toHaveValue('Campaña futura privada')
  await page.goto('/')
  await expect(page.locator('.hero-slide')).toHaveCount(4)
  await expect(page.locator('.hero')).not.toContainText(
    'Campaña futura privada',
  )
})

test('La franja confirmada se conserva en los metadatos al ir a Tienda y vuelve a mostrarse en el Home', async ({
  page,
  supabaseNetwork,
  homeNetwork,
}) => {
  await openHome(page, supabaseNetwork)
  await page
    .getByRole('button', { name: 'Franja superior', exact: true })
    .click()
  const message = 'Entregas en Lima y Callao · Atención personalizada'
  await page.getByLabel('Mensaje de entrega').fill(message)
  await page.getByRole('button', { name: 'Guardar cambios del Home' }).click()
  await expect(page.getByText('Todo guardado', { exact: true })).toBeVisible()
  expect(homeNetwork.content?.announcement.deliveryText).toBe(message)
  await page.goto('/tienda')
  await expect(
    page.getByRole('heading', { name: 'Explora la tienda', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.announcement')).toHaveCount(0)
  const saved = await page.evaluate(async () => {
    const path = '/src/services/storefront-repository.ts'
    const { readStorefrontMetadata } = (await import(
      path
    )) as typeof import('../src/services/storefront-repository')
    return (await readStorefrontMetadata()).content.announcement.deliveryText
  })
  expect(saved).toBe(message)
  await page.goto('/')
  await expect(page.locator('.announcement')).toContainText(message)
})

test('Una subida fallida conserva la fotografía y no envía el borrador al comando SQL', async ({
  page,
  supabaseNetwork,
  homeNetwork,
}) => {
  await openHome(page, supabaseNetwork)
  await page
    .getByLabel('Subir imagen de escritorio de campaña 1')
    .setInputFiles(await photo(1600, 900, 'retry-hero.webp'))
  await expect(page.getByText('Preparando archivo…')).not.toBeVisible()
  homeNetwork.failUpload = true
  await page.getByRole('button', { name: 'Guardar cambios del Home' }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  expect(homeNetwork.writes).toHaveLength(0)
  expect(homeNetwork.version).toBe(0)
  await page
    .getByRole('button', { name: 'Volver a editar', exact: true })
    .click()
  await expect(
    page.getByText('Cambios sin guardar', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Usar original', exact: true }),
  ).toBeVisible()
  homeNetwork.failUpload = false
  await page.getByRole('button', { name: 'Guardar cambios del Home' }).click()
  await expect(page.getByText('Todo guardado', { exact: true })).toBeVisible()
  expect(homeNetwork.writes).toHaveLength(1)
})

for (const failure of ['network', 'conflict'] as const) {
  test(`Home conserva el borrador tras ${failure === 'network' ? 'fallo de guardado' : 'conflicto de versión'}`, async ({
    page,
    supabaseNetwork,
    homeNetwork,
  }) => {
    await openHome(page, supabaseNetwork)
    const title = page.getByLabel('Título Una línea por renglón; máximo 3')
    await title.fill('Borrador sin publicar')
    homeNetwork.failSave = failure === 'network'
    homeNetwork.conflict = failure === 'conflict'
    await page.getByRole('button', { name: 'Guardar cambios del Home' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    expect(homeNetwork.version).toBe(0)
    expect(homeNetwork.content).toBeNull()
    await page
      .getByRole('button', { name: 'Volver a editar', exact: true })
      .click()
    await expect(title).toHaveValue('Borrador sin publicar')
    await expect(
      page.getByText('Cambios sin guardar', { exact: true }),
    ).toBeVisible()
  })
}
