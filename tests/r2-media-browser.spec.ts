import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import sharp from 'sharp'
import type { Page } from '@playwright/test'
import { publicHomeCatalogFixture } from './public-home-catalog-fixture'
import type { AdminProduct } from '../src/types/admin'
import type { ManagedMediaAsset } from '../src/domain/media'
import { DEFAULT_OLFACTORY_FAMILIES } from '../src/domain/olfactory-family'
import {
  expect,
  fixtureProject,
  signIn,
  test as authTest,
  type SupabaseAuthNetwork,
} from './supabase-auth-fixture'

const brandId = '80000000-0000-4000-8000-000000000001'
const productId = '80000000-0000-4000-8000-000000000002'
const variantId = '80000000-0000-4000-8000-000000000003'
const supabaseOrigin = `https://${fixtureProject}.supabase.co`
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
}

function draft(): AdminProduct {
  return {
    active: false,
    gender: 'unisex',
    popularity: 0,
    newest: 0,
    lowStockThreshold: 2,
    product: {
      id: productId,
      sku: '10000',
      productType: 'perfume',
      name: 'Perfume de prueba R2',
      slug: 'perfume-prueba-r2',
      brandId,
      image: '',
      family: 'Floral · suave',
      olfactoryFamilies: ['floral'],
      discount: null,
      variants: [
        { id: variantId, ml: 50, priceCents: 39000, stock: 10, active: true },
      ],
    },
    detail: {
      shortDescription: 'Una descripción para pruebas aisladas de imágenes.',
      description:
        'Contenido no comercial de una fixture sin conexión a cuentas reales.',
      gallery: [],
      olfactoryImage: null,
      notes: { top: ['Bergamota'], heart: ['Rosa'], base: ['Almizcle'] },
      intensity: 'Suave',
      intensityLevel: 1,
      occasion: 'Diario',
      season: 'Todo el año',
      recommendationIds: [],
    },
  }
}

interface UploadedOperation {
  operationId: string
  purpose: string
  widths: number[]
  asset: ManagedMediaAsset
}
interface BrowserMediaFixture {
  record: AdminProduct
  version: number
  assets: Map<string, ManagedMediaAsset>
  objects: Map<string, Buffer>
  uploads: UploadedOperation[]
  writes: Array<Record<string, unknown>>
  failAtUpload: number | null
  loseResponseAt: number | null
  wrongManifest: boolean
  writeConflict: boolean
  holdUpload: Promise<void> | null
}

