import { defineConfig } from '@playwright/test'

// Isolated account fixture and synthetic map tiles: no hosted users or GPS data.
export default defineConfig({
  testDir: './tests',
  testMatch: 'address-location.spec.ts',
  reporter: 'list',
  workers: 1,
  timeout: 45000,
  outputDir: 'artifacts/address-location-2026-11-04/test-results',
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
    env: { VITE_CATALOG_SOURCE: 'local' },
  },
})
