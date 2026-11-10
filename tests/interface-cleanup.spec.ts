import { mkdir } from 'node:fs/promises'
import {
  publicBrandPreviewsFixture,
  publicHomeCatalogFixture,
} from './public-home-catalog-fixture'
import {
  test as authTest,
  expect,
  fixtureProject,
  customerA,
  signIn,
} from './supabase-auth-fixture'
import { DEFAULT_OLFACTORY_FAMILIES } from '../src/domain/olfactory-family'
import { defaultSiteSettings } from '../src/domain/site-settings'
import type { AdminOrder, AdminProduct } from '../src/types/admin'
import type { Page } from '@playwright/test'

const productId = '60000000-0000-4000-8000-000000000001'
const variantId = '50000000-0000-4000-8000-000000000001'
const brand = {
  id: '70000000-0000-4000-8000-000000000001',
  name: 'Casa auditada',
  slug: 'casa-auditada',
  active: true,
}
const record: AdminProduct = {
  active: true,
  gender: 'unisex',
  popularity: 1,
  newest: 1,
  lowStockThreshold: 2,
  product: {
    id: productId,
    sku: '10000',
    name: 'Perfume auditado',
    slug: 'perfume-auditado',
    brandId: brand.id,
    productType: 'perfume',
    family: 'Floral',
    olfactoryFamilies: ['floral'],
    image: '/images/petale-960.webp',
    discount: null,
    variants: [
      {
        id: variantId,
        sku: '1000',
        ml: 50,
        priceCents: 12000,
        stock: 5,
        active: true,
      },
    ],
  },
  detail: {
    shortDescription: 'Descripción de la fuente autorizada.',
    description: 'Detalle confirmado de la fuente autorizada.',
    olfactoryImage: '/images/petale-960.webp',
    notes: { top: [], heart: [], base: [] },
    intensity: 'Suave',
    intensityLevel: 1,
    occasion: 'Diario',
    season: 'Todo el año',
    gallery: [
      {
        image: '/images/petale-960.webp',
        alt: 'Perfume auditado',
        framing: 'full',
      },
    ],
    recommendationIds: [],
  },
}
interface AuditNetwork {
  empty: boolean
  unavailable: boolean
  orders: AdminOrder[]
  writes: number
}
const test = authTest.extend<{ auditNetwork: AuditNetwork }>({
  auditNetwork: async ({ context, supabaseNetwork }, runFixture) => {
    void supabaseNetwork
    const state: AuditNetwork = {
      empty: false,
      unavailable: false,
      orders: [],
      writes: 0,
    }
    await context.route(
      `https://${fixtureProject}.supabase.co/rest/v1/rpc/*`,
      async (route) => {
        const name = new URL(route.request().url()).pathname.split('/').at(-1)!
        const headers = {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'POST,OPTIONS',
        }
        if (route.request().method() === 'OPTIONS') {
          await route.fulfill({ status: 204, headers })
          return
        }
        const reply = (json: unknown, status = 200) =>
          route.fulfill({ json, status, headers })
        const metadata = {
          brands: state.empty ? [] : [brand],
          features: { complementsEnabled: false },
          featuredBrandId: null,
          olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
          shipping: null,
          shippingVersion: 0,
          homeAnnouncement: null,
          homeVersion: 0,
        }
        const items = state.empty ? [] : [record]
        if (state.unavailable && name.startsWith('catalog_')) {
          await reply({ code: 'PGRST000' }, 503)
          return
        }
        if (name === 'catalog_settings') await reply(metadata)
        else if (name === 'catalog_home_context')
          await reply(publicHomeCatalogFixture(metadata, items))
        else if (name === 'catalog_brand_previews')
          await reply(publicBrandPreviewsFixture(metadata.brands, items))
        else if (name === 'catalog_brands') await reply(metadata.brands)
        else if (name === 'catalog_products')
          await reply({ items, total: items.length })
        else if (name === 'catalog_browse')
          await reply({
            ...metadata,
            items,
            total: items.length,
            page: 1,
            pageSize: 12,
            availableTotal: items.length,
            familyCodes: state.empty ? [] : ['floral'],
          })
        else if (name === 'catalog_product_context')
          await reply({
            ...metadata,
            record: items[0] ?? null,
            recommendations: [],
          })
        else if (name === 'catalog_products_by_ids')
          await reply({ ...metadata, items })
        else if (name === 'catalog_product') await reply(items[0] ?? null)
        else if (name === 'home_document' || name === 'admin_home_document')
          await reply({
            media: null,
            content: null,
            version: 0,
            mediaAssets: [],
          })
        else if (name === 'commerce_settings')
          await reply({ shipping: null, shippingVersion: 0 })
        else if (name === 'site_settings')
          await reply({ version: 1, data: defaultSiteSettings() })
        else if (name === 'product_reviews')
          await reply({
            items: [],
            total: 0,
            page: 1,
            pageSize: 3,
            count: 0,
            average: null,
            distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          })
        else if (name === 'customer_product_review') await reply(null)
        else if (name === 'admin_catalog_page')
          await reply({
            ...metadata,
            products: items,
            brands: metadata.brands,
            productVersions: state.empty ? {} : { [productId]: 1 },
            brandVersions: state.empty ? {} : { [brand.id]: 1 },
            settingsVersion: 1,
            total: items.length,
          })
        else if (name === 'admin_orders')
          await reply({
            orders: state.orders,
            orderHistory: [],
            total: state.orders.length,
          })
        else if (name === 'admin_commerce_settings')
          await reply({
            shipping: null,
            shippingVersion: 0,
            coupons: [],
            couponVersions: {},
          })
        else {
          await route.fallback()
        }
      },
    )
    await context.route('**/api/checkout/simulate', async (route) => {
      state.writes++
      await route.fulfill({ status: 500, json: {} })
    })
    await runFixture(state)
  },
})
const screenshots = 'artifacts/interface-cleanup-2026-10-30/screenshots'
async function settledPage(page: Page) {
  await expect(page.locator('.ui-loading-shell')).toHaveCount(0)
  await expect(page.locator('main h1').first()).toBeVisible()
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      [...document.images].map(async (image) => {
        image.loading = 'eager'
        await image.decode().catch(() => {})
      }),
    )
  })
}

