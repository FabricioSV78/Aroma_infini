import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: ['complaints-worker.spec.ts', 'complaints-browser.spec.ts'],
  workers: 1,
  reporter: 'list',
  timeout: 45000,
  outputDir: 'artifacts/complaints-results',
  use: {
    baseURL: 'http://127.0.0.1:5203',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5203',
    url: 'http://127.0.0.1:5203',
    reuseExistingServer: false,
    env: {
      VITE_APP_ENV: 'development',
      VITE_CATALOG_SOURCE: 'supabase',
      VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-only',
      VITE_MEDIA_API_BASE_URL: 'http://127.0.0.1:5203',
    },
  },
})
