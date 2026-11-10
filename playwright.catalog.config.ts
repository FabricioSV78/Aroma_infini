import { defineConfig } from '@playwright/test'

// Real SDK and application adapters; every Supabase request is intercepted by
// the test fixture and cannot reach the hosted development project.
export default defineConfig({
  testDir: './tests',
  testMatch: 'supabase-catalog.spec.ts',
  outputDir: 'artifacts/supabase-catalog-test-results',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5177',
    channel: 'chrome',
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5177',
    url: 'http://127.0.0.1:5177',
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      VITE_CATALOG_SOURCE: 'supabase',
      VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-only',
    },
  },
})
