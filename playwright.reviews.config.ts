import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: ['product-reviews-remote.spec.ts', 'review-content.spec.ts'],
  workers: 1,
  reporter: 'list',
  timeout: 45000,
  outputDir: 'artifacts/product-reviews-results',
  use: {
    baseURL: 'http://127.0.0.1:5194',
    channel: 'chrome',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5194',
    url: 'http://127.0.0.1:5194',
    reuseExistingServer: false,
    env: {
      VITE_CATALOG_SOURCE: 'supabase',
      VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-only',
    },
  },
})
