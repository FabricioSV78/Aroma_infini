import type { Page } from '@playwright/test'
import { createDefaultHomeContent } from '../src/content/home-editor'
import { DEFAULT_OLFACTORY_FAMILIES } from '../src/domain/olfactory-family'
import { homeBootstrapJson } from '../src/domain/home-bootstrap'
import { expect, fixtureProject, test as authTest } from './supabase-auth-fixture'

const origin = `https://${fixtureProject}.supabase.co`
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST,OPTIONS',
}

function homeDocument(version = 1) {
  const content = createDefaultHomeContent()
  content.finder.familyVisuals = {}
  content.announcement.deliveryText = `Contenido ${version}`
  return {
    version,
    content,
    media: { hombre: null, mujer: null, unisex: null, complementos: null },
    mediaAssets: [],
  }
}

interface HomeCacheNetwork {
  document: ReturnType<typeof homeDocument>
  reads: number
  holdRead: Promise<void> | null
  holdCatalog: Promise<void> | null
}

const test = authTest.extend<{ homeCacheNetwork: HomeCacheNetwork }>({
  homeCacheNetwork: async ({ context, supabaseNetwork }, runFixture) => {
    void supabaseNetwork
    const state: HomeCacheNetwork = {
      document: homeDocument(),
      reads: 0,
      holdRead: null,
      holdCatalog: null,
    }
    await context.route(`${origin}/rest/v1/rpc/*`, async (route) => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (!name || (!name.startsWith('catalog_') && name !== 'home_document'))
        return route.fallback()
      if (route.request().method() === 'OPTIONS')
        return route.fulfill({ status: 204, headers })
      if (name === 'home_document') {
        state.reads++
        const value = structuredClone(state.document)
        await state.holdRead
        return route.fulfill({ json: value, headers })
      }
      const metadata = {
        brands: [],
        features: { complementsEnabled: false },
        featuredBrandId: null,
        olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
        homeAnnouncement: state.document.content.announcement,
        homeVersion: state.document.version,
        shipping: null,
        shippingVersion: 0,
      }
      if (name === 'catalog_home_context') {
        await state.holdCatalog
        return route.fulfill({
          json: { ...metadata, profiles: [], items: [], finderAvailableCount: 0 },
          headers,
        })
      }
      if (name === 'catalog_settings')
        return route.fulfill({ json: metadata, headers })
      if (name === 'catalog_brands')
        return route.fulfill({ json: [], headers })
      if (name === 'catalog_browse')
        return route.fulfill({
          json: {
            ...metadata,
            items: [],
            total: 0,
            availableTotal: 0,
            page: 1,
            pages: 1,
            familyCodes: [],
          },
          headers,
        })
      throw new Error(`Unexpected isolated Home cache RPC: ${name}`)
    })
    await runFixture(state)
  },
})

async function readHome(page: Page, count = 1) {
  return page.evaluate(async (count) => {
    const path = '/src/services/home-content-service.ts'
    const { readPublicHome } = (await import(path)) as typeof import('../src/services/home-content-service')
    return Promise.all(
      Array.from({ length: count }, async () => (await readPublicHome()).version),
    )
  }, count)
}

async function announceHome(page: Page, document: ReturnType<typeof homeDocument>) {
  await page.evaluate(async (document) => {
    const path = '/src/services/home-content-service.ts'
    const { publicHomeContent } = (await import(path)) as typeof import('../src/services/home-content-service')
    publicHomeContent.metadata(document.content.announcement, document.version)
  }, document)
}

test('Home conserva la lectura editorial al descubrir versión y volver desde Tienda', async ({ page, homeCacheNetwork }) => {
  await page.goto('/')
  await expect(page.locator('.hero')).toBeVisible()
  expect(homeCacheNetwork.reads).toBe(1)
  for (const path of ['/tienda', '/']) {
    await page.evaluate(async (path) => {
      const modulePath = '/src/app/router.tsx'
      const { getRouter } = (await import(modulePath)) as typeof import('../src/app/router')
      await getRouter().navigate(path)
    }, path)
  }
  await expect(page.locator('.hero')).toBeVisible()
  expect(await readHome(page, 3)).toEqual([1, 1, 1])
  expect(homeCacheNetwork.reads).toBe(1)
})