const test = authTest.extend<{ mediaNetwork: BrowserMediaFixture }>({
  mediaNetwork: async ({ context, supabaseNetwork }, runFixture) => {
    void supabaseNetwork
    const state: BrowserMediaFixture = {
      record: draft(),
      version: 1,
      assets: new Map(),
      objects: new Map(),
      uploads: [],
      writes: [],
      failAtUpload: null,
      loseResponseAt: null,
      wrongManifest: false,
      writeConflict: false,
      holdUpload: null,
    }
    const operations = new Map<string, UploadedOperation>()
    await context.route(`${supabaseOrigin}/rest/v1/rpc/*`, async (route) => {
      const request = route.request()
      const name = new URL(request.url()).pathname.split('/').at(-1)
      if (!name?.startsWith('catalog_') && !name?.startsWith('admin_')) {
        await route.fallback()
        return
      }
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: cors })
        return
      }
      const body = request.postDataJSON() as Record<string, unknown>
      const brand = {
        id: brandId,
        name: 'Maison R2 Test',
        slug: 'maison-r2-test',
        active: true,
      }
      function document() {
        const referenced = new Set([
          ...state.record.detail.gallery.map(({ image }) => image),
          state.record.detail.olfactoryImage,
        ])
        return {
          ...state.record,
          mediaAssets: [...state.assets.values()].filter((asset) =>
            referenced.has(asset.src),
          ),
        }
      }
      if (name === 'catalog_home_context') {
        await route.fulfill({
          json: publicHomeCatalogFixture(
            {
              brands: [brand],
              features: { complementsEnabled: false },
              olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
              featuredBrandId: null,
            },
            state.record.active ? [document()] : [],
          ),
          headers: cors,
        })
      } else if (name === 'catalog_brand_previews') {
        await route.fulfill({
          json: {
            brands: [
              {
                ...brand,
                previewImage: state.record.active
                  ? state.record.product.image
                  : null,
              },
            ],
            mediaAssets: state.record.active
              ? [...state.assets.values()].filter(
                  (asset) => asset.src === state.record.product.image,
                )
              : [],
          },
          headers: cors,
        })
      } else if (name === 'catalog_product_context') {
        await route.fulfill({
          json: {
            record: state.record.active ? document() : null,
            recommendations: [],
            brands: [brand],
            features: { complementsEnabled: false },
            featuredBrandId: null,
            olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
          },
          headers: cors,
        })
      } else if (name === 'catalog_products_by_ids') {
        await route.fulfill({
          json: {
            items: state.record.active ? [document()] : [],
            total: state.record.active ? 1 : 0,
          },
          headers: cors,
        })
      } else if (name === 'admin_catalog_page') {
        await route.fulfill({
          json: {
            products: [document()],
            brands: [brand],
            productVersions: { [productId]: state.version },
            brandVersions: { [brandId]: 1 },
            features: { complementsEnabled: false },
            olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
            featuredBrandId: null,
            settingsVersion: 1,
            total: 1,
          },
          headers: cors,
        })
      } else if (name === 'admin_save_product') {
        state.writes.push(body)
        if (state.writeConflict || body.p_expected_version !== state.version) {
          await route.fulfill({
            status: 409,
            json: { code: 'PT409', message: 'Isolated stale version' },
            headers: cors,
          })
          return
        }
        const record = body.p_record as AdminProduct
        expect(JSON.stringify(record)).not.toMatch(/data:image|blob:|base64/)
        state.record = record
        state.record.product.discount ??= null
        state.record.detail.gallery = state.record.detail.gallery.filter(
          ({ image }) => image.trim(),
        )
        state.version++
        await route.fulfill({
          json: { record: document(), version: state.version },
          headers: cors,
        })
      } else if (name === 'catalog_products') {
        await route.fulfill({
          json: {
            items: state.record.active ? [document()] : [],
            total: state.record.active ? 1 : 0,
          },
          headers: cors,
        })
      } else if (name === 'catalog_brands') {
        await route.fulfill({ json: [brand], headers: cors })
      } else if (name === 'catalog_settings') {
        await route.fulfill({
          json: {
            features: { complementsEnabled: false },
            olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
            featuredBrandId: null,
          },
          headers: cors,
        })
      } else if (name === 'catalog_product') {
        await route.fulfill({
          json: state.record.active ? document() : null,
          headers: cors,
        })
      } else
        await route.fulfill({
          status: 404,
          json: { code: 'PGRST202' },
          headers: cors,
        })
    })
    await context.route('**/api/admin/media/upload', async (route) => {
      const request = route.request()
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: cors })
        return
      }
      expect(request.headers().authorization).toMatch(/^Bearer ey/)
      const raw = request.postDataBuffer()
      expect(raw).not.toBeNull()
      const multipart = await new Request('https://isolated.invalid/upload', {
        method: 'POST',
        headers: { 'content-type': request.headers()['content-type'] },
        body: new Uint8Array(raw!).buffer,
      }).formData()
      const operationId = String(multipart.get('operationId'))
      const purpose = String(multipart.get('purpose'))
      const files = multipart.getAll('files')
      expect(files.length).toBeGreaterThan(0)
      expect(files.length).toBeLessThanOrEqual(3)
      if (state.holdUpload) await state.holdUpload
      if (
        state.failAtUpload !== null &&
        state.uploads.length === state.failAtUpload
      ) {
        state.failAtUpload = null
        await route.fulfill({
          status: 503,
          json: { code: 'storage', message: 'Isolated temporary outage' },
          headers: cors,
        })
        return
      }
      let operation = operations.get(operationId)
      if (!operation) {
        const decoded = await Promise.all(
          files.map(async (file) => {
            if (typeof file === 'string')
              throw new Error('A real multipart image is required')
            expect(file.type).toBe('image/webp')
            const bytes = Buffer.from(await file.arrayBuffer())
            const image = await sharp(bytes)
              .raw()
              .toBuffer({ resolveWithObject: true })
            return { bytes, width: image.info.width, height: image.info.height }
          }),
        )
        decoded.sort((a, b) => a.width - b.width)
        const master = decoded.at(-1)!
        const hash = createHash('sha256').update(master.bytes).digest('hex')
        const id = randomUUID()
        const variants = decoded.map((image) => {
          const src = `/media/public/dynamic/${id}/${hash}/${image.width}.webp`
          state.objects.set(src, image.bytes)
          return { src, width: image.width, height: image.height }
        })
        const asset = {
          id,
          src: variants.at(-1)!.src,
          width: master.width,
          height: master.height,
          variants,
        }
        operation = {
          operationId,
          purpose,
          widths: decoded.map((image) => image.width),
          asset,
        }
        state.assets.set(id, asset)
        operations.set(operationId, operation)
        state.uploads.push(operation)
      }
      if (
        state.loseResponseAt !== null &&
        state.uploads.length - 1 === state.loseResponseAt
      ) {
        state.loseResponseAt = null
        await route.abort('connectionfailed')
        return
      }
      await route.fulfill({
        json: {
          asset: state.wrongManifest
            ? { ...operation.asset, src: '/images/not-an-upload.webp' }
            : operation.asset,
        },
        headers: cors,
      })
    })
    await context.route('**/media/public/dynamic/**', async (route) => {
      const object = state.objects.get(new URL(route.request().url()).pathname)
      await route.fulfill(
        object
          ? {
              body: object,
              contentType: 'image/webp',
              headers: {
                'Cache-Control': 'public, max-age=31536000, immutable',
              },
            }
          : { status: 404, body: 'missing' },
      )
    })
    await runFixture(state)
  },
})

