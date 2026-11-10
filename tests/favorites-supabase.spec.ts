import { Buffer } from 'node:buffer'
import { mkdir } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import {
  publicBrandPreviewsFixture,
  publicHomeCatalogFixture,
} from './public-home-catalog-fixture'
import { DEFAULT_OLFACTORY_FAMILIES } from '../src/domain/olfactory-family'
import type { AdminProduct } from '../src/types/admin'
import {
  customerA,
  customerB,
  expect,
  fixtureProject,
  fixtureStorageKey,
  test as authTest,
} from './supabase-auth-fixture'

const origin = `https://${fixtureProject}.supabase.co`
const brandId = '70000000-0000-4000-8000-000000000001'
const productIds = [1, 2, 3].map(
  (index) => `60000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
)
const guestStorageKey = 'aroma-infini:favorites:v1'
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST,GET,OPTIONS',
}

function makeProduct(index: number): AdminProduct {
  return {
    active: true,
    gender: 'unisex',
    popularity: 3 - index,
    newest: index,
    lowStockThreshold: 2,
    product: {
      id: productIds[index],
      sku: String(10000 + index),
      name: ['Flor de Prueba', 'Bosque de Prueba', 'Brisa de Prueba'][index],
      slug: ['flor-de-prueba', 'bosque-de-prueba', 'brisa-de-prueba'][index],
      brandId,
      productType: 'perfume',
      family: 'Floral',
      olfactoryFamilies: ['floral'],
      image: '/images/petale-960.webp',
      discount: null,
      variants: [
        {
          id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
          sku: String(1000 + index),
          ml: 50,
          priceCents: 12000 + index * 1000,
          stock: 8,
          active: true,
        },
      ],
    },
    detail: {
      shortDescription: 'Perfume para una prueba aislada de favoritos.',
      description: 'Datos de contrato HTTP aislado, sin catálogo comercial.',
      olfactoryImage: '/images/petale-960.webp',
      notes: { top: ['Bergamota'], heart: ['Rosa'], base: ['Almizcle'] },
      intensity: 'Suave',
      intensityLevel: 1,
      occasion: 'Diario',
      season: 'Todo el año',
      gallery: [
        {
          image: '/images/petale-960.webp',
          alt: 'Perfume de prueba',
          framing: 'full',
        },
      ],
      recommendationIds: [],
    },
  }
}
interface FavoriteList {
  productIds: string[]
  version: number
}
interface FavoritesNetwork {
  lists: Map<string, FavoriteList>
  products: ReturnType<typeof makeProduct>[]
  calls: Array<{
    name: string
    body: Record<string, unknown>
    owner: string | null
  }>
  failRead: boolean
  failWrite: boolean
  lostResponse: boolean
  holdWrite: Promise<void> | null
  holdRead: Promise<void> | null
}
const test = authTest.extend<{ favoritesNetwork: FavoritesNetwork }>({
  favoritesNetwork: async ({ context, supabaseNetwork }, runFixture) => {
    void supabaseNetwork
    const state: FavoritesNetwork = {
      lists: new Map([
        [customerA, { productIds: [productIds[0]], version: 1 }],
        [customerB, { productIds: [productIds[1]], version: 1 }],
      ]),
      products: [0, 1, 2].map(makeProduct),
      calls: [],
      failRead: false,
      failWrite: false,
      lostResponse: false,
      holdWrite: null,
      holdRead: null,
    }
    await context.route(`${origin}/rest/v1/rpc/*`, async (route) => {
      const request = route.request()
      const name = new URL(request.url()).pathname.split('/').at(-1)!
      if (
        !name.startsWith('catalog_') &&
        ![
          'customer_favorites',
          'set_customer_favorite',
          'commerce_settings',
          'home_document',
        ].includes(name)
      ) {
        await route.fallback()
        return
      }
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers })
        return
      }
      const body = request.postDataJSON() as Record<string, unknown>
      const authorization = request.headers().authorization
      const claims = authorization?.startsWith('Bearer ey')
        ? JSON.parse(
            Buffer.from(authorization.split('.')[1], 'base64url').toString(),
          )
        : null
      const owner = typeof claims?.sub === 'string' ? claims.sub : null
      state.calls.push({ name, body, owner })
      const reply = (json: unknown, status = 200) =>
        route.fulfill({ json, status, headers })
      const publicProducts = state.products.filter((item) => item.active)
      const metadata = {
        brands: [
          {
            id: brandId,
            name: 'Casa de Prueba',
            slug: 'casa-de-prueba',
            active: true,
          },
        ],
        features: { complementsEnabled: false },
        featuredBrandId: null,
        olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
        homeAnnouncement: null,
        homeVersion: 0,
        shipping: null,
        shippingVersion: 0,
      }
      if (name === 'customer_favorites' || name === 'set_customer_favorite') {
        if (!owner || !state.lists.has(owner)) {
          await reply(
            { code: '42501', message: 'Isolated owner required' },
            403,
          )
          return
        }
        const current = state.lists.get(owner)!
        if (name === 'customer_favorites') {
          const snapshot = structuredClone(current)
          const held = state.holdRead
          state.holdRead = null
          if (held) await held
          if (state.failRead)
            await reply(
              { code: 'PGRST000', message: 'Isolated unavailable read' },
              503,
            )
          else await reply(snapshot)
          return
        }
        const held = state.holdWrite
        state.holdWrite = null
        if (held) await held
        if (state.failWrite) {
          state.failWrite = false
          await reply(
            { code: 'PGRST000', message: 'Isolated unavailable write' },
            503,
          )
          return
        }
        const selected = body.p_selected === true
        const id = String(body.p_product_id)
        const exists = current.productIds.includes(id)
        if (
          exists !== selected &&
          current.version !== body.p_expected_version
        ) {
          await reply({ code: 'PT409', message: 'Isolated list conflict' }, 409)
          return
        }
        if (
          selected &&
          !publicProducts.some((item) => item.product.id === id)
        ) {
          await reply(
            { code: '22023', message: 'Isolated unavailable product' },
            400,
          )
          return
        }
        if (exists !== selected) {
          current.productIds = selected
            ? [...current.productIds, id]
            : current.productIds.filter((value) => value !== id)
          current.version++
        }
        if (state.lostResponse) {
          state.lostResponse = false
          await route.abort('failed')
          return
        }
        await reply(structuredClone(current))
        return
      }
      if (name === 'catalog_settings') await reply(metadata)
      else if (name === 'catalog_home_context')
        await reply(publicHomeCatalogFixture(metadata, publicProducts))
      else if (name === 'catalog_brand_previews')
        await reply(publicBrandPreviewsFixture(metadata.brands, publicProducts))
      else if (name === 'catalog_brands') await reply(metadata.brands)
      else if (name === 'commerce_settings')
        await reply({ shipping: null, shippingVersion: 0 })
      else if (name === 'home_document')
        await reply({ media: null, content: null, version: 0, mediaAssets: [] })
      else if (name === 'catalog_browse') {
        await reply({
          ...metadata,
          items: publicProducts,
          total: publicProducts.length,
          availableTotal: publicProducts.length,
          page: 1,
          pages: 1,
          familyCodes: ['floral'],
        })
      } else if (name === 'catalog_products')
        await reply({ items: publicProducts, total: publicProducts.length })
      else if (name === 'catalog_products_by_ids') {
        const ids = (body.p_product_ids ?? []) as string[]
        const variants = (body.p_variant_ids ?? []) as string[]
        const selected = publicProducts.filter(
          ({ product }) =>
            ids.includes(product.id) ||
            product.variants.some((variant) => variants.includes(variant.id)),
        )
        await reply({ items: selected, total: selected.length })
      } else if (name === 'catalog_product_context') {
        await reply({
          ...metadata,
          record:
            publicProducts.find(
              ({ product }) => product.slug === body.p_slug,
            ) ?? null,
          recommendations: [],
        })
      } else if (name === 'catalog_product') {
        await reply(
          publicProducts.find(({ product }) => product.slug === body.p_slug) ??
            null,
        )
      } else
        throw Error('Unhandled isolated favorites catalog request: ' + name)
    })
    await runFixture(state)
  },
})

function gate() {
  let resolve!: () => void
  const wait = new Promise<void>((done) => {
    resolve = done
  })
  return { wait, resolve }
}
async function account(page: Page) {
  if (page.url().startsWith('http://127.0.0.1:5193/')) {
    await navigate(page, '/cuenta/favoritos')
  } else await page.goto('/cuenta/favoritos')
  await expect(
    page.getByRole('heading', { name: 'Favoritos', exact: true }),
  ).toBeVisible()
}
async function navigate(page: Page, target: string) {
  await page.evaluate(async (target) => {
    const source = '/src/app/router.tsx'
    const { router } = await import(source)
    await router.navigate(target)
  }, target)
}
async function changeSession(page: Page, owner: string) {
  await page.evaluate(
    async ({ key, owner }) => {
      const old = JSON.parse(localStorage.getItem(key) || 'null')
      if (!old) throw Error('Expected an isolated SDK session')
      const [header, payload, signature] = old.access_token.split('.')
      const claims = JSON.parse(
        atob(payload.replace(/-/g, '+').replace(/_/g, '/')),
      )
      const updated = btoa(
        JSON.stringify({ ...claims, sub: owner, iat: claims.iat + 1 }),
      )
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
      const source = '/src/services/supabase-client.ts'
      const { requireSupabaseClient } = await import(source)
      const result = await requireSupabaseClient().auth.setSession({
        access_token: `${header}.${updated}.${signature}`,
        refresh_token: old.refresh_token,
      })
      if (result.error) throw Error('Isolated session replacement failed')
    },
    { key: fixtureStorageKey, owner },
  )
}

test('Los favoritos de invitado permanecen separados de la cuenta y reaparecen al salir', async ({
  page,
  supabaseNetwork,
  favoritesNetwork,
}) => {
  await page.addInitScript(
    ({ key, id }) =>
      localStorage.setItem(key, JSON.stringify({ version: 1, ids: [id] })),
    { key: guestStorageKey, id: productIds[2] },
  )
  await page.goto('/favoritos')
  await expect(page.locator('.favorites-grid')).toContainText('Brisa de Prueba')
  expect(
    favoritesNetwork.calls.filter((call) => call.name === 'customer_favorites'),
  ).toHaveLength(0)
  await supabaseNetwork.seedSession(page)
  await page.reload()
  await account(page)
  await expect(page.locator('.favorites-grid')).toContainText('Flor de Prueba')
  await expect(page.locator('.favorites-grid')).not.toContainText(
    'Brisa de Prueba',
  )
  expect(favoritesNetwork.lists.get(customerA)?.productIds).toEqual([
    productIds[0],
  ])
  await page.getByRole('button', { name: 'Salir de mi cuenta' }).click()
  await navigate(page, '/favoritos')
  await expect(page.locator('.favorites-grid')).toContainText('Brisa de Prueba')
  await expect(page.locator('.favorites-grid')).not.toContainText(
    'Flor de Prueba',
  )
})

test('Guardar y quitar usa el propietario verificado y sólo confirma el estado canónico', async ({
  page,
  supabaseNetwork,
  favoritesNetwork,
}) => {
  await supabaseNetwork.seedSession(page)
  await page.goto('/tienda')
  await expect(
    page.getByRole('button', { name: 'Quitar Flor de Prueba de favoritos' }),
  ).toBeVisible()
  const pending = gate()
  favoritesNetwork.holdWrite = pending.wait
  const save = page.getByRole('button', {
    name: 'Guardar Bosque de Prueba en favoritos',
  })
  await save.click()
  await expect(save).toBeDisabled()
  await expect(save).toHaveAttribute('aria-pressed', 'false')
  await expect
    .poll(
      () =>
        favoritesNetwork.calls.filter(
          (call) => call.name === 'set_customer_favorite',
        ).length,
    )
    .toBe(1)
  pending.resolve()
  await expect(
    page.getByRole('button', { name: 'Quitar Bosque de Prueba de favoritos' }),
  ).toHaveAttribute('aria-pressed', 'true')
  const writes = favoritesNetwork.calls.filter(
    (call) => call.name === 'set_customer_favorite',
  )
  expect(writes[0].owner).toBe(customerA)
  expect(writes[0].body).toEqual({
    p_product_id: productIds[1],
    p_selected: true,
    p_expected_version: 1,
  })
  await account(page)
  await expect(page.locator('.favorites-grid .product-card')).toHaveCount(2)
  await page
    .getByRole('button', { name: 'Quitar Flor de Prueba de favoritos' })
    .click()
  await expect(page.locator('.favorites-grid .product-card')).toHaveCount(1)
  expect(favoritesNetwork.lists.get(customerA)?.productIds).toEqual([
    productIds[1],
  ])
  const stored = await page.evaluate(
    (key) => localStorage.getItem(key),
    guestStorageKey,
  )
  expect(stored ?? '').not.toContain(productIds[1])
})

test('Una respuesta perdida reintenta guardar el mismo estado sin invertirlo', async ({
  page,
  supabaseNetwork,
  favoritesNetwork,
}) => {
  await supabaseNetwork.seedSession(page)
  await page.goto('/tienda')
  favoritesNetwork.lostResponse = true
  await page
    .getByRole('button', { name: 'Guardar Bosque de Prueba en favoritos' })
    .click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('No se pudieron actualizar tus favoritos')
  await expect(
    page.getByRole('button', { name: 'Guardar Bosque de Prueba en favoritos' }),
  ).toHaveAttribute('aria-pressed', 'false')
  await dialog.getByRole('button', { name: 'Volver a intentar' }).click()
  await expect(
    page.getByRole('button', { name: 'Quitar Bosque de Prueba de favoritos' }),
  ).toHaveAttribute('aria-pressed', 'true')
  const writes = favoritesNetwork.calls.filter(
    (call) => call.name === 'set_customer_favorite',
  )
  expect(writes).toHaveLength(2)
  expect(writes.map((call) => call.body.p_selected)).toEqual([true, true])
  expect(
    favoritesNetwork.lists
      .get(customerA)
      ?.productIds.filter((id) => id === productIds[1]),
  ).toHaveLength(1)
})

test('Un fallo de guardado no cambia el corazón y conserva la acción para volver a intentar', async ({
  page,
  supabaseNetwork,
  favoritesNetwork,
}) => {
  await supabaseNetwork.seedSession(page)
  await page.goto('/tienda')
  favoritesNetwork.failWrite = true
  await page
    .getByRole('button', { name: 'Guardar Bosque de Prueba en favoritos' })
    .click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('No se pudieron actualizar tus favoritos')
  await expect(
    page.getByRole('button', { name: 'Guardar Bosque de Prueba en favoritos' }),
  ).toHaveAttribute('aria-pressed', 'false')
  expect(favoritesNetwork.lists.get(customerA)?.productIds).toEqual([
    productIds[0],
  ])
  await mkdir('artifacts/favorites-supabase/screenshots', { recursive: true })
  for (const [name, width, height] of [
    ['desktop', 1440, 900],
    ['mobile', 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height })
    await expect(dialog).toBeVisible()
    const primary = await dialog
      .getByRole('button', { name: 'Volver a intentar' })
      .boundingBox()
    const secondary = await dialog
      .locator('.account-form-actions')
      .getByRole('button', { name: 'Cerrar', exact: true })
      .boundingBox()
    expect(primary).not.toBeNull()
    expect(secondary).not.toBeNull()
    if (primary && secondary) {
      const separation = Math.max(
        secondary.x - primary.x - primary.width,
        secondary.y - primary.y - primary.height,
      )
      expect(separation).toBeGreaterThanOrEqual(8)
      expect(Math.min(primary.height, secondary.height)).toBeGreaterThanOrEqual(
        44,
      )
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false)
    await page.screenshot({
      path: `artifacts/favorites-supabase/screenshots/error-${name}.png`,
    })
  }
  await dialog.getByRole('button', { name: 'Volver a intentar' }).click()
  await expect(
    page.getByRole('button', { name: 'Quitar Bosque de Prueba de favoritos' }),
  ).toHaveAttribute('aria-pressed', 'true')
  expect(favoritesNetwork.lists.get(customerA)?.productIds).toEqual([
    productIds[0],
    productIds[1],
  ])
})

test('Dos selecciones rápidas se serializan con sus versiones y no se pierde ninguna', async ({
  page,
  supabaseNetwork,
  favoritesNetwork,
}) => {
  await supabaseNetwork.seedSession(page)
  await page.goto('/tienda')
  const held = gate()
  favoritesNetwork.holdWrite = held.wait
  const first = page.getByRole('button', {
    name: 'Guardar Bosque de Prueba en favoritos',
  })
  const second = page.getByRole('button', {
    name: 'Guardar Brisa de Prueba en favoritos',
  })
  await first.click()
  await second.click()
  await expect(first).toBeDisabled()
  await expect(second).toBeDisabled()
  expect(
    favoritesNetwork.calls.filter(
      (call) => call.name === 'set_customer_favorite',
    ),
  ).toHaveLength(1)
  held.resolve()
  await expect(
    page.getByRole('button', { name: 'Quitar Brisa de Prueba de favoritos' }),
  ).toHaveAttribute('aria-pressed', 'true')
  expect(
    favoritesNetwork.calls
      .filter((call) => call.name === 'set_customer_favorite')
      .map((call) => call.body.p_expected_version),
  ).toEqual([1, 2])
  expect(favoritesNetwork.lists.get(customerA)?.productIds).toEqual(productIds)
})

test('Un conflicto actualiza la lista confirmada y reintenta sin borrar cambios de otro dispositivo', async ({
  page,
  supabaseNetwork,
  favoritesNetwork,
}) => {
  await supabaseNetwork.seedSession(page)
  await page.goto('/tienda')
  await expect(
    page.getByRole('button', { name: 'Quitar Flor de Prueba de favoritos' }),
  ).toBeVisible()
  favoritesNetwork.lists.set(customerA, {
    productIds: [productIds[0], productIds[2]],
    version: 2,
  })
  await page
    .getByRole('button', { name: 'Guardar Bosque de Prueba en favoritos' })
    .click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('No se pudieron actualizar tus favoritos')
  await expect(
    page.getByRole('button', { name: 'Quitar Brisa de Prueba de favoritos' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await dialog.getByRole('button', { name: 'Volver a intentar' }).click()
  await expect(
    page.getByRole('button', { name: 'Quitar Bosque de Prueba de favoritos' }),
  ).toHaveAttribute('aria-pressed', 'true')
  expect(favoritesNetwork.lists.get(customerA)?.productIds).toHaveLength(3)
  expect(favoritesNetwork.lists.get(customerA)?.productIds).toContain(
    productIds[2],
  )
})

test('Una lectura fallida muestra error y permite reintentar sin declarar la lista vacía', async ({
  page,
  supabaseNetwork,
  favoritesNetwork,
}) => {
  favoritesNetwork.failRead = true
  await supabaseNetwork.seedSession(page)
  await account(page)
  await expect(page.locator('main')).not.toContainText(
    'Tu próxima elección empieza aquí',
  )
  await expect(
    page.getByRole('button', { name: 'Reintentar', exact: true }),
  ).toBeVisible()
  favoritesNetwork.failRead = false
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.locator('.favorites-grid')).toContainText('Flor de Prueba')
})

test('Cambiar de cuenta descarta una respuesta tardía del propietario anterior', async ({
  page,
  supabaseNetwork,
  favoritesNetwork,
}) => {
  await supabaseNetwork.seedSession(page)
  await page.goto('/tienda')
  await expect(
    page.getByRole('button', { name: 'Quitar Flor de Prueba de favoritos' }),
  ).toBeVisible()
  const held = gate()
  favoritesNetwork.holdWrite = held.wait
  await page
    .getByRole('button', { name: 'Guardar Brisa de Prueba en favoritos' })
    .click()
  await expect
    .poll(
      () =>
        favoritesNetwork.calls.filter(
          (call) => call.name === 'set_customer_favorite',
        ).length,
    )
    .toBe(1)
  supabaseNetwork.currentUserId = customerB
  await changeSession(page, customerB)
  await expect(
    page.getByRole('button', { name: 'Quitar Bosque de Prueba de favoritos' }),
  ).toHaveAttribute('aria-pressed', 'true')
  held.resolve()
  await expect(
    page.getByRole('button', { name: 'Guardar Brisa de Prueba en favoritos' }),
  ).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await account(page)
  await expect(page.locator('.favorites-grid')).toContainText(
    'Bosque de Prueba',
  )
  await expect(page.locator('.favorites-grid')).not.toContainText(
    'Flor de Prueba',
  )
})

test('Renovar la sesión del mismo usuario conserva su lista y una segunda pestaña la consulta de Supabase', async ({
  page,
  context,
  supabaseNetwork,
  favoritesNetwork,
}) => {
  await supabaseNetwork.seedSession(page)
  await account(page)
  await expect(page.locator('.favorites-grid')).toContainText('Flor de Prueba')
  await changeSession(page, customerA)
  await expect(page.locator('.favorites-grid')).toContainText('Flor de Prueba')
  favoritesNetwork.lists.set(customerA, {
    productIds: [productIds[0], productIds[2]],
    version: 2,
  })
  const another = await context.newPage()
  await account(another)
  await expect(another.locator('.favorites-grid .product-card')).toHaveCount(2)
  await expect(another.locator('.favorites-grid')).toContainText(
    'Brisa de Prueba',
  )
  await another.close()
})

test('Un producto retirado no revela su contenido y puede quitarse de favoritos', async ({
  page,
  supabaseNetwork,
  favoritesNetwork,
}) => {
  favoritesNetwork.products[0].active = false
  await supabaseNetwork.seedSession(page)
  await account(page)
  await expect(page.locator('main')).toContainText(
    'Un favorito ya no está disponible',
  )
  await expect(page.locator('main')).not.toContainText('Flor de Prueba')
  await page
    .getByRole('button', { name: 'Retirar selección no disponible' })
    .click()
  await expect(page.locator('main')).toContainText(
    'Tu próxima elección empieza aquí',
  )
  expect(favoritesNetwork.lists.get(customerA)?.productIds).toEqual([])
})

for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [768, 1024],
  [390, 844],
]) {
  test(`Favoritos de cuenta conserva proporciones y controles accesibles ${width}`, async ({
    page,
    supabaseNetwork,
    favoritesNetwork,
  }) => {
    favoritesNetwork.lists.set(customerA, {
      productIds: productIds.slice(),
      version: 1,
    })
    await supabaseNetwork.seedSession(page)
    await page.setViewportSize({ width, height })
    await account(page)
    await expect(page.locator('.favorites-grid .product-card')).toHaveCount(3)
    await expect(
      page.locator('.favorites-grid button[aria-pressed="true"]'),
    ).toHaveCount(3)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false)
    await mkdir('artifacts/favorites-supabase/screenshots', { recursive: true })
    await page.screenshot({
      path: `artifacts/favorites-supabase/screenshots/favorites-${width}.png`,
      fullPage: true,
    })
  })
}