test('Una versión anunciada nueva agrupa la renovación y conserva el resultado renovado', async ({ page, homeCacheNetwork }) => {
  await page.goto('/')
  await expect(page.locator('.hero')).toBeVisible()
  homeCacheNetwork.document = homeDocument(2)
  await announceHome(page, homeCacheNetwork.document)
  expect(await readHome(page, 5)).toEqual([2, 2, 2, 2, 2])
  expect(await readHome(page, 3)).toEqual([2, 2, 2])
  expect(homeCacheNetwork.reads).toBe(2)
})

test('Metadata que adelanta una respuesta pendiente impide publicar la copia anterior', async ({ page, homeCacheNetwork }) => {
  await page.goto('/')
  await expect(page.locator('.hero')).toBeVisible()
  let release!: () => void
  homeCacheNetwork.holdRead = new Promise<void>((resolve) => { release = resolve })
  await page.evaluate(async () => {
    const path = '/src/services/public-query-cache.ts'
    const { invalidatePublicQueryCache } = (await import(path)) as typeof import('../src/services/public-query-cache')
    invalidatePublicQueryCache()
  })
  const reading = readHome(page, 4)
  await expect.poll(() => homeCacheNetwork.reads).toBe(2)
  homeCacheNetwork.document = homeDocument(2)
  await announceHome(page, homeCacheNetwork.document)
  homeCacheNetwork.holdRead = null
  release()
  expect(await reading).toEqual([2, 2, 2, 2])
  expect(await readHome(page)).toEqual([2])
  expect(homeCacheNetwork.reads).toBe(3)
})

test('El bootstrap editorial reutiliza solo el segundo restante de su TTL original', async ({ page, homeCacheNetwork }) => {
  await page.addInitScript(() => {
    let now = 100000
    Object.defineProperty(window, '__homeCacheClock', {
      configurable: true,
      get: () => now,
      set: (value: number) => { now = value },
    })
    Date.now = () => now
    Object.defineProperty(performance, 'now', { configurable: true, value: () => 29000 })
  })
  const bootstrap = homeBootstrapJson(origin, homeCacheNetwork.document)!
  await page.route('**/', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback()
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: (await response.text()).replace('</head>', () =>
        `<script type="application/json" id="aroma-public-home">${bootstrap}</script></head>`,
      ),
    })
  })
  await page.goto('/')
  await expect(page.locator('.hero')).toBeVisible()
  expect(await readHome(page)).toEqual([1])
  expect(homeCacheNetwork.reads).toBe(0)
  await page.evaluate(() => { (window as unknown as { __homeCacheClock: number }).__homeCacheClock = 101000 })
  expect(await readHome(page)).toEqual([1])
  expect(homeCacheNetwork.reads).toBe(1)
})

test('Invalidar con bootstrap pendiente obliga a consultar el documento del nuevo epoch', async ({ page, homeCacheNetwork }) => {
  let release!: () => void
  homeCacheNetwork.holdCatalog = new Promise<void>((resolve) => { release = resolve })
  const bootstrap = homeBootstrapJson(origin, homeCacheNetwork.document)!
  await page.route('**/', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback()
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: (await response.text()).replace('</head>', () =>
        `<script type="application/json" id="aroma-public-home">${bootstrap}</script></head>`,
      ),
    })
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect.poll(async () => page.evaluate(() => document.getElementById('aroma-public-home') === null)).toBe(true)
  homeCacheNetwork.document = homeDocument(2)
  await page.evaluate(async () => {
    const path = '/src/services/public-query-cache.ts'
    const { invalidatePublicQueryCache } = (await import(path)) as typeof import('../src/services/public-query-cache')
    invalidatePublicQueryCache()
  })
  homeCacheNetwork.holdCatalog = null
  release()
  await expect(page.locator('.hero')).toBeVisible()
  expect(await readHome(page)).toEqual([2])
  expect(homeCacheNetwork.reads).toBe(1)
})
