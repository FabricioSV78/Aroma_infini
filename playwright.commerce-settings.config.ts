import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: 'commerce-settings-browser.spec.ts',
  workers: 1,
  reporter: 'list',
  timeout: 45000,
  outputDir: 'artifacts/commerce-settings-browser-results',
  use: {
    baseURL: 'http://127.0.0.1:5191',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5191',
    url: 'http://127.0.0.1:5191',
    reuseExistingServer: false,
    env: {
      VITE_CATALOG_SOURCE: 'supabase',
      VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-only',
    },
  },
})
