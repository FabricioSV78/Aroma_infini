import { defineConfig } from '@playwright/test'

// Real SDK/browser contracts; HTTP fixtures intercept every backend request.
export default defineConfig({
  testDir: './tests',
  testMatch: 'r2-home-browser.spec.ts',
  workers: 1,
  reporter: 'list',
  timeout: 60000,
  outputDir: 'artifacts/r2-home-browser-results',
  use: {
    baseURL: 'http://127.0.0.1:5186',
    channel: 'chrome',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5186',
    url: 'http://127.0.0.1:5186',
    reuseExistingServer: false,
    env: {
      VITE_CATALOG_SOURCE: 'supabase',
      VITE_MEDIA_API_BASE_URL: 'https://media-home-fixture.invalid',
      VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-only',
    },
  },
})
