import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: [
    'checkout-worker.spec.ts',
    'commerce-settings-contract.spec.ts',
    'order-remote-domain.spec.ts',
    'checkout-server-contract.spec.ts',
    'runtime-policy.spec.ts',
  ],
  workers: 1,
  reporter: 'list',
  outputDir: 'artifacts/commerce-contract-results',
})
