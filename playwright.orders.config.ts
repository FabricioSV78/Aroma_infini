import { defineConfig } from '@playwright/test'

// Application/SDK tests with isolated HTTP only; no hosted accounts or orders.
export default defineConfig({
  testDir: './tests',
  testMatch: ['order-remote-domain.spec.ts', 'orders-supabase.spec.ts'],
  workers: 1,
  reporter: 'list',
  timeout: 60000,
  outputDir: 'artifacts/orders-supabase-results',
  use: {
    baseURL: 'http://127.0.0.1:5189',
    channel: 'chrome',
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5189',
    url: 'http://127.0.0.1:5189',
    reuseExistingServer: false,
    env: {
      VITE_CATALOG_SOURCE: 'supabase',
      VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-only',
    },
  },
})
