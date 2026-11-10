import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: 'olfactory-family-management.spec.ts',
  reporter: 'list',
  workers: 1,
  timeout: 45000,
  outputDir: 'artifacts/olfactory-management-2026-10-29/test-results',
  use: {
    baseURL: 'http://127.0.0.1:5183',
    channel: 'chrome',
    reducedMotion: 'reduce',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5183',
    url: 'http://127.0.0.1:5183',
    reuseExistingServer: false,
    env: { VITE_CATALOG_SOURCE: 'local' },
  },
})
