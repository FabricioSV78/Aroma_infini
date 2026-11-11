import { defineConfig } from '@playwright/test'

const port = Number(process.env.AROMA_TEST_PORT ?? 5173)
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('AROMA_TEST_PORT must be a valid unprivileged TCP port.')
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './tests',
  testIgnore: [
    '**/r2-media-svg.spec.ts',
    '**/*.test.mjs',
    '**/supabase-auth.spec.ts',
    '**/supabase-account.spec.ts',
    '**/supabase-auth-races.spec.ts',
    '**/admin-trusted-devices.spec.ts',
    '**/auth-email-policy.spec.ts',
    '**/account-email-change.spec.ts',
    '**/offline-account-recovery-ui.spec.ts',
    '**/supabase-catalog.spec.ts',
    '**/r2-media-browser.spec.ts',
    '**/media-alias.spec.ts',
    '**/admin-media-library.spec.ts',
    '**/native-video-preparation.spec.ts',
    '**/r2-home-browser.spec.ts',
    '**/orders-supabase.spec.ts',
    '**/commerce-settings-browser.spec.ts',
    '**/checkout-supabase.spec.ts',
    '**/favorites-supabase.spec.ts',
    '**/interface-cleanup.spec.ts',
    '**/product-reviews-remote.spec.ts',
    '**/complaints-browser.spec.ts',
    '**/site-settings.spec.ts',
    // Uses the real SDK with an isolated project/permission server on 5191.
    // Keep it in test:push:browser instead of this local-fixture suite.
    '**/admin-notifications.spec.ts',
  ],
  fullyParallel: false,
  reporter: 'list',
  outputDir: 'artifacts/test-results',
  use: {
    baseURL,
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    // Do not inherit a developer's live/staging Auth or media configuration.
    env: {
      VITE_APP_ENV: 'development',
      VITE_CATALOG_SOURCE: 'local',
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_PUBLISHABLE_KEY: '',
      VITE_MEDIA_API_BASE_URL: '',
    },
  },
})
