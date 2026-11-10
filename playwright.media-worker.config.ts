import { defineConfig } from '@playwright/test'

// Pure domain and server boundary tests; no browser, credentials or remote bucket.
export default defineConfig({
  testDir: './tests',
  testMatch: [
    'home-content-contract.spec.ts',
    'hero-campaign-content.spec.ts',
    'r2-media-worker.spec.ts',
    'media-upload-domain.spec.ts',
    'r2-media-worker-performance.spec.ts',
    'r2-media-worker-runtime.spec.ts',
    'worker-disconnect.spec.ts',
    'r2-media-home.spec.ts',
    'r2-media-mp4.spec.ts',
    'public-query-cache.spec.ts',
  ],
  reporter: 'list',
  workers: 1,
  timeout: 60000,
  outputDir: 'artifacts/r2-media-worker-results',
})