async function signInAdministrator(page: Page, network: SupabaseAuthNetwork) {
  network.adminMembership = true
  await signIn(page, 'admin')
  await page
    .getByLabel('Código de verificación', { exact: true })
    .fill('123456')
  await page
    .getByRole('button', { name: 'Verificar y continuar', exact: true })
    .click()
  await expect(page).toHaveURL('/admin')
}

async function photographs(count: number) {
  return Promise.all(
    Array.from({ length: count }, async (_, index) => ({
      name: `photo-${index + 1}.webp`,
      mimeType: 'image/webp',
      buffer: await sharp({
        create: {
          width: 1200,
          height: 1500,
          channels: 3,
          background: {
            r: 100 + index * 15,
            g: 130 + index * 9,
            b: 150 - index * 7,
          },
        },
      })
        .webp({ quality: 90 })
        .toBuffer(),
    })),
  )
}

async function openPhotos(page: Page, network: SupabaseAuthNetwork) {
  await signInAdministrator(page, network)
  await page.goto(`/admin/productos/${productId}/fotos`)
  await expect(
    page.getByLabel('Subir varias fotos del producto'),
  ).toBeAttached()
}

test('five photos upload together, persist, publish and remain readable after a new browser document', async ({
  page,
  supabaseNetwork,
  mediaNetwork,
}) => {
  await openPhotos(page, supabaseNetwork)
  await page
    .getByLabel('Subir varias fotos del producto')
    .setInputFiles(await photographs(5))
  await expect(page.locator('.admin-product-photo-slot img')).toHaveCount(5)
  expect(mediaNetwork.uploads).toHaveLength(0)
  await page.getByRole('button', { name: 'Guardar fotos', exact: true }).click()
  await expect(page).toHaveURL('/admin/productos')
  expect(mediaNetwork.uploads).toHaveLength(5)
  expect(
    mediaNetwork.uploads.filter(
      (upload) => upload.purpose === 'product-olfactory',
    ),
  ).toHaveLength(1)
  expect(mediaNetwork.record.detail.gallery).toHaveLength(4)
  expect(mediaNetwork.record.detail.olfactoryImage).not.toBe(
    mediaNetwork.record.product.image,
  )
  await page.reload()
  await page.goto(`/admin/productos/${productId}`)
  await page.getByLabel('Producto activo en tienda').check()
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect(page).toHaveURL(/\/admin\/productos/)
  await page.goto('/producto/perfume-prueba-r2')
  await expect(
    page.getByRole('heading', { name: 'Perfume de prueba R2', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.product-thumbnails button')).toHaveCount(4)
  await page.reload()
  await expect
    .poll(() =>
      page
        .locator('img[src*="/media/public/dynamic/"]')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true)
})

test('a failed upload keeps the five-photo draft and retries without duplicate assets', async ({
  page,
  supabaseNetwork,
  mediaNetwork,
}) => {
  await openPhotos(page, supabaseNetwork)
  await page
    .getByLabel('Subir varias fotos del producto')
    .setInputFiles(await photographs(5))
  await expect(page.locator('.admin-product-photo-slot img')).toHaveCount(5)
  mediaNetwork.failAtUpload = 2
  await page.getByRole('button', { name: 'Guardar fotos', exact: true }).click()
  const error = page.getByRole('alertdialog')
  await expect(error).toBeVisible()
  expect(mediaNetwork.writes).toHaveLength(0)
  expect(mediaNetwork.uploads).toHaveLength(2)
  await error.getByRole('button', { name: /Volver a editar|Cerrar/ }).click()
  await expect(page.locator('.admin-product-photo-slot img')).toHaveCount(5)
  await page.getByRole('button', { name: 'Guardar fotos', exact: true }).click()
  await expect(page).toHaveURL('/admin/productos')
  expect(mediaNetwork.uploads).toHaveLength(5)
  expect(mediaNetwork.assets.size).toBe(5)
})

test('a complement keeps four commercial photographs without requesting an olfactory upload', async ({
  page,
  supabaseNetwork,
  mediaNetwork,
}) => {
  mediaNetwork.record = {
    ...mediaNetwork.record,
    gender: null,
    product: {
      ...mediaNetwork.record.product,
      productType: 'complemento',
      family: '',
      olfactoryFamilies: [],
      variants: [
        {
          id: variantId,
          ml: null,
          label: 'Unidad',
          priceCents: 2500,
          stock: 10,
          active: true,
        },
      ],
    },
    detail: {
      ...mediaNetwork.record.detail,
      notes: { top: [], heart: [], base: [] },
      intensity: null,
      intensityLevel: null,
      occasion: '',
      season: '',
    },
  }
  await openPhotos(page, supabaseNetwork)
  await page
    .getByLabel('Subir varias fotos del producto')
    .setInputFiles(await photographs(4))
  await expect(page.locator('.admin-product-photo-slot img')).toHaveCount(4)
  await page.getByRole('button', { name: 'Guardar fotos', exact: true }).click()
  await expect(page).toHaveURL('/admin/productos')
  expect(mediaNetwork.uploads).toHaveLength(4)
  expect(
    mediaNetwork.uploads.every(
      (upload) => upload.purpose === 'product-gallery',
    ),
  ).toBe(true)
  expect(mediaNetwork.record.detail.olfactoryImage).toBeNull()
})

test('reordering, replacing and removing photos updates only the saved associations', async ({
  page,
  supabaseNetwork,
  mediaNetwork,
}) => {
  await openPhotos(page, supabaseNetwork)
  await page
    .getByLabel('Subir varias fotos del producto')
    .setInputFiles(await photographs(5))
  await expect(page.locator('.admin-product-photo-slot img')).toHaveCount(5)
  await page.getByRole('button', { name: 'Guardar fotos', exact: true }).click()
  await expect(page).toHaveURL('/admin/productos')
  const firstGallery = mediaNetwork.record.detail.gallery.map(
    ({ image }) => image,
  )
  const olfactory = mediaNetwork.record.detail.olfactoryImage
  const storedObjectCount = mediaNetwork.objects.size
  await page.goto(`/admin/productos/${productId}/fotos`)
  await page.getByLabel('Mover foto 2 antes', { exact: true }).click()
  await page
    .locator('.admin-product-photo-slot')
    .nth(2)
    .getByRole('button', { name: 'Quitar', exact: true })
    .click()
  const replacement = await sharp({
    create: {
      width: 1200,
      height: 1500,
      channels: 3,
      background: { r: 230, g: 205, b: 190 },
    },
  })
    .webp({ quality: 90 })
    .toBuffer()
  await page
    .getByLabel('Reemplazar foto principal del producto', { exact: true })
    .setInputFiles({
      name: 'replacement.webp',
      mimeType: 'image/webp',
      buffer: replacement,
    })
  await expect(page.locator('.admin-product-photo-slot img')).toHaveCount(4)
  await page.getByRole('button', { name: 'Guardar fotos', exact: true }).click()
  await expect(page).toHaveURL('/admin/productos')
  expect(mediaNetwork.uploads).toHaveLength(6)
  expect(mediaNetwork.record.detail.gallery).toHaveLength(3)
  expect(mediaNetwork.record.detail.gallery[0].image).not.toBe(firstGallery[0])
  expect(mediaNetwork.record.detail.gallery[1].image).toBe(firstGallery[0])
  expect(mediaNetwork.record.detail.gallery[2].image).toBe(firstGallery[3])
  expect(mediaNetwork.record.detail.olfactoryImage).toBe(olfactory)
  // Removing an association does not perform an immediate permanent delete.
  expect(mediaNetwork.objects.size).toBeGreaterThan(storedObjectCount)
  await page.reload()
  await page.goto(`/admin/productos/${productId}/fotos`)
  await expect(page.locator('.admin-product-photo-slot img')).toHaveCount(4)
})

test('a malformed upload response cannot publish arbitrary URLs or clear the photo draft', async ({
  page,
  supabaseNetwork,
  mediaNetwork,
}) => {
  await openPhotos(page, supabaseNetwork)
  await page
    .getByLabel('Subir varias fotos del producto')
    .setInputFiles(await photographs(1))
  await expect(page.locator('.admin-product-photo-slot img')).toHaveCount(1)
  mediaNetwork.wrongManifest = true
  await page.getByRole('button', { name: 'Guardar fotos', exact: true }).click()
  const error = page.getByRole('alertdialog')
  await expect(error).toBeVisible()
  expect(mediaNetwork.writes).toHaveLength(0)
  expect(mediaNetwork.record.detail.gallery).toHaveLength(0)
  await error.getByRole('button', { name: /Volver a editar|Cerrar/ }).click()
  await expect(page.locator('.admin-product-photo-slot img')).toHaveCount(1)
})

test('a product-version conflict retains the image draft without overwriting another administrator', async ({
  page,
  supabaseNetwork,
  mediaNetwork,
}) => {
  await openPhotos(page, supabaseNetwork)
  await page
    .getByLabel('Subir varias fotos del producto')
    .setInputFiles(await photographs(1))
  await expect(page.locator('.admin-product-photo-slot img')).toHaveCount(1)
  mediaNetwork.version = 2
  await page.getByRole('button', { name: 'Guardar fotos', exact: true }).click()
  const error = page.getByRole('alertdialog')
  await expect(error).toContainText('Otra persona modificó este registro')
  expect(mediaNetwork.writes[0].p_expected_version).toBe(1)
  expect(mediaNetwork.record.detail.gallery).toHaveLength(0)
  await error.getByRole('button', { name: /Volver a editar|Cerrar/ }).click()
  await expect(page.locator('.admin-product-photo-slot img')).toHaveCount(1)
})

test('a lost upload response retries the same operation instead of duplicating the stored object', async ({
  page,
  supabaseNetwork,
  mediaNetwork,
}) => {
  await openPhotos(page, supabaseNetwork)
  await page
    .getByLabel('Subir varias fotos del producto')
    .setInputFiles(await photographs(1))
  await expect(page.locator('.admin-product-photo-slot img')).toHaveCount(1)
  mediaNetwork.loseResponseAt = 0
  await page.getByRole('button', { name: 'Guardar fotos', exact: true }).click()
  const error = page.getByRole('alertdialog')
  await expect(error).toBeVisible()
  expect(mediaNetwork.uploads).toHaveLength(1)
  expect(mediaNetwork.writes).toHaveLength(0)
  await error.getByRole('button', { name: /Volver a editar|Cerrar/ }).click()
  await page.getByRole('button', { name: 'Guardar fotos', exact: true }).click()
  await expect(page).toHaveURL('/admin/productos')
  expect(mediaNetwork.uploads).toHaveLength(1)
  expect(mediaNetwork.assets.size).toBe(1)
  expect(mediaNetwork.record.detail.gallery).toHaveLength(1)
})

test('QA-AROMA: SKU search opens five named positions and image previews without uploading the draft', async ({
  page,
  supabaseNetwork,
  mediaNetwork,
}) => {
  mediaNetwork.record.product.name = 'QA-AROMA Cinco fotografías'
  mediaNetwork.record.product.variants[0].sku = 'QA-AROMA-MEDIA-1000'
  await signInAdministrator(page, supabaseNetwork)
  await page.goto('/admin/productos')
  const search = page.getByLabel('Buscar producto, marca o SKU', {
    exact: true,
  })
  await search.fill('QA-AROMA-NO-EXISTE')
  await page
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click()
  await expect(page.locator('.admin-table--products tbody tr')).toHaveCount(0)
  await search.fill('QA-AROMA-MEDIA-1000')
  await page
    .getByRole('button', { name: 'Aplicar filtros', exact: true })
    .click()
  await expect(page.locator('.admin-table--products tbody tr')).toHaveCount(1)
  await page
    .getByRole('link', {
      name: 'Gestionar fotos de QA-AROMA Cinco fotografías',
      exact: true,
    })
    .click()
  await expect(page).toHaveURL(
    new RegExp(`/admin/productos/${productId}/fotos$`),
  )
  await expect(
    page.locator('.admin-product-photo-slot-content > strong'),
  ).toHaveText([
    'Imagen principal',
    'Imagen secundaria 1',
    'Imagen secundaria 2',
    'Imagen secundaria 3',
    'Imagen de familia olfativa',
  ])
  await page
    .getByLabel('Subir varias fotos del producto')
    .setInputFiles(await photographs(5))
  await expect(page.locator('.admin-product-photo-slot img')).toHaveCount(5)
  expect(mediaNetwork.uploads).toHaveLength(0)
  for (const [position, title] of [
    [0, 'Imagen principal'],
    [4, 'Imagen de familia olfativa'],
  ] as const) {
    await page
      .locator('.admin-product-photo-slot')
      .nth(position)
      .getByRole('button', { name: 'Ver foto', exact: true })
      .click()
    const dialog = page.getByRole('dialog', { name: title, exact: true })
    await expect(dialog.locator('img')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
  }
  await page.getByRole('button', { name: 'Guardar fotos', exact: true }).click()
  await expect(page).toHaveURL((url) => url.pathname === '/admin/productos')
  expect(mediaNetwork.record.product.variants[0].sku).toBe(
    'QA-AROMA-MEDIA-1000',
  )
  expect(mediaNetwork.record.detail.gallery).toHaveLength(4)
  expect(mediaNetwork.record.detail.olfactoryImage).toBeTruthy()
})

test('QA-AROMA: unsupported, corrupt and oversized images reject the whole selection before remote writes', async ({
  page,
  supabaseNetwork,
  mediaNetwork,
}) => {
  await openPhotos(page, supabaseNetwork)
  const valid = (await photographs(1))[0]
  const invalid = [
    {
      name: 'QA-AROMA-vector.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    },
    {
      name: 'QA-AROMA-corrupt.webp',
      mimeType: 'image/webp',
      buffer: Buffer.from('QA-AROMA invalid image payload'),
    },
    {
      name: 'QA-AROMA-too-large.webp',
      mimeType: 'image/webp',
      buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
    },
  ]
  for (const file of invalid) {
    await page
      .getByLabel('Subir varias fotos del producto')
      .setInputFiles([valid, file])
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText(file.name)
    await expect(dialog).toContainText('No se añadió ninguna foto')
    expect(mediaNetwork.uploads).toHaveLength(0)
    expect(mediaNetwork.writes).toHaveLength(0)
    await expect(page.locator('.admin-product-photo-slot img')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Entendido', exact: true }).click()
  }
})

for (const [device, width, height] of [
  ['monitor', 1920, 1080],
  ['desktop', 1440, 900],
  ['laptop', 1366, 768],
  ['tablet', 768, 1024],
  ['mobile', 390, 844],
] as const) {
  test(`the photo workspace and public gallery remain usable on ${device}`, async ({
    page,
    supabaseNetwork,
    mediaNetwork,
  }) => {
    await page.setViewportSize({ width, height })
    await openPhotos(page, supabaseNetwork)
    await page
      .getByLabel('Subir varias fotos del producto')
      .setInputFiles(await photographs(5))
    await expect(page.locator('.admin-product-photo-slot img')).toHaveCount(5)
    const preparedNotice = page.getByRole('button', { name: 'Cerrar aviso' })
    if (await preparedNotice.isVisible()) await preparedNotice.click()
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({
      path: `artifacts/r2-media/screenshots/photos-${device}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true)
    await page
      .getByRole('button', { name: 'Guardar fotos', exact: true })
      .click()
    await expect(page).toHaveURL('/admin/productos')
    mediaNetwork.record.active = true
    await page.goto('/producto/perfume-prueba-r2')
    await expect(page.locator('.product-thumbnails button')).toHaveCount(4)
    // Hidden thumbnails and off-screen carousel frames intentionally lazy-load.
    // Verify each customer-visible view by navigating the actual controls.
    const controls = page.locator(
      width < 1024 ? '.product-gallery-mobile-controls' : '.product-thumbnails',
    )
    for (const index of [0, 1, 2, 3, 0]) {
      await controls
        .getByRole('button', { name: `Ver imagen ${index + 1} de 4` })
        .click()
      const frame = page.locator('.product-gallery-frame').nth(index)
      await expect(frame).toHaveClass(/is-active/)
      if (width < 1024) {
        await expect
          .poll(() =>
            page
              .locator('.product-gallery-track')
              .evaluate(
                (track, targetIndex) =>
                  Math.abs(track.scrollLeft - targetIndex * track.clientWidth),
                index,
              ),
          )
          // Subpixel frame widths accumulate a few CSS pixels at the last snap.
          .toBeLessThan(5)
      }
      await expect
        .poll(() =>
          frame
            .locator('img')
            .evaluate(
              (image: HTMLImageElement) =>
                image.complete && image.naturalWidth > 0,
            ),
        )
        .toBe(true)
    }
    await page.screenshot({
      path: `artifacts/r2-media/screenshots/product-${device}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true)
  })
}
