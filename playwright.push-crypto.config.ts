import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  testMatch: ['admin-push-crypto.spec.ts', 'admin-pwa-contract.spec.ts'],
  workers: 1,
  reporter: 'list',
  outputDir: 'artifacts/admin-push/crypto-results',
})
