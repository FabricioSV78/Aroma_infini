import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: [
    'hero-multimedia.spec.ts',
    'hero.spec.ts',
    'hero-rotation.spec.ts',
    'hero-compositions.spec.ts',
  ],
  reporter: 'list',
  workers: 1,
  timeout: 45000,
  outputDir: 'artifacts/hero-campaigns-2026-11-04/playback-results',
  use: {
    baseURL: 'http://127.0.0.1:5194',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    // Fake-clock playback checks must not reload when another audit task edits
    // a source file. The normal Vite config/plugins still load for this server.
    command: `node --input-type=module -e "import { createServer } from 'vite'; const server = await createServer({server:{host:'127.0.0.1',port:5194,strictPort:true,hmr:false,watch:null}}); await server.listen();"`,
    url: 'http://127.0.0.1:5194',
    reuseExistingServer: false,
    env: { VITE_CATALOG_SOURCE: 'local', VITE_MEDIA_API_BASE_URL: '' },
  },
})
