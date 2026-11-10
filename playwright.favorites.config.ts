import { defineConfig } from '@playwright/test'

// Real SDK/application adapters; every backend request is isolated by fixtures.
export default defineConfig({
  testDir: './tests',
  testMatch: 'favorites-supabase.spec.ts',
  workers: 1,
  reporter: 'list',
  timeout: 45000,
  outputDir: 'artifacts/favorites-supabase-results',
  use: {
    baseURL: 'http://127.0.0.1:5193',
    channel: 'chrome',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5193',
    url: 'http://127.0.0.1:5193',
    reuseExistingServer: false,
    env: {
      VITE_CATALOG_SOURCE: 'supabase',
      VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-only',
    },
  },
})
