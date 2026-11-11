/** Offline/fixture suites only. Hosted probes, exports and deploys are never run. */
export const isolatedSuites = Object.freeze({
  contracts: [
    'playwright.media-worker.config.ts',
    'playwright.commerce-worker.config.ts',
    'playwright.push-worker.config.ts',
    'playwright.push-crypto.config.ts',
    'playwright.seo-worker.config.ts',
  ],
  'browser-core': [
    'playwright.config.ts',
    'playwright.families.config.ts',
    'playwright.sku.config.ts',
    'playwright.address-location.config.ts',
    'playwright.cleanup-local.config.ts',
    'playwright.admin-hero.config.ts',
    'playwright.hero-campaigns.config.ts',
  ],
  'browser-accounts': [
    'playwright.supabase.config.ts',
    'playwright.favorites.config.ts',
    'playwright.admin-notifications.config.ts',
    'playwright.site-settings.config.ts',
  ],
  'browser-commerce': [
    'playwright.catalog.config.ts',
    'playwright.checkout.config.ts',
    'playwright.orders.config.ts',
    'playwright.commerce-settings.config.ts',
    'playwright.media.config.ts',
    'playwright.video-preparation.config.ts',
    'playwright.home.config.ts',
    'playwright.reviews.config.ts',
    'playwright.complaints.config.ts',
    'playwright.cleanup.config.ts',
  ],
})

export function isolatedTestEnvironment(source = process.env) {
  const environment = Object.fromEntries(
    Object.entries(source).filter(
      ([name]) =>
        !/^(?:VITE_|SUPABASE_|CLOUDFLARE_|CF_|DATABASE_URL$|PG(?:HOST|PORT|USER|PASSWORD|DATABASE)$)/i.test(
          name,
        ),
    ),
  )
  // Process variables override Vite's .env.local without reading its secrets.
  // Each dedicated configuration may supply its own synthetic SDK fixture.
  return {
    ...environment,
    VITE_APP_ENV: 'development',
    VITE_CATALOG_SOURCE: 'local',
    VITE_SUPABASE_URL: '',
    VITE_SUPABASE_PUBLISHABLE_KEY: '',
    VITE_MEDIA_API_BASE_URL: '',
    VITE_MEDIA_BASE_URL: '',
    VITE_SITE_URL: '',
    VITE_ALLOW_INDEXING: 'false',
    VITE_CATALOG_IS_REAL: 'false',
    VITE_ADDRESS_MAP_TILE_URL: '',
    VITE_ADDRESS_MAP_ATTRIBUTION: '',
    AROMA_TEST_PORT: '5373',
    WRANGLER_WRITE_LOGS: 'false',
    WRANGLER_SEND_METRICS: 'false',
    DO_NOT_TRACK: '1',
  }
}

export function selectIsolatedSuites(group) {
  if (group === 'node') return []
  if (group === 'all') return Object.values(isolatedSuites).flat()
  if (!Object.hasOwn(isolatedSuites, group))
    throw new Error(`Unknown isolated test group: ${group}`)
  return isolatedSuites[group]
}
