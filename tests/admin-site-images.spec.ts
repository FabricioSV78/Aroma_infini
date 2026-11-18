import { adminListFixture } from './admin-list-fixture'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { type Page } from '@playwright/test'
import { defaultSiteSettings } from '../src/domain/site-settings'
import { DEFAULT_OLFACTORY_FAMILIES } from '../src/domain/olfactory-family'
import type { AdminMediaItem } from '../src/services/media-admin-service'
import {
  SITE_MEDIA_SLOTS,
  type SiteMediaItem,
} from '../src/domain/site-media-slots'
import { publicHomeCatalogFixture } from './public-home-catalog-fixture'
import {
  expect,
  fixtureProject,
  signIn,
  test as authTest,
  type SupabaseAuthNetwork,
} from './supabase-auth-fixture'

const origin = `https://${fixtureProject}.supabase.co`
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST,GET,OPTIONS',
}
interface SiteImagesFixture {
  items: AdminMediaItem[]
  requests: { name: string; body: Record<string, unknown> }[]
  uploads: number
  conflict: boolean
  placements: SiteMediaItem[]
  wrongSvgReceipt: boolean
  svgRequests: number
  siteValidationError: boolean
}
const test = authTest.extend<{ siteImages: SiteImagesFixture }>({
  siteImages: async ({ context, supabaseNetwork }, runFixture) => {
    void supabaseNetwork
    const objects = new Map<string, Buffer>()
    const state: SiteImagesFixture = {
      items: [],
      requests: [],
      uploads: 0,
      conflict: false,
      placements: SITE_MEDIA_SLOTS.map((definition) => ({
        slot: definition.slot,
        version: 1,
        alt: definition.fallback.alt,
        asset: null,
        assetId: null,
      })),
      wrongSvgReceipt: false,
      svgRequests: 0,
      siteValidationError: false,
    }
    await context.route(`${origin}/rest/v1/rpc/*`, async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)!
      if (
        !name.startsWith('admin_') &&
        !name.startsWith('catalog_') &&
        ![
          'site_settings',
          'site_media_document',
          'home_document',
          'public_media_aliases',
        ].includes(name)
      ) {
        await route.fallback()
        return
      }
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers })
        return
      }
      const body = route.request().postDataJSON() as Record<string, unknown>
      state.requests.push({ name, body })
      const reply = (json: unknown, status = 200) =>
        route.fulfill({ json, status, headers })
      if (['admin_product_list','admin_order_list','admin_customer_list','admin_catalog_context','admin_catalog_choices','admin_offer_list','admin_products_by_ids','admin_import_conflicts'].includes(name)) return reply(adminListFixture(name,body))
      if (name === 'admin_catalog_page')
        return reply({
          products: [],
          brands: [],
          productVersions: {},
          brandVersions: {},
          features: { complementsEnabled: false },
          olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
          featuredBrandId: null,
          settingsVersion: 1,
          total: 0,
        })
      if (name === 'catalog_settings')
        return reply({
          features: { complementsEnabled: false },
          olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
          featuredBrandId: null,
        })
      if (name === 'catalog_home_context')
        return reply(
          publicHomeCatalogFixture(
            {
              brands: [],
              features: { complementsEnabled: false },
              olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
              featuredBrandId: null,
            },
            [],
          ),
        )
      if (name === 'admin_home_document' || name === 'home_document')
        return reply({
          media: null,
          content: null,
          mediaAssets: [],
          version: 0,
        })
      if (
        name === 'site_media_document' ||
        name === 'admin_site_media_document'
      )
        return reply({ items: state.placements })
      if (name === 'site_settings')
        return reply({ version: 1, data: defaultSiteSettings() })
      if (name === 'public_media_aliases') return reply({ items: [] })
      if (name === 'admin_save_site_media') {
        if (state.siteValidationError)
          return reply(
            { code: '22023', message: 'PRIVATE_PROVIDER_MESSAGE' },
            400,
          )
        const item = state.placements.find((item) => item.slot === body.p_slot)!
        if (state.conflict || !item || body.p_expected_version !== item.version)
          return reply(
            { code: 'PT409', message: 'PRIVATE_PROVIDER_MESSAGE' },
            409,
          )
        const selected = state.items.find((item) => item.id === body.p_asset_id)
        item.version++
        item.alt = String(body.p_alt)
        item.assetId = selected?.id ?? null
        const selectedAsset = selected?.asset
        item.asset =
          selectedAsset &&
          ('variants' in selectedAsset ||
            selectedAsset.mimeType === 'image/svg+xml')
            ? selectedAsset
            : null
        if (selected) {
          selected.useCount++
          selected.state = 'used'
          selected.retireAfter = null
        }
        return reply({ items: state.placements })
      }
      if (name === 'admin_media_detail') {
        const item = state.items.find((item) => item.id === body.p_asset_id)
        return reply({
          ...item,
          usages: item?.useCount
            ? [
                {
                  section: 'home',
                  label: 'Categoría Para él',
                  key: 'home:hombre',
                },
              ]
            : [],
          events: [],
        })
      }
      if (name === 'admin_media_metadata') {
        const item = state.items.find((item) => item.id === body.p_asset_id)!
        if (state.conflict || body.p_expected_version !== item.version)
          return reply(
            { code: 'PT409', message: 'PRIVATE_PROVIDER_MESSAGE' },
            409,
          )
        item.version++
        item.name = String(body.p_name)
        item.alt = String(body.p_alt)
        item.section = body.p_section as AdminMediaItem['section']
        return reply(item)
      }
      if (name === 'catalog_products' || name === 'catalog_products_by_ids')
        return reply({ items: [], total: 0 })
      if (name === 'catalog_brands' || name === 'catalog_brand_previews')
        return reply([])
      return reply([], 200)
    })
    await context.route('**/api/admin/media/upload', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers })
        return
      }
      const request = route.request()
      expect(request.headers().authorization).toMatch(/^Bearer ey/)
      const form = await new Request('https://fixture.invalid', {
        method: 'POST',
        headers: { 'content-type': request.headers()['content-type'] },
        body: new Uint8Array(request.postDataBuffer()!).buffer,
      }).formData()
      const variants: { width: number; height: number; bytes: Buffer }[] = []
      for (const value of form.getAll('files')) {
        expect(typeof value).not.toBe('string')
        const file = value as File
        expect(file.type).toBe('image/webp')
        const contents = Buffer.from(await file.arrayBuffer())
        const image = await sharp(contents).metadata()
        variants.push({
          width: image.width!,
          height: image.height!,
          bytes: contents,
        })
      }
      variants.sort((a, b) => a.width - b.width)
      const master = variants.at(-1)!,
        id = randomUUID()
      const digest = createHash('sha256').update(master.bytes).digest('hex')
      const candidates = variants.map((variant) => {
        const src = `/media/public/dynamic/${id}/${digest}/${variant.width}.webp`
        objects.set(src, variant.bytes)
        return { src, width: variant.width, height: variant.height }
      })
      const asset = { id, ...candidates.at(-1)!, variants: candidates }
      state.items.unshift({
        id,
        name: 'Carga nueva',
        alt: '',
        section: 'home',
        version: 1,
        purpose: String(form.get('purpose')) as AdminMediaItem['purpose'],
        state: 'unused',
        useCount: 0,
        createdAt: '2026-11-11T12:00:00Z',
        retireAfter: '2026-11-12T12:00:00Z',
        asset,
      })
      state.uploads++
      await route.fulfill({ json: { asset }, headers })
    })
    const svgOperations = new Map<
      string,
      NonNullable<AdminMediaItem['asset']>
    >()
    await context.route('**/api/admin/media/svg-upload', async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers })
        return
      }
      const request = route.request()
      expect(request.headers().authorization).toMatch(/^Bearer ey/)
      const form = await new Request('https://fixture.invalid', {
        method: 'POST',
        headers: { 'content-type': request.headers()['content-type'] },
        body: new Uint8Array(request.postDataBuffer()!).buffer,
      }).formData()
      const file = form.get('file') as File
      expect(file.type).toBe('image/svg+xml')
      const content = Buffer.from(await file.arrayBuffer())
      expect(content).toEqual(await readFile('public/brand/logo-on-light.svg'))
      const operationId = String(form.get('operationId'))
      let asset = svgOperations.get(operationId)
      if (!asset) {
        const id = randomUUID()
        const sha = createHash('sha256').update(content).digest('hex')
        const src = `/media/public/dynamic/${id}/${sha}/vector.svg`
        asset = {
          id,
          src,
          width: 774,
          height: 374,
          byteSize: content.length,
          mimeType: 'image/svg+xml',
        }
        objects.set(src, content)
        svgOperations.set(operationId, asset)
        state.items.unshift({
          id,
          name: 'Logotipo nuevo',
          alt: '',
          section: 'identity',
          version: 1,
          purpose: 'site-vector',
          state: 'unused',
          useCount: 0,
          createdAt: '2026-11-11T12:00:00Z',
          retireAfter: '2026-11-12T12:00:00Z',
          asset,
        })
        state.uploads++
      }
      state.svgRequests++
      await route.fulfill({
        json: {
          asset: state.wrongSvgReceipt
            ? {
                ...asset,
                src: asset.src.replace(
                  /\/[a-f0-9]{64}\//,
                  `/${'0'.repeat(64)}/`,
                ),
              }
            : asset,
        },
        headers,
      })
    })
    await context.route('**/media/public/dynamic/**', async (route) => {
      const content = objects.get(new URL(route.request().url()).pathname)
      await route.fulfill(
        content
          ? {
              body: content,
              contentType: new URL(route.request().url()).pathname.endsWith(
                '.svg',
              )
                ? 'image/svg+xml'
                : 'image/webp',
              headers,
            }
          : { status: 404, body: 'missing' },
      )
    })
    await runFixture(state)
  },
})

