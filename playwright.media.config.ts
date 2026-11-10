import { defineConfig } from '@playwright/test'

// Real browser/SDK with controlled HTTP responses. No hosted credentials or R2
// bucket is used by this suite.
export default defineConfig({
  testDir: './tests',
  testMatch: 'r2-media-browser.spec.ts',
  reporter: 'list',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  outputDir: 'artifacts/r2-media-browser-results',
  use: {
    baseURL: 'http://127.0.0.1:5181',
    channel: 'chrome',
    trace: 'retain-on-failure',
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5181',
    url: 'http://127.0.0.1:5181',
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      VITE_CATALOG_SOURCE: 'supabase',
      VITE_MEDIA_API_BASE_URL: 'http://127.0.0.1:5181',
      VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-only',
    },
  },
})
