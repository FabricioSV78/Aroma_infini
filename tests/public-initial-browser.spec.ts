import { test, expect } from './supabase-auth-fixture'
import { publicInitialContextJson } from '../src/domain/public-initial-context'
import { defaultSiteSettings } from '../src/domain/site-settings'
import { DEFAULT_OLFACTORY_FAMILIES } from '../src/domain/olfactory-family'
const origin = 'https://abcdefghijklmnopqrst.supabase.co'

// The metadata/bootstrap cases also mount the real remote storefront shell.
// Always install its network boundary, including cases without an Auth action.
test.beforeEach(async ({ supabaseNetwork }) => {
  void supabaseNetwork
})

for (const invalid of [false, true])
  test(`validated initial catalog joins the ordinary cache; invalid payload is never seeded: ${invalid}`, async ({
    page,
  }) => {
    await page.addInitScript(() =>
      Object.defineProperty(performance, 'now', {
        configurable: true,
        value: () => 500,
      }),
    )
    const query = {
      productTypes: [],
      brands: [],
      genders: [],
      families: [],
      min: '',
      max: '',
      order: 'mas-vendidos',
      page: 1,
      search: '',
    }
    const value = {
      features: { complementsEnabled: false },
      featuredBrandId: null,
      olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
      shipping: null,
      shippingVersion: 0,
      brands: [],
      items: [],
      total: 0,
      availableTotal: 0,
      page: 1,
      pages: 1,
      familyCodes: [],
    }
    let reads = 0
    await page.route('**/rest/v1/rpc/catalog_browse', async (route) => {
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
      }
      if (route.request().method() === 'OPTIONS')
        return route.fulfill({ status: 204, headers })
      reads++
      await route.fulfill({ json: value, headers })
    })
    const json = publicInitialContextJson(origin, '/contacto', {
      browse: {
        key: JSON.stringify([query, 12]),
        value: invalid ? { ...value, total: 'invalid' } : value,
      },
    })!
    await page.route('**/contacto', async (route) => {
      if (route.request().resourceType() !== 'document') return route.fallback()
      const response = await route.fetch()
      await route.fulfill({
        response,
        body: (await response.text()).replace(
          '</head>',
          () =>
            `<script type="application/json" id="aroma-public-initial-context">${json}</script></head>`,
        ),
      })
    })
    await page.goto('/contacto')
    await expect(page.locator('main h1')).toHaveText('Contacto')
    const totals = await page.evaluate(async (query) => {
      const path = '/src/services/remote-catalog-queries.ts'
      const service = (await import(
        path
      )) as typeof import('../src/services/remote-catalog-queries')
      return [
        (
          await service.readRemoteCatalog(
            query as Parameters<typeof service.readRemoteCatalog>[0],
          )
        ).total,
        (
          await service.readRemoteCatalog(
            query as Parameters<typeof service.readRemoteCatalog>[0],
          )
        ).total,
      ]
    }, query)
    expect(totals).toEqual([0, 0])
    expect(reads).toBe(invalid ? 1 : 0)
    await page.evaluate(async (query) => {
      const cache = '/src/services/public-query-cache.ts',
        path = '/src/services/remote-catalog-queries.ts'
      ;(
        (await import(
          cache
        )) as typeof import('../src/services/public-query-cache')
      ).invalidatePublicQueryCache()
      const service = (await import(
        path
      )) as typeof import('../src/services/remote-catalog-queries')
      await service.readRemoteCatalog(
        query as Parameters<typeof service.readRemoteCatalog>[0],
      )
    }, query)
    expect(reads).toBe(invalid ? 2 : 1)
  })
