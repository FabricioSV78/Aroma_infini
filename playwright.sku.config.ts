import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: ['variant-skus.spec.ts', 'product-auto-sku.spec.ts'],
  reporter: 'list',
  workers: 1,
  timeout: 45000,
  outputDir: 'artifacts/sku-audit-2026-10-29/browser-results',
  use: {
    baseURL: 'http://127.0.0.1:5182',
    channel: 'chrome',
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5182',
    url: 'http://127.0.0.1:5182',
    reuseExistingServer: false,
    env: { VITE_CATALOG_SOURCE: 'local' },
  },
})