test('Production blocks checkout and confirmation despite demo query or an accidental local catalog setting', async ({
  page,
  auditNetwork,
}) => {
  await page.goto('/checkout?demo=1')
  await expect(
    page.getByRole('heading', {
      name: 'El pago en línea aún no está disponible',
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Guardar selección|Reintentar|Pagar/ }),
  ).toHaveCount(0)
  const flags = await page.evaluate(async () => {
    const path = '/src/services/runtime-environment.ts'
    const runtime = await import(path)
    const sourcePath = '/src/services/catalog-source.ts'
    const source = await import(sourcePath)
    return {
      simulation: runtime.canSimulateCheckout,
      fixtures: runtime.canUseLocalFixtures,
      source: source.catalogSource,
    }
  })
  expect(flags).toEqual({
    simulation: false,
    fixtures: false,
    source: 'supabase',
  })
  await page.goto('/checkout/confirmacion')
  await expect(
    page.getByRole('heading', { name: 'No hay una selección reciente' }),
  ).toBeVisible()
  expect(auditNetwork.writes).toBe(0)
})
test('A remote perfume shows no fixture ratings, published local reviews or invented popularity claims', async ({
  page,
  auditNetwork,
}) => {
  void auditNetwork
  await page.goto('/producto/perfume-auditado')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Perfume auditado' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Reseñas', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Aún no hay reseñas publicadas' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Escribir una reseña', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.product-review-list > li')).toHaveCount(0)
  await expect(page.locator('.product-reviews-score')).toHaveCount(0)
  await expect(page.locator('main')).not.toContainText('Entre los más vendidos')
  const reviews = await page.evaluate(async () => {
    const path = '/src/services/review-service.ts'
    const service = await import(path)
    return service.getPublishedReviews('bois-clair')
  })
  expect(reviews).toEqual([])
  const schemas = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents()
  expect(schemas.join('')).not.toMatch(
    /aggregateRating|reviewCount|ratingValue/,
  )
})
test('Empty and failed catalogs never load old commercial examples after refresh', async ({
  page,
  auditNetwork,
}) => {
  auditNetwork.empty = true
  await page.goto('/tienda')
  await expect(page.locator('.product-card')).toHaveCount(0)
  await expect(page.locator('main')).not.toContainText('Bois Clair')
  await page.reload()
  await expect(page.locator('.product-card')).toHaveCount(0)
  auditNetwork.unavailable = true
  await page.reload()
  await expect(page.locator('main')).toContainText(
    /No pudimos|No se pudo|problema|conexión/,
  )
  await expect(page.locator('.product-card')).toHaveCount(0)
})
test('Connected public and account pages retain honest empty states and no inactive social links', async ({
  page,
  supabaseNetwork,
  auditNetwork,
}) => {
  void auditNetwork
  for (const path of [
    '/nosotros',
    '/contacto',
    '/envios',
    '/marcas',
    '/seguir-pedido',
    '/favoritos',
    '/carrito',
  ]) {
    await page.goto(path)
    await expect(page.locator('main h1').first()).toBeVisible()
    await expect(page.locator('.site-footer')).not.toContainText(
      'Perfiles en preparación',
    )
    await expect(page.locator('main')).not.toContainText(
      'El acceso a cuentas aún no está habilitado',
    )
  }
  await supabaseNetwork.seedSession(page)
  await page.goto('/cuenta/pagos')
  await expect(
    page.getByRole('heading', { name: 'No hay pagos registrados' }),
  ).toBeVisible()
  await expect(page.locator('main')).not.toContainText('Pago confirmado')
})
test('The administrative dashboard excludes test orders from commercial metrics and customers', async ({
  page,
  supabaseNetwork,
  auditNetwork,
}) => {
  auditNetwork.orders = [
    {
      id: '80000000-0000-4000-8000-000000000001',
      version: 1,
      simulation: true,
      reference: 'AI-0000000000000001',
      customerId: customerA,
      customerName: 'Comprador de prueba',
      customerEmail: 'fixture@example.invalid',
      contactPhone: '912345678',
      placedAt: new Date().toISOString(),
      status: 'shipped',
      paymentStatus: 'pending',
      lines: [
        {
          variantId,
          name: 'Perfume histórico',
          brand: 'Casa',
          ml: 50,
          quantity: 1,
          unitPriceCents: 12000,
        },
      ],
      promotionCode: null,
      paymentProvider: 'mercado-pago',
      deliveryMethod: 'courier',
      address: {
        department: 'lima',
        province: '1501',
        district: '150101',
        street: 'Calle de fixture',
        reference: '',
      },
      subtotalCents: 12000,
      discountCents: 0,
      shippingCents: 0,
      totalCents: 12000,
    },
  ]
  supabaseNetwork.adminMembership = true
  await signIn(page, 'admin')
  await page
    .getByLabel('Código de verificación', { exact: true })
    .fill('123456')
  await page
    .getByRole('button', { name: 'Verificar y continuar', exact: true })
    .click()
  await expect(page).toHaveURL('/admin')
  await expect(page.locator('main')).toContainText(
    'Todavía no hay pedidos comerciales',
  )
  await expect(page.locator('.admin-demo-banner')).toHaveCount(0)
  await page.goto('/admin/clientes')
  await expect(
    page.getByRole('heading', { name: 'Aún no hay clientes' }),
  ).toBeVisible()
  await page.goto('/admin/pedidos')
  await expect(page.locator('main')).toContainText('Modo prueba')
})
for (const [width, height] of [
  [1920, 1080],
  [1440, 900],
  [1366, 768],
  [768, 1024],
  [390, 844],
]) {
  test(`Production presentation remains clean at ${width}`, async ({
    page,
    supabaseNetwork,
    auditNetwork,
  }) => {
    void auditNetwork
    await mkdir(screenshots, { recursive: true })
    await page.setViewportSize({ width, height })
    for (const [label, path] of [
      ['home', '/'],
      ['contacto', '/contacto'],
      ['envios', '/envios'],
      ['checkout', '/checkout'],
    ]) {
      await page.goto(path)
      await settledPage(page)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true)
      await page.screenshot({
        path: `${screenshots}/${label}-${width}.png`,
        fullPage: true,
        animations: 'disabled',
      })
    }
    await supabaseNetwork.seedSession(page)
    await page.goto('/cuenta/pagos')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Pagos', exact: true }),
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `${screenshots}/cuenta-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    })
  })
  test(`Administrative presentation remains clean at ${width}`, async ({
    page,
    supabaseNetwork,
    auditNetwork,
  }) => {
    void auditNetwork
    await mkdir(screenshots, { recursive: true })
    await page.setViewportSize({ width, height })
    supabaseNetwork.adminMembership = true
    await signIn(page, 'admin')
    await page
      .getByLabel('Código de verificación', { exact: true })
      .fill('123456')
    await page
      .getByRole('button', { name: 'Verificar y continuar', exact: true })
      .click()
    await expect(page).toHaveURL('/admin')
    for (const [label, path] of [
      ['resumen', '/admin'],
      ['productos', '/admin/productos'],
      ['ofertas', '/admin/promociones'],
      ['pedidos', '/admin/pedidos'],
      ['tarifas', '/admin/envios'],
      ['contenido', '/admin/home'],
    ]) {
      await page.goto(path)
      await settledPage(page)
      await expect(page.locator('.admin-demo-banner')).toHaveCount(0)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true)
      await page.screenshot({
        path: `${screenshots}/admin-${label}-${width}.png`,
        fullPage: true,
        animations: 'disabled',
      })
    }
  })
}
