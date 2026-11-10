import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: 'admin-hero-campaigns.spec.ts',
  outputDir: 'artifacts/hero-campaigns-2026-11-04/admin-test-results',
  workers: 1,
  reporter: 'list',
  timeout: 60000,
  use: {
    baseURL: 'http://127.0.0.1:5197',
    channel: 'chrome',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5197',
    url: 'http://127.0.0.1:5197',
    reuseExistingServer: false,
    env: { VITE_CATALOG_SOURCE: 'local' },
  },
})
