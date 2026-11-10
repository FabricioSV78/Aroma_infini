import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: 'interface-cleanup.spec.ts',
  workers: 1,
  reporter: 'list',
  timeout: 45000,
  outputDir: 'artifacts/interface-cleanup-results',
  use: {
    baseURL: 'http://127.0.0.1:5196',
    channel: 'chrome',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5196',
    url: 'http://127.0.0.1:5196',
    reuseExistingServer: false,
    env: {
      VITE_APP_ENV: 'production',
      VITE_CATALOG_SOURCE: 'local',
      VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-only',
    },
  },
})