for (const scenario of [
  'fresh',
  'expired',
  'wrong-project',
  'wrong-path',
  'invalidated',
  'wrong-key',
  'oversized',
  'malformed',
] as const) {
  test(`initial context is single-use and scoped to its exact document: ${scenario}`, async ({
    page,
  }) => {
    // Vite's first transform is not a deployed response. Test document age
    // independently from that compilation cost; expiry is set below.
    await page.addInitScript(() =>
      Object.defineProperty(performance, 'now', {
        configurable: true,
        value: () => 500,
      }),
    )
    const payload =
      scenario === 'malformed'
        ? '{broken'
        : publicInitialContextJson(
            scenario === 'wrong-project'
              ? 'https://wrongproject.supabase.co'
              : origin,
            scenario === 'wrong-path' ? '/tienda' : '/contacto',
            {
              home: { marker: 'public' },
              browse: { key: 'expected-query', value: { marker: 'browse' } },
            },
          )!
    await page.route('**/contacto', async (route) => {
      if (route.request().resourceType() !== 'document') return route.fallback()
      const response = await route.fetch()
      const content =
        scenario === 'oversized'
          ? JSON.stringify({ padding: 'x'.repeat(2300 * 1024) })
          : payload
      await route.fulfill({
        response,
        body: (await response.text()).replace(
          '</head>',
          () =>
            `<script type="application/json" id="aroma-public-initial-context">${content}</script></head>`,
        ),
      })
    })
    await page.goto('/contacto')
    await expect(page.locator('main h1')).toHaveText('Contacto')
    const result = await page.evaluate(async (scenario) => {
      const path = '/src/services/public-initial-context.ts'
      const { takePublicInitialContext } = (await import(
        path
      )) as typeof import('../src/services/public-initial-context')
      const cache = '/src/services/public-query-cache.ts'
      if (scenario === 'invalidated')
        (
          (await import(
            cache
          )) as typeof import('../src/services/public-query-cache')
        ).invalidatePublicQueryCache()
      Object.defineProperty(performance, 'now', {
        configurable: true,
        value: () => (scenario === 'expired' ? 5001 : 500),
      })
      try {
        return {
          home: takePublicInitialContext('home'),
          again: takePublicInitialContext('home'),
          browse: takePublicInitialContext(
            'browse',
            scenario === 'wrong-key' ? 'other-query' : 'expected-query',
          ),
          removed: !document.getElementById('aroma-public-initial-context'),
        }
      } finally {
        Reflect.deleteProperty(performance, 'now')
      }
    }, scenario)
    expect(result.home).toEqual(
      ['fresh', 'wrong-key'].includes(scenario)
        ? { marker: 'public' }
        : undefined,
    )
    expect(result.again).toBeUndefined()
    expect(result.browse).toEqual(
      scenario === 'fresh' ? { marker: 'browse' } : undefined,
    )
    expect(result.removed).toBe(true)
  })
}
test('initial business settings avoid a repeated read and forced refresh still reads the server', async ({
  page,
}) => {
  let reads = 0
  const settings = defaultSiteSettings()
  settings.contact.whatsapp = '51988877766'
  const json = publicInitialContextJson(origin, '/contacto', {
    settings: { version: 7, data: settings },
  })!
  await page.route('**/rest/v1/rpc/site_settings', async (route) => {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    }
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers })
    reads++
    await route.fulfill({
      json: {
        version: 8,
        data: {
          ...settings,
          contact: { ...settings.contact, whatsapp: '51911122233' },
        },
      },
      headers,
    })
  })
  await page.route('**/contacto', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback()
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: (await response.text()).replace(
        '</head>',
        () =>
          `<script type="application/json" id="aroma-public-initial-context">${json}</script></head>`,
      ),
    })
  })
  await page.goto('/contacto')
  await expect(
    page.locator('main a[href^="https://wa.me/51988877766"]'),
  ).toBeVisible()
  expect(reads).toBe(0)
  await page.evaluate(async () => {
    const path = '/src/services/site-settings-service.ts'
    await (
      (await import(
        path
      )) as typeof import('../src/services/site-settings-service')
    ).siteSettingsService.load(true)
  })
  await expect(
    page.locator('main a[href^="https://wa.me/51911122233"]'),
  ).toBeVisible()
  expect(reads).toBe(1)
})
