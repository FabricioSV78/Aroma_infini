import { defineConfig } from '@playwright/test'

function isolatedAuthServer(port: number) {
  return {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      AROMA_TEST_PORT: String(port),
      VITE_CATALOG_SOURCE: 'local',
      VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-only',
    },
  }
}

// Real SDK/adapters with isolated HTTP fixtures; never target hosted users.
export default defineConfig({
  testDir: './tests',
  projects: [
    {
      name: 'sdk-and-offline-recovery',
      testMatch: [
        'supabase-auth.spec.ts',
        'supabase-account.spec.ts',
        'supabase-auth-races.spec.ts',
        'admin-trusted-devices.spec.ts',
        'account-email-change.spec.ts',
        'offline-account-recovery-ui.spec.ts',
      ],
      use: { baseURL: 'http://127.0.0.1:5175' },
    },
    {
      name: 'current-email-policy',
      testMatch: 'auth-email-policy.spec.ts',
      use: { baseURL: 'http://127.0.0.1:5176' },
    },
  ],
  outputDir: 'artifacts/supabase-sdk-test-results',
  fullyParallel: false,
  timeout: 45000,
  workers: 1,
  reporter: 'list',
  use: {
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  // Verify the current UI and account recovery implementation without mail.
  // Neither server contacts a real Supabase project or delivers messages.
  webServer: [isolatedAuthServer(5175), isolatedAuthServer(5176)],
})
