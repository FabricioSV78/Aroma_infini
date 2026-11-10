import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: [
    'seo.spec.ts',
    'seo-routing.spec.ts',
    'order-pdf-generator.spec.ts',
    'editorial-reviews.spec.ts',
  ],
  workers: 1,
  timeout: 45000,
  reporter: 'list',
  outputDir: 'artifacts/interface-cleanup-local-results',
  use: {
    baseURL: 'http://127.0.0.1:5198',
    channel: 'chrome',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5198',
    url: 'http://127.0.0.1:5198',
    reuseExistingServer: false,
    env: { VITE_APP_ENV: 'development', VITE_CATALOG_SOURCE: 'local' },
  },
})