async function administrator(page: Page, network: SupabaseAuthNetwork) {
  network.adminMembership = true
  await signIn(page, 'admin')
  await page.getByLabel('Código de verificación', { exact: true }).fill('123456')
  await page
    .getByRole('button', { name: 'Verificar y continuar', exact: true })
    .click()
  await expect(page).toHaveURL('/admin')
  await page.goto('/admin/configuracion')
  await expect(page.locator('#admin-content h1')).toBeVisible()
}

async function openSiteImages(page: Page) {
  const disclosure = page.locator('details').filter({
    has: page.locator('summary').filter({ hasText: 'Imágenes del sitio' }),
  })
  await disclosure.locator('summary').click()
  await expect(disclosure.locator('.admin-media-card')).toHaveCount(9)
  await expect(disclosure.locator('.admin-media-grid')).toHaveAttribute(
    'aria-busy',
    'false',
  )
}

async function openPlacement(page: Page, name: string) {
  await page
    .locator('.admin-media-card')
    .filter({ has: page.getByRole('heading', { name, exact: true }) })
    .getByRole('button', { name: 'Cambiar imagen', exact: true })
    .click()
  const editor = page.locator('#admin-site-media-placement')
  await expect(editor).toBeVisible()
  return editor
}

test('las imágenes generales se consultan al abrir Configuración y el panel no ofrece Biblioteca', async ({
  page,
  supabaseNetwork,
  siteImages,
}) => {
  await administrator(page, supabaseNetwork)
  expect(
    siteImages.requests.some((request) => request.name === 'admin_site_media_document'),
  ).toBe(false)
  await expect(
    page.getByRole('link', { name: 'Biblioteca multimedia', exact: true }),
  ).toHaveCount(0)
  await openSiteImages(page)
  expect(
    siteImages.requests.filter((request) => request.name === 'admin_site_media_document'),
  ).toHaveLength(1)
  await expect(page.getByRole('button', { name: /^Biblioteca/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Centralizar recursos/ })).toHaveCount(0)

  await page.goto('/admin/home')
  await expect(page.locator('#admin-content h1')).toHaveText('Home')
  await page
    .getByRole('button', { name: 'Para él, para ella y unisex', exact: true })
    .click()
  await expect(page.getByRole('button', { name: /^Biblioteca/ })).toHaveCount(0)
  await expect(page.getByLabel('Subir imagen de Para él', { exact: true })).toHaveCount(1)

  await page.goto('/admin/productos/nuevo')
  await expect(page.locator('#admin-content h1')).toBeVisible()
  await expect(page.getByRole('button', { name: /^Biblioteca/ })).toHaveCount(0)
  await expect(
    page.getByLabel('Subir varias fotos del producto', { exact: true }),
  ).toHaveCount(1)
  expect(
    siteImages.requests.some((request) => request.name === 'admin_media_library'),
  ).toBe(false)
})

