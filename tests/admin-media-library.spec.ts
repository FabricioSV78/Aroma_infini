import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { type Page } from '@playwright/test'
import { DEFAULT_OLFACTORY_FAMILIES } from '../src/domain/olfactory-family'
import type { ManagedMediaAsset } from '../src/domain/media'
import type { MediaLibraryItem } from '../src/services/media-library-service'
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
interface LibraryFixture {
  items: MediaLibraryItem[]
  requests: { name: string; body: Record<string, unknown> }[]
  uploads: number
  conflict: boolean
  placements: SiteMediaItem[]
  wrongSvgReceipt: boolean
  svgRequests: number
  holdAliases: Promise<void> | null
  siteValidationError: boolean
}
const test = authTest.extend<{ library: LibraryFixture }>({
  library: async ({ context, supabaseNetwork }, runFixture) => {
    void supabaseNetwork
    const bytes = await sharp({
      create: { width: 800, height: 1000, channels: 3, background: '#c4b29c' },
    })
      .webp()
      .toBuffer()
    const hash = createHash('sha256').update(bytes).digest('hex')
    const objects = new Map<string, Buffer>()
    const state: LibraryFixture = {
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
      holdAliases: null,
      siteValidationError: false,
    }
    for (let index = 0; index < 21; index++) {
      const id = `76000000-0000-4000-8000-${index.toString().padStart(12, '0')}`
      const src = `/media/public/dynamic/${id}/${hash}/800.webp`
      const asset: ManagedMediaAsset = {
        id,
        src,
        width: 800,
        height: 1000,
        variants: [{ src, width: 800, height: 1000 }],
      }
      objects.set(src, bytes)
      state.items.push({
        id,
        name:
          index === 0
            ? 'Botella protegida'
            : `Fotografía ${index.toString().padStart(2, '0')}`,
        alt: `Descripción ${index}`,
        section: 'home',
        version: 1,
        purpose: 'category',
        state: index === 0 ? 'used' : 'unused',
        createdAt: '2026-11-10T12:00:00Z',
        retireAfter: index === 0 ? null : '2026-11-12T12:00:00Z',
        useCount: index === 0 ? 1 : 0,
        asset,
      })
    }
    await context.route(`${origin}/rest/v1/rpc/*`, async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)!
      if (
        !name.startsWith('admin_') &&
        !name.startsWith('catalog_') &&
        ![
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
      if (name === 'public_media_aliases') return reply({ items: [] })
      if (name === 'admin_media_aliases') {
        await state.holdAliases
        return reply({ items: [] }).catch(() => {})
      }
      if (name === 'admin_save_site_media') {
        if (state.siteValidationError)
          return reply(
            { code: '22023', message: 'PRIVATE_PROVIDER_MESSAGE' },
            400,
          )
        const item = state.placements.find((item) => item.slot === body.p_slot)!
        if (!item || body.p_expected_version !== item.version)
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
      if (name === 'admin_media_library') {
        const filtered = state.items.filter(
          (item) =>
            (!body.p_query ||
              `${item.name} ${item.alt}`
                .toLowerCase()
                .includes(String(body.p_query).toLowerCase())) &&
            (!body.p_section || item.section === body.p_section) &&
            (body.p_state === 'all' || body.p_state === 'pending'
              ? body.p_state === 'all' || Boolean(item.retireAfter)
              : body.p_state === item.state),
        )
        const page = Number(body.p_page),
          size = Number(body.p_page_size)
        return reply({
          items: filtered.slice((page - 1) * size, page * size),
          total: filtered.length,
          page,
          pageSize: size,
        })
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
      if (name === 'admin_media_metadata' || name === 'admin_media_retire') {
        const item = state.items.find((item) => item.id === body.p_asset_id)!
        if (state.conflict || body.p_expected_version !== item.version)
          return reply(
            { code: 'PT409', message: 'PRIVATE_PROVIDER_MESSAGE' },
            409,
          )
        item.version++
        if (name === 'admin_media_metadata') {
          item.name = String(body.p_name)
          item.alt = String(body.p_alt)
          item.section = body.p_section as MediaLibraryItem['section']
        } else item.retireAfter = '2026-11-12T12:00:00Z'
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
        purpose: String(form.get('purpose')) as MediaLibraryItem['purpose'],
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
      NonNullable<MediaLibraryItem['asset']>
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
  await page
    .getByLabel('Código de verificación', { exact: true })
    .fill('123456')
  await page
    .getByRole('button', { name: 'Verificar y continuar', exact: true })
    .click()
  await expect(page).toHaveURL('/admin')
  await page.goto('/admin/biblioteca')
  await expect(
    page.getByRole('heading', { name: 'Biblioteca multimedia', level: 1 }),
  ).toBeVisible()
}

test('La biblioteca busca, pagina y muestra pendientes sin descargar todos los registros', async ({
  page,
  supabaseNetwork,
  library,
}) => {
  await administrator(page, supabaseNetwork)
  await expect(page.locator('.admin-media-card')).toHaveCount(20)
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click()
  await expect(page.locator('.admin-media-card')).toHaveCount(1)
  expect(
    library.requests
      .filter((call) => call.name === 'admin_media_library')
      .at(-1)?.body,
  ).toMatchObject({ p_page: 2, p_page_size: 20 })
  await page
    .getByLabel('Buscar archivo', { exact: true })
    .fill('Botella protegida')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await expect(page.locator('.admin-media-card')).toHaveCount(1)
  await page
    .getByRole('combobox', { name: 'Estado', exact: true })
    .selectOption('pending')
  await expect(
    page.getByText('No hay archivos con estos filtros.'),
  ).toBeVisible()
  expect(library.requests.at(-1)?.body.p_state).toBe('pending')
})

test('La vista previa conserva los campos ante un conflicto y protege archivos en uso', async ({
  page,
  supabaseNetwork,
  library,
}) => {
  await administrator(page, supabaseNetwork)
  await page
    .getByRole('button', { name: 'Ver archivo Botella protegida', exact: true })
    .click()
  const dialog = page.locator('#admin-media-detail')
  await expect(dialog.locator('.admin-media-preview img')).toHaveAttribute(
    'alt',
    'Descripción 0',
  )
  await expect(
    dialog.getByRole('button', { name: 'Programar eliminación', exact: true }),
  ).toBeDisabled()
  await expect(
    dialog.getByText('Categoría Para él', { exact: true }),
  ).toBeVisible()
  await dialog
    .getByLabel('Nombre del archivo', { exact: true })
    .fill('Nuevo nombre conservado')
  await dialog
    .getByRole('textbox', { name: /^Texto alternativo/ })
    .fill('Descripción accesible conservada')
  library.conflict = true
  await dialog
    .getByRole('button', { name: 'Guardar datos', exact: true })
    .click()
  await expect(dialog.getByRole('alert')).toContainText(
    'Tus campos se conservan',
  )
  await expect(
    dialog.getByLabel('Nombre del archivo', { exact: true }),
  ).toHaveValue('Nuevo nombre conservado')
  await expect(dialog).not.toContainText('PRIVATE_PROVIDER_MESSAGE')
  library.conflict = false
  await dialog
    .getByRole('button', { name: 'Guardar datos', exact: true })
    .click()
  await expect(
    dialog.getByText('Datos del archivo guardados.', { exact: true }),
  ).toBeVisible()
  expect(library.items[0].alt).toBe('Descripción accesible conservada')
})

test('Una imagen se optimiza una vez y puede reutilizarse desde el Home en móvil', async ({
  page,
  supabaseNetwork,
  library,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await administrator(page, supabaseNetwork)
  await page.getByRole('button', { name: 'Subir archivo', exact: true }).click()
  const dialog = page.locator('#admin-media-upload')
  await dialog
    .getByRole('combobox', { name: 'Uso previsto', exact: true })
    .selectOption('category')
  const buffer = await sharp({
    create: { width: 1200, height: 1500, channels: 3, background: '#8d6546' },
  })
    .jpeg()
    .toBuffer()
  await dialog.getByLabel('Archivo', { exact: true }).setInputFiles({
    name: 'categoria-original.jpg',
    mimeType: 'image/jpeg',
    buffer,
  })
  await dialog
    .getByLabel('Nombre del archivo', { exact: true })
    .fill('Nueva categoría reutilizable')
  await dialog
    .getByRole('textbox', { name: /^Texto alternativo/ })
    .fill('Frasco sobre una mesa clara')
  await dialog
    .getByRole('combobox', { name: 'Sección', exact: true })
    .selectOption('home')
  await dialog
    .getByRole('button', { name: 'Subir archivo', exact: true })
    .click()
  await expect(dialog).not.toBeVisible()
  expect(library.uploads).toBe(1)
  expect(
    library.items[0].asset && 'variants' in library.items[0].asset
      ? library.items[0].asset.variants.map((item) => item.width)
      : [],
  ).toEqual([480, 960, 1200])
  await page.goto('/admin/home')
  await page
    .getByRole('button', { name: 'Para él, para ella y unisex', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Biblioteca: Para él', exact: true })
    .click()
  const picker = page.locator('.admin-media-picker-dialog[open]')
  await picker
    .getByLabel('Buscar archivo', { exact: true })
    .fill('Nueva categoría reutilizable')
  await picker.getByRole('button', { name: 'Buscar', exact: true }).click()
  await picker
    .getByRole('button', {
      name: 'Usar archivo Nueva categoría reutilizable',
      exact: true,
    })
    .click()
  await expect(picker).not.toBeVisible()
  expect(library.uploads).toBe(1)
  await page
    .getByRole('button', { name: 'Abrir vista previa', exact: true })
    .click()
  await expect(
    page.locator('.admin-home-category--portrait img').first(),
  ).toHaveAttribute('src', new RegExp(library.items[0].id))
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
  await page.keyboard.press('Escape')
})

test('Un SVG verifica su recibo, se reutiliza como identidad y permite restaurar el original', async ({
  page,
  supabaseNetwork,
  library,
}) => {
  await administrator(page, supabaseNetwork)
  await page
    .getByRole('button', { name: 'Ubicaciones de la tienda', exact: true })
    .click()
  const identity = page.locator('.admin-media-card').filter({
    has: page.getByRole('heading', {
      name: 'Logotipo de la tienda',
      exact: true,
    }),
  })
  await identity
    .getByRole('button', { name: 'Cambiar imagen', exact: true })
    .click()
  const editor = page.locator('#admin-site-media-placement')
  const upload = editor.getByLabel('Subir una imagen nueva', { exact: true })
  library.wrongSvgReceipt = true
  await upload.setInputFiles('public/brand/logo-on-light.svg')
  await expect(editor.getByRole('alert')).toBeVisible()
  await expect(editor.locator('.admin-media-preview img')).toHaveAttribute(
    'src',
    '/brand/logo-on-light.svg',
  )
  library.wrongSvgReceipt = false
  await upload.setInputFiles('public/brand/logo-on-light.svg')
  await expect(
    editor.getByText('Imagen subida. Guarda esta ubicación para publicarla.', {
      exact: true,
    }),
  ).toBeVisible()
  expect(library.svgRequests).toBe(2)
  expect(library.uploads).toBe(1)
  const asset = library.items[0].asset!
  await editor
    .getByRole('button', { name: 'Guardar imagen de la tienda', exact: true })
    .click()
  await expect(editor).not.toBeVisible()
  expect(
    library.placements.find((item) => item.slot === 'identity.logo')?.assetId,
  ).toBe(asset.id)
  await page.goto('/iniciar-sesion')
  const logo = page.locator('.brand-logo').first()
  await expect(logo).toHaveAttribute('src', new RegExp(asset.id))
  await expect
    .poll(() =>
      logo.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0)
  const vectorNaturalWidth = await logo.evaluate(
    (image) => (image as HTMLImageElement).naturalWidth,
  )
  await expect(logo).toHaveAttribute('width', '774')
  await expect(logo).toHaveAttribute('height', '374')
  await page.goto('/admin/biblioteca')
  await page
    .getByRole('button', { name: 'Ubicaciones de la tienda', exact: true })
    .click()
  await identity
    .getByRole('button', { name: 'Cambiar imagen', exact: true })
    .click()
  await editor
    .getByRole('button', { name: 'Usar recurso original', exact: true })
    .click()
  await editor
    .getByRole('button', { name: 'Guardar imagen de la tienda', exact: true })
    .click()
  await expect(editor).not.toBeVisible()
  expect(
    library.placements.find((item) => item.slot === 'identity.logo')?.assetId,
  ).toBeNull()
  await page.goto('/iniciar-sesion')
  await expect(page.locator('.brand-logo').first()).toHaveAttribute(
    'src',
    '/brand/logo-on-light.svg',
  )
  await expect
    .poll(() =>
      page
        .locator('.brand-logo')
        .first()
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBe(vectorNaturalWidth)
})

test('La centralización se puede pausar y se detiene al salir de la biblioteca', async ({
  page,
  supabaseNetwork,
  library,
}) => {
  await administrator(page, supabaseNetwork)
  let release = () => {}
  let aborted = 0
  page.on('requestfailed', (request) => {
    if (request.url().endsWith('/rest/v1/rpc/admin_media_aliases')) aborted++
  })
  const hold = () => {
    library.holdAliases = new Promise<void>((resolve) => {
      release = resolve
    })
  }
  try {
    hold()
    await page
      .getByRole('button', {
        name: 'Centralizar recursos actuales',
        exact: true,
      })
      .click()
    await expect
      .poll(
        () =>
          library.requests.filter((call) => call.name === 'admin_media_aliases')
            .length,
      )
      .toBe(1)
    await page
      .getByRole('button', { name: 'Pausar centralización', exact: true })
      .click()
    await expect(
      page.getByText('Centralización pausada.', { exact: false }),
    ).toBeVisible()
    await expect.poll(() => aborted).toBe(1)
    release()
    hold()
    await page
      .getByRole('button', {
        name: 'Centralizar recursos actuales',
        exact: true,
      })
      .click()
    await expect
      .poll(
        () =>
          library.requests.filter((call) => call.name === 'admin_media_aliases')
            .length,
      )
      .toBe(2)
    await page.getByRole('link', { name: 'Productos', exact: true }).click()
    await expect(page).toHaveURL('/admin/productos')
    await expect.poll(() => aborted).toBe(2)
    expect(library.uploads).toBe(0)
  } finally {
    release()
  }
})

for (const width of [360, 390, 768, 1280, 1920]) {
  test(`La biblioteca conserva su distribución y controles a ${width}px`, async ({
    page,
    supabaseNetwork,
    library,
  }) => {
    void library
    await page.setViewportSize({ width, height: 900 })
    await administrator(page, supabaseNetwork)
    const directory = 'artifacts/media-library-review'
    await mkdir(directory, { recursive: true })
    async function capture(state: string) {
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width)
      await page.screenshot({
        path: `${directory}/${width}-${state}.png`,
        animations: 'disabled',
      })
    }
    await expect(page.locator('.admin-media-card')).toHaveCount(20)
    await page.locator('.admin-media-card').first().scrollIntoViewIfNeeded()
    await capture('grid')
    await page
      .getByRole('button', {
        name: 'Ver archivo Botella protegida',
        exact: true,
      })
      .click()
    const detail = page.locator('#admin-media-detail')
    await expect(
      detail.getByRole('button', {
        name: 'Programar eliminación',
        exact: true,
      }),
    ).toBeDisabled()
    await capture('detail')
    await page.keyboard.press('Escape')
    await expect(detail).not.toBeVisible()
    await page
      .getByRole('combobox', { name: 'Estado', exact: true })
      .selectOption('pending')
    await expect(page.locator('.admin-media-card')).toHaveCount(20)
    await page.locator('.admin-media-card').first().scrollIntoViewIfNeeded()
    await capture('pending')
    await page
      .getByRole('button', { name: 'Ubicaciones de la tienda', exact: true })
      .click()
    await expect(
      page.locator('.admin-media-placements .admin-media-card'),
    ).toHaveCount(9)
    await page
      .locator('.admin-media-placements .admin-media-card')
      .first()
      .scrollIntoViewIfNeeded()
    await capture('placements')
  })
}

test('La imagen general conserva la orientación EXIF y sus píxeles visibles al convertirse a WebP', async ({
  page,
  supabaseNetwork,
  library,
}, testInfo) => {
  const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00']
  const quadrants = await Promise.all(
    colors.map((background) =>
      sharp({ create: { width: 600, height: 400, channels: 3, background } })
        .png()
        .toBuffer(),
    ),
  )
  const original = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: '#000000' },
  })
    .composite(
      quadrants.map((input, index) => ({
        input,
        left: (index % 2) * 600,
        top: Math.floor(index / 2) * 400,
      })),
    )
    .withMetadata({ orientation: 6 })
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
    .toBuffer()
  expect(await sharp(original).metadata()).toMatchObject({
    width: 1200,
    height: 800,
    orientation: 6,
  })
  await administrator(page, supabaseNetwork)
  await page.getByRole('button', { name: 'Subir archivo', exact: true }).click()
  const dialog = page.locator('#admin-media-upload')
  await dialog
    .getByRole('combobox', { name: 'Uso previsto', exact: true })
    .selectOption('site-image')
  await dialog.getByLabel('Archivo', { exact: true }).setInputFiles({
    name: 'foto-movil-exif.jpg',
    mimeType: 'image/jpeg',
    buffer: original,
  })
  await dialog
    .getByRole('textbox', { name: 'Nombre del archivo', exact: true })
    .fill('Foto con orientación de teléfono')
  await dialog
    .getByRole('button', { name: 'Subir archivo', exact: true })
    .click()
  await expect(dialog).not.toBeVisible()
  expect(library.uploads).toBe(1)
  const asset = library.items[0].asset
  expect(asset && 'variants' in asset).toBe(true)
  if (!asset || !('variants' in asset))
    throw new Error('A real prepared WebP manifest was expected')
  expect(asset.width).toBe(800)
  expect(asset.height).toBe(1200)
  expect(
    asset.variants.map((variant) => [variant.width, variant.height]),
  ).toEqual([
    [480, 720],
    [800, 1200],
  ])
  expect(asset.width * asset.height).toBe(1200 * 800)
  const bytes = await page.evaluate(
    async (src) =>
      Array.from(new Uint8Array(await (await fetch(src)).arrayBuffer())),
    asset.src,
  )
  const converted = Buffer.from(bytes)
  const metadata = await sharp(converted).metadata()
  expect(metadata).toMatchObject({ format: 'webp', width: 800, height: 1200 })
  expect(metadata.orientation).toBeUndefined()
  const decoded = await sharp(converted)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const sample = (x: number, y: number) => [
    ...decoded.data.subarray(
      (y * decoded.info.width + x) * decoded.info.channels,
      (y * decoded.info.width + x) * decoded.info.channels + 3,
    ),
  ]
  const topLeft = sample(200, 300),
    topRight = sample(600, 300),
    bottomLeft = sample(200, 900),
    bottomRight = sample(600, 900)
  // EXIF 6 is a clockwise quarter turn: blue/red above yellow/green. Decode
  // the uploaded WebP independently to prove both orientation and full-frame preservation.
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

test('Cada ubicación rechaza imágenes pequeñas y conserva la selección ante una validación del servidor', async ({
  page,
  supabaseNetwork,
  library,
}, testInfo) => {
  await administrator(page, supabaseNetwork)
  await page
    .getByRole('button', { name: 'Ubicaciones de la tienda', exact: true })
    .click()
  const story = page.locator('.admin-media-card').filter({
    has: page.getByRole('heading', {
      name: 'Imagen de Nuestra esencia',
      exact: true,
    }),
  })
  await story
    .getByRole('button', { name: 'Cambiar imagen', exact: true })
    .click()
  const editor = page.locator('#admin-site-media-placement')
  await expect(editor).toContainText('Resolución mínima: 960 × 1200 px.')
  const preview = editor.locator('.admin-media-preview img')
  const original = await preview.getAttribute('src')
  const alt = editor.getByRole('textbox', { name: /^Texto alternativo/ })
  await alt.fill('Borrador de descripción de Nuestra esencia')
  const tiny = await sharp({
    create: { width: 400, height: 600, channels: 3, background: '#c7af91' },
  })
    .jpeg()
    .toBuffer()
  const input = editor.getByLabel('Subir una imagen nueva', { exact: true })
  await input.setInputFiles({
    name: 'imagen-pequena.jpg',
    mimeType: 'image/jpeg',
    buffer: tiny,
  })
  await expect(editor.getByRole('alert')).toContainText(
    'al menos 960 × 1200 px',
  )
  await expect(preview).toHaveAttribute('src', original!)
  expect(library.uploads).toBe(0)
  expect(library.items).toHaveLength(21)
  expect(
    library.requests.some(
      (request) => request.name === 'admin_save_site_media',
    ),
  ).toBe(false)
  await editor
    .getByRole('button', {
      name: 'Biblioteca: Imagen de Nuestra esencia',
      exact: true,
    })
    .click()
  const picker = page.locator('.admin-media-picker-dialog[open]')
  await expect(picker).toContainText('Resolución mínima: 960 × 1200 px.')
  await expect(
    picker.getByRole('button', {
      name: 'Usar archivo Fotografía 01',
      exact: true,
    }),
  ).toBeDisabled()
  expect(
    await picker.evaluate((dialog) => dialog.parentElement === document.body),
  ).toBe(true)
  await expect(page.locator('form form')).toHaveCount(0)
  const pickerFont = await picker.evaluate(
    (dialog) => getComputedStyle(dialog).fontFamily,
  )
  expect(pickerFont).toBe(
    await editor.evaluate((dialog) => getComputedStyle(dialog).fontFamily),
  )
  expect(
    await picker
      .getByRole('button', { name: 'Buscar', exact: true })
      .evaluate((button) => getComputedStyle(button).backgroundColor),
  ).toBe('rgb(52, 58, 53)')
  await picker.screenshot({
    path: testInfo.outputPath('minimum-picker.png'),
    animations: 'disabled',
  })
  await page.keyboard.press('Escape')
  await expect(picker).not.toBeVisible()
  await expect(editor).toBeVisible()
  await expect(alt).toHaveValue('Borrador de descripción de Nuestra esencia')
  await expect(
    editor.getByRole('button', {
      name: 'Biblioteca: Imagen de Nuestra esencia',
      exact: true,
    }),
  ).toBeFocused()
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')
  const adequate = await sharp({
    create: { width: 1200, height: 1500, channels: 3, background: '#6b8164' },
  })
    .jpeg()
    .toBuffer()
  await input.setInputFiles({
    name: 'imagen-nitida.jpg',
    mimeType: 'image/jpeg',
    buffer: adequate,
  })
  await expect(
    editor.getByText('Imagen subida. Guarda esta ubicación para publicarla.', {
      exact: true,
    }),
  ).toBeVisible()
  const selected = library.items[0]
  expect(selected.asset).toMatchObject({ width: 1200, height: 1500 })
  await editor
    .getByRole('button', {
      name: 'Biblioteca: Imagen de Nuestra esencia',
      exact: true,
    })
    .click()
  await picker
    .getByLabel('Buscar archivo', { exact: true })
    .fill('imagen-nitida')
  await picker.getByRole('button', { name: 'Buscar', exact: true }).click()
  expect(
    library.requests.some(
      (request) => request.name === 'admin_save_site_media',
    ),
  ).toBe(false)
  await expect(
    picker.getByRole('button', {
      name: 'Usar archivo imagen-nitida',
      exact: true,
    }),
  ).toBeEnabled()
  await picker
    .getByRole('button', { name: 'Usar archivo imagen-nitida', exact: true })
    .click()
  await expect(preview).toHaveAttribute('src', new RegExp(selected.id))
  await alt.fill('Imagen nítida de la esencia de la tienda')
  library.siteValidationError = true
  await editor
    .getByRole('button', { name: 'Guardar imagen de la tienda', exact: true })
    .click()
  await expect(editor.getByRole('alert')).toContainText(
    'formato o la resolución mínima',
  )
  await expect(editor).not.toContainText('PRIVATE_PROVIDER_MESSAGE')
  await expect(preview).toHaveAttribute('src', new RegExp(selected.id))
  await expect(alt).toHaveValue('Imagen nítida de la esencia de la tienda')
  library.siteValidationError = false
  await editor
    .getByRole('button', { name: 'Guardar imagen de la tienda', exact: true })
    .click()
  await expect(editor).not.toBeVisible()
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    'hidden',
  )
  expect(
    library.placements.find((item) => item.slot === 'about.story'),
  ).toMatchObject({
    assetId: selected.id,
    alt: 'Imagen nítida de la esencia de la tienda',
  })
  expect(selected.useCount).toBe(1)
})
