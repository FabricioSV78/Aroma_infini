import { defineConfig } from '@playwright/test'

// SDK, HTTP and browser-permission contracts isolated from hosted accounts.
export default defineConfig({
  testDir: './tests',
  testMatch: 'admin-notifications.spec.ts',
  workers: 1,
  timeout: 45000,
  reporter: 'list',
  outputDir: 'artifacts/admin-notifications/test-results',
  use: {
    baseURL: 'http://127.0.0.1:5191',
    channel: 'chrome',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5191',
    url: 'http://127.0.0.1:5191',
    reuseExistingServer: false,
    env: {
      VITE_CATALOG_SOURCE: 'local',
      VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-only',
      VITE_MEDIA_API_BASE_URL: '',
    },
  },
})