test('el logotipo SVG valida su recibo, se publica y permite restaurar la imagen original', async ({
  page,
  supabaseNetwork,
  siteImages,
}) => {
  await administrator(page, supabaseNetwork)
  await openSiteImages(page)
  const editor = await openPlacement(page, 'Logotipo de la tienda')
  const upload = editor.getByLabel('Subir una imagen nueva', { exact: true })
  siteImages.wrongSvgReceipt = true
  await upload.setInputFiles('public/brand/logo-on-light.svg')
  await expect(editor.getByRole('alert')).toBeVisible()
  await expect(editor.locator('.admin-media-preview img')).toHaveAttribute(
    'src',
    new URL('/brand/logo-on-light.svg', page.url()).href,
  )
  siteImages.wrongSvgReceipt = false
  await upload.setInputFiles('public/brand/logo-on-light.svg')
  await expect(
    editor.getByText('Imagen subida. Guarda los cambios para publicarla.', {
      exact: true,
    }),
  ).toBeVisible()
  expect(siteImages.svgRequests).toBe(2)
  expect(siteImages.uploads).toBe(1)
  const asset = siteImages.items[0].asset!
  await editor
    .getByRole('button', { name: 'Guardar imagen de la tienda', exact: true })
    .click()
  await expect(editor).not.toBeVisible()
  expect(
    siteImages.placements.find((item) => item.slot === 'identity.logo')?.assetId,
  ).toBe(asset.id)
  await page.goto('/iniciar-sesion')
  const logo = page.locator('.brand-logo').first()
  await expect(logo).toHaveAttribute('src', new RegExp(asset.id))
  await expect
    .poll(() => logo.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0)
  const vectorWidth = await logo.evaluate(
    (image) => (image as HTMLImageElement).naturalWidth,
  )
  await expect(logo).toHaveAttribute('width', '774')
  await expect(logo).toHaveAttribute('height', '374')

  await page.goto('/admin/configuracion')
  await openSiteImages(page)
  await openPlacement(page, 'Logotipo de la tienda')
  await editor.getByRole('button', { name: 'Usar imagen original', exact: true }).click()
  await editor
    .getByRole('button', { name: 'Guardar imagen de la tienda', exact: true })
    .click()
  await expect(editor).not.toBeVisible()
  expect(
    siteImages.placements.find((item) => item.slot === 'identity.logo')?.assetId,
  ).toBeNull()
  await page.goto('/iniciar-sesion')
  await expect(page.locator('.brand-logo').first()).toHaveAttribute(
    'src',
    new URL('/brand/logo-on-light.svg', page.url()).href,
  )
  await expect
    .poll(() => page.locator('.brand-logo').first().evaluate(
      (image) => (image as HTMLImageElement).naturalWidth,
    ))
    .toBe(vectorWidth)
})

