import { defineConfig } from '@playwright/test'

// No network credentials, hosted orders or push-provider messages are used.
export default defineConfig({
  testDir: './tests',
  testMatch: [
    'admin-device-worker.spec.ts',
    'admin-push-worker.spec.ts',
    'admin-push-crypto.spec.ts',
    'admin-pwa-contract.spec.ts',
    'admin-push-workerd.spec.ts',
  ],
  reporter: 'list',
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  outputDir: 'artifacts/admin-push-worker-results',
})
