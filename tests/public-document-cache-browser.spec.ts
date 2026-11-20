import type { Page } from '@playwright/test'
import { DEFAULT_OLFACTORY_FAMILIES } from '../src/domain/olfactory-family'
import { defaultSiteSettings } from '../src/domain/site-settings'
import { publicMediaBootstrapJson } from '../src/domain/public-media-bootstrap'
import { expect, fixtureProject, test as authTest } from './supabase-auth-fixture'

const origin = `https://${fixtureProject}.supabase.co`
const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST,OPTIONS' }
const documents = ['site_settings', 'site_media_document', 'public_media_aliases']
interface CacheNetwork { reads: Record<string, number>; version: number; fail: boolean; invalid: boolean }
const test = authTest.extend<{ cacheNetwork: CacheNetwork }>({
  cacheNetwork: async ({ context, supabaseNetwork }, runFixture) => {
    void supabaseNetwork
    const state: CacheNetwork = { reads: {}, version: 1, fail: false, invalid: false }
    await context.addInitScript(() => {
      let now = Date.now()
      Object.defineProperty(window, '__documentClock', { get: () => now, set: (value: number) => { now = value } })
      Date.now = () => now
    })
    await context.route(`${origin}/rest/v1/rpc/*`, async route => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)!
      if (![...documents, 'catalog_settings', 'catalog_brands'].includes(name)) return route.fallback()
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
      if (documents.includes(name)) {
        state.reads[name] = (state.reads[name] ?? 0) + 1
        if (state.fail) return route.fulfill({ status: 503, json: { code: 'unavailable' }, headers })
        if (state.invalid) return route.fulfill({ json: {}, headers })
        return route.fulfill({ headers, json: name === 'site_settings'
          ? { version: state.version, data: defaultSiteSettings() } : { items: [] } })
      }
      return route.fulfill({ headers, json: name === 'catalog_brands' ? [] : {
        brands: [], features: { complementsEnabled: false }, featuredBrandId: null,
        olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES, homeAnnouncement: null,
        homeVersion: 0, shipping: null, shippingVersion: 0,
      } })
    })
    await runFixture(state)
  },
})

async function read(page: Page, force = false, count = 1) {
  return page.evaluate(async ({ force, count }) => {
    const settingsPath = '/src/services/site-settings-service.ts', mediaPath = '/src/services/site-media-service.ts', aliasesPath = '/src/services/builtin-media-service.ts'
    const [{ siteSettingsService }, { siteMediaService }, { builtinMediaService }] = await Promise.all([
      import(settingsPath) as Promise<typeof import('../src/services/site-settings-service')>,
      import(mediaPath) as Promise<typeof import('../src/services/site-media-service')>,
      import(aliasesPath) as Promise<typeof import('../src/services/builtin-media-service')>,
    ])
    const result = await Promise.all(Array.from({ length: count }, () => Promise.all([
      siteSettingsService.load(force), siteMediaService.load(force), builtinMediaService.load(force),
    ])))
    return result.map(([settings]) => settings.version)
  }, { force, count })
}

test('Tres documentos públicos comparten HIT, vencen y agrupan la renovación', async ({ page, cacheNetwork }) => {
  await page.goto('/contacto')
  await expect(page.locator('main h1')).toHaveText('Contacto')
  expect(await read(page, false, 8)).toEqual(Array(8).fill(1))
  expect(documents.map(name => cacheNetwork.reads[name])).toEqual([1, 1, 1])
  cacheNetwork.version = 2
  await page.evaluate(() => {
    const clock = window as unknown as { __documentClock: number }
    clock.__documentClock += 30000
  })
  expect(await read(page, false, 8)).toEqual(Array(8).fill(2))
  expect(documents.map(name => cacheNetwork.reads[name])).toEqual([2, 2, 2])
})

test('Los errores no se cachean y una renovación explícita vuelve a consultar', async ({ page, cacheNetwork }) => {
  await page.goto('/contacto')
  await expect(page.locator('main h1')).toHaveText('Contacto')
  await read(page)
  cacheNetwork.fail = true
  await expect(read(page, true)).rejects.toThrow()
  cacheNetwork.fail = false
  cacheNetwork.version = 2
  expect(await read(page)).toEqual([2])
  expect(documents.map(name => cacheNetwork.reads[name])).toEqual([3, 3, 3])
})

test('La edad del Worker no reinicia otros treinta segundos al recibir el HTML', async ({ page, cacheNetwork }) => {
  await page.addInitScript(() => {
    Object.defineProperty(performance, 'now', { configurable: true, value: () => 0 })
  })
  const bootstrap = publicMediaBootstrapJson(origin, { items: [] }, { items: [] }, 29000)!
  await page.route('**/contacto', async route => {
    if (route.request().resourceType() !== 'document') return route.fallback()
    const response = await route.fetch()
    await route.fulfill({ response, body: (await response.text()).replace('</head>', () =>
      `<script id="aroma-public-media" type="application/json">${bootstrap}</script></head>`) })
  })
  await page.goto('/contacto')
  await expect(page.locator('main h1')).toHaveText('Contacto')
  await read(page)
  expect(cacheNetwork.reads.site_media_document ?? 0).toBe(0)
  expect(cacheNetwork.reads.public_media_aliases ?? 0).toBe(0)
  await page.evaluate(() => {
    const clock = window as unknown as { __documentClock: number }
    clock.__documentClock += 1000
  })
  await read(page)
  expect(cacheNetwork.reads.site_media_document).toBe(1)
  expect(cacheNetwork.reads.public_media_aliases).toBe(1)
})

test('Un documento HTTP 200 malformado se descarta y permite recuperar la versión siguiente', async ({ page, cacheNetwork }) => {
  await page.goto('/contacto')
  await expect(page.locator('main h1')).toHaveText('Contacto')
  await read(page)
  cacheNetwork.invalid = true
  await expect(page.evaluate(async () => {
    const path = '/src/services/site-settings-service.ts'
    return (await import(path)).siteSettingsService.load(true)
  })).rejects.toThrow()
  cacheNetwork.invalid = false
  cacheNetwork.version = 2
  expect(await read(page)).toEqual([2])
  expect(cacheNetwork.reads.site_settings).toBe(3)
})

test('Una publicación invalida otras pestañas sin enviar contenido ni repetir señales', async ({ page, context, cacheNetwork }) => {
  await page.goto('/contacto')
  await expect(page.locator('main h1')).toHaveText('Contacto')
  await read(page)
  const other = await context.newPage()
  await other.goto('/contacto')
  await expect(other.locator('main h1')).toHaveText('Contacto')
  await read(other)
  cacheNetwork.version = 2
  await page.evaluate(() => {
    const channel = new BroadcastChannel(`aroma-public-publication:${'https://abcdefghijklmnopqrst.supabase.co'}`)
    channel.postMessage({ prices: 'ignored', authenticated: true })
    channel.close()
  })
  expect(await read(other)).toEqual([1])
  await page.evaluate(async () => {
    const path = '/src/services/public-query-cache.ts'
    const { invalidatePublicQueryCache } = await import(path) as typeof import('../src/services/public-query-cache')
    invalidatePublicQueryCache(true)
  })
  await expect.poll(async () => (await read(other))[0]).toBe(2)
  expect(await read(page)).toEqual([2])
  const before = { ...cacheNetwork.reads }
  expect(await read(other, false, 5)).toEqual(Array(5).fill(2))
  expect(cacheNetwork.reads).toEqual(before)
})
