import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: 'native-video-preparation.spec.ts',
  reporter: 'list',
  workers: 1,
  timeout: 120000,
  outputDir: 'artifacts/native-video-preparation-results',
  use: {
    baseURL: 'http://127.0.0.1:5199',
    channel: 'chrome',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5199',
    url: 'http://127.0.0.1:5199',
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      VITE_APP_ENV: 'development',
      VITE_CATALOG_SOURCE: 'local',
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_PUBLISHABLE_KEY: '',
      VITE_MEDIA_API_BASE_URL: '',
    },
  },
})
