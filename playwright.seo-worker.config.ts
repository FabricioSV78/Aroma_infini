import { defineConfig } from '@playwright/test'

// Native workerd HTMLRewriter with isolated public RPCs; no hosted writes.
export default defineConfig({
  testDir: './tests',
  testMatch: [
    'catalog-seo-worker.spec.ts',
    'sitemap-worker.spec.ts',
    'site-media-seo-worker.spec.ts',
    'home-initial-worker.spec.ts',
    'public-route-hints-worker.spec.ts',
    'public-initial-worker.spec.ts',
    'public-document-timing.spec.ts',
    'public-parallel-settings.spec.ts',
    'public-initial-visual-worker.spec.ts',
  ],
  reporter: 'list',
  workers: 1,
  timeout: 60000,
  outputDir: 'artifacts/catalog-seo-worker-results',
})
