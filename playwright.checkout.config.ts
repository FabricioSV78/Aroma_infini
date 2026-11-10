import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: 'checkout-supabase.spec.ts',
  workers: 1,
  reporter: 'list',
  timeout: 45000,
  outputDir: 'artifacts/checkout-server-sdk-results',
  use: {
    baseURL: 'http://127.0.0.1:5192',
    channel: 'chrome',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5192',
    url: 'http://127.0.0.1:5192',
    reuseExistingServer: false,
    env: {
      VITE_CATALOG_SOURCE: 'supabase',
      VITE_MEDIA_API_BASE_URL: 'http://127.0.0.1:5192',
      VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-only',
    },
  },
})