test('la conversión de una foto de acceso conserva la orientación EXIF y todos sus píxeles visibles', async ({
  page,
  supabaseNetwork,
  siteImages,
}, testInfo) => {
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00']
  const quadrants = await Promise.all(colors.map((background) =>
    sharp({ create: { width: 600, height: 400, channels: 3, background } })
      .png()
      .toBuffer(),
  ))
  const original = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: '#000000' },
  })
    .composite(quadrants.map((input, index) => ({
      input,
      left: (index % 2) * 600,
      top: Math.floor(index / 2) * 400,
    })))
    .withMetadata({ orientation: 6 })
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
    .toBuffer()
  expect(await sharp(original).metadata()).toMatchObject({
    width: 1200,
    height: 800,
    orientation: 6,
  })
  await administrator(page, supabaseNetwork)
  await openSiteImages(page)
  const editor = await openPlacement(page, 'Acceso a clientes · escritorio')
  await editor.getByLabel('Subir una imagen nueva', { exact: true }).setInputFiles({
    name: 'foto-movil-exif.jpg',
    mimeType: 'image/jpeg',
    buffer: original,
  })
  await expect(
    editor.getByText('Imagen subida. Guarda los cambios para publicarla.', {
      exact: true,
    }),
  ).toBeVisible()
  expect(siteImages.uploads).toBe(1)
  const asset = siteImages.items[0].asset
  if (!asset || !('variants' in asset))
    throw new Error('A prepared WebP manifest was expected')
  expect(asset).toMatchObject({ width: 800, height: 1200 })
  expect(asset.variants.map((variant) => [variant.width, variant.height])).toEqual([
    [480, 720],
    [800, 1200],
  ])
  const bytes = await page.evaluate(async (src) =>
    Array.from(new Uint8Array(await (await fetch(src)).arrayBuffer())),
  asset.src)
  const converted = Buffer.from(bytes)
  const metadata = await sharp(converted).metadata()
  expect(metadata).toMatchObject({ format: 'webp', width: 800, height: 1200 })
  expect(metadata.orientation).toBeUndefined()
  const decoded = await sharp(converted).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const sample = (x: number, y: number) => [...decoded.data.subarray(
    (y * decoded.info.width + x) * decoded.info.channels,
    (y * decoded.info.width + x) * decoded.info.channels + 3,
  )]
  const topLeft = sample(200, 300)
  const topRight = sample(600, 300)
  const bottomLeft = sample(200, 900)
  const bottomRight = sample(600, 900)
  // EXIF 6 is a clockwise quarter turn. Independent decoding verifies that
  // every quadrant remains visible after the upload conversion.
  expect(topLeft[2]).toBeGreaterThan(210)
  expect(topLeft[0]).toBeLessThan(35)
  expect(topLeft[1]).toBeLessThan(35)
  expect(topRight[0]).toBeGreaterThan(210)
  expect(topRight[1]).toBeLessThan(35)
  expect(topRight[2]).toBeLessThan(35)
  expect(bottomLeft[0]).toBeGreaterThan(210)
  expect(bottomLeft[1]).toBeGreaterThan(210)
  expect(bottomLeft[2]).toBeLessThan(35)
  expect(bottomRight[1]).toBeGreaterThan(210)
  expect(bottomRight[0]).toBeLessThan(35)
  expect(bottomRight[2]).toBeLessThan(35)
  await writeFile(testInfo.outputPath('oriented-converted.webp'), converted)
})

