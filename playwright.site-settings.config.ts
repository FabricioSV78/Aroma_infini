import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: ['site-settings.spec.ts', 'contact-qr-domain.spec.ts'],
  workers: 1,
  reporter: 'list',
  timeout: 45000,
  outputDir: 'artifacts/site-settings-results',
  use: {
    baseURL: 'http://127.0.0.1:5202',
    channel: 'chrome',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5202',
    url: 'http://127.0.0.1:5202',
    reuseExistingServer: false,
    env: {
      VITE_CATALOG_SOURCE: 'supabase',
      VITE_APP_ENV: 'test',
      VITE_SITE_URL: '',
      VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-only',
    },
  },
})