test('la imagen conserva el borrador cuando el archivo es pequeño, el servidor rechaza o aparece un conflicto', async ({
  page,
  supabaseNetwork,
  siteImages,
}) => {
  await administrator(page, supabaseNetwork)
  await openSiteImages(page)
  const editor = await openPlacement(page, 'Imagen de Nuestra esencia')
  await expect(editor).toContainText('Resolución mínima: 960 × 1200 px.')
  const preview = editor.locator('.admin-media-preview img')
  const original = await preview.getAttribute('src')
  const alt = editor.getByRole('textbox', { name: /^Texto alternativo/ })
  await alt.fill('Borrador de Nuestra esencia')
  const tiny = await sharp({
    create: { width: 400, height: 600, channels: 3, background: '#c7af91' },
  }).jpeg().toBuffer()
  const input = editor.getByLabel('Subir una imagen nueva', { exact: true })
  await input.setInputFiles({ name: 'pequena.jpg', mimeType: 'image/jpeg', buffer: tiny })
  await expect(editor.getByRole('alert')).toContainText('al menos 960 × 1200 px')
  await expect(preview).toHaveAttribute('src', original!)
  await expect(alt).toHaveValue('Borrador de Nuestra esencia')
  expect(siteImages.uploads).toBe(0)
  const adequate = await sharp({
    create: { width: 1200, height: 1500, channels: 3, background: '#6b8164' },
  }).jpeg().toBuffer()
  await input.setInputFiles({ name: 'nitida.jpg', mimeType: 'image/jpeg', buffer: adequate })
  await expect(
    editor.getByText('Imagen subida. Guarda los cambios para publicarla.', {
      exact: true,
    }),
  ).toBeVisible()
  const selected = siteImages.items[0]
  await expect(preview).toHaveAttribute('src', new RegExp(selected.id))
  expect(siteImages.requests.some((request) => request.name === 'admin_save_site_media')).toBe(false)
  const save = editor.getByRole('button', { name: 'Guardar imagen de la tienda', exact: true })
  siteImages.siteValidationError = true
  await save.click()
  await expect(editor.getByRole('alert')).toContainText('formato o la resolución mínima')
  await expect(editor).not.toContainText('PRIVATE_PROVIDER_MESSAGE')
  await expect(preview).toHaveAttribute('src', new RegExp(selected.id))
  await expect(alt).toHaveValue('Borrador de Nuestra esencia')
  expect(siteImages.placements.find((item) => item.slot === 'about.story')?.assetId).toBeNull()

  siteImages.siteValidationError = false
  const placement = siteImages.placements.find((item) => item.slot === 'about.story')!
  placement.version++
  await save.click()
  await expect(editor.getByRole('alert')).toContainText('otra sesión')
  await expect(preview).toHaveAttribute('src', new RegExp(selected.id))
  await expect(alt).toHaveValue('Borrador de Nuestra esencia')
  expect(placement.assetId).toBeNull()

  await page.keyboard.press('Escape')
  const confirm = page.getByRole('alertdialog', { name: '¿Cerrar sin guardar?' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Seguir editando', exact: true }).click()
  await expect(editor).toBeVisible()
  await expect(alt).toHaveValue('Borrador de Nuestra esencia')
  await expect(preview).toHaveAttribute('src', new RegExp(selected.id))
})

for (const width of [360, 390, 768, 1280, 1920]) {
  test(`las imágenes de Configuración y su carga directa conservan controles a ${width}px`, async ({
    page,
    supabaseNetwork,
    siteImages,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await administrator(page, supabaseNetwork)
    await openSiteImages(page)
    await expect(page.getByRole('button', { name: /^Biblioteca/ })).toHaveCount(0)
    const editor = await openPlacement(page, 'Imagen de Nuestra esencia')
    await expect(editor.getByLabel('Subir una imagen nueva', { exact: true })).toHaveCount(1)
    await expect(editor.getByRole('button', { name: 'Guardar imagen de la tienda', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    expect(await editor.evaluate((dialog) => dialog.closest('form') === null)).toBe(true)
    await expect(page.locator('form form')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(editor).not.toBeVisible()
    expect(siteImages.requests.some((request) => request.name === 'admin_media_library')).toBe(false)
  })
}
