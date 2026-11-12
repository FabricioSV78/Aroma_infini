import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createBuildTarget } from './scripts/build-identity.ts'
import { privilegedPublicValue } from './scripts/public-environment.mjs'
import { viteTestCache } from './scripts/vite-test-cache.mjs'
import {
  INDEXABLE_ROBOTS,
  PRIVATE_ROBOTS,
  seoPublicationOrigin,
} from './src/domain/seo-publication.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // VITE values become public JavaScript. Reject privileged keys before Vite
  // can inline them, rather than relying on a runtime check after publication.
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('VITE_')) continue
    if (privilegedPublicValue(name, value))
      throw new Error(
        'Las credenciales de servidor no pueden utilizarse en variables VITE_.',
      )
  }
  const robots =
    mode === 'production' &&
    env.VITE_CATALOG_SOURCE === 'supabase' &&
    seoPublicationOrigin(
      {
        environment: env.VITE_APP_ENV,
        allowIndexing: env.VITE_ALLOW_INDEXING,
        catalogIsReal: env.VITE_CATALOG_IS_REAL,
        siteUrl: env.VITE_SITE_URL,
        supabaseUrl: env.VITE_SUPABASE_URL,
      },
      env.VITE_SITE_URL,
    )
      ? INDEXABLE_ROBOTS
      : PRIVATE_ROBOTS
  return {
    plugins: [
      viteTestCache(),
      react(),
      tailwindcss(),
      {
        name: 'seo-index-defaults',
        transformIndexHtml(html) {
          return html.replace('__SEO_ROBOTS__', robots)
        },
      },
      {
        name: 'build-environment-identity',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: '_build-target.json',
            source: JSON.stringify(createBuildTarget(mode, env)),
          })
        },
      },
    ],
    define: {
      'import.meta.env.VITE_APP_ENV': JSON.stringify(
        env.VITE_APP_ENV ||
          (mode === 'staging'
            ? 'staging'
            : mode === 'development'
              ? 'development'
              : 'production'),
      ),
    },
    // Keep the lazy admin codec available without a development-server reload
    // during the first video upload. Production still loads it on demand.
    optimizeDeps: { include: ['mediabunny'] },
    server: {
      port: 5173,
      strictPort: true,
      allowedHosts: ['.trycloudflare.com'],
      watch: {
        ignored: ['**/artifacts/**'],
      },
    },
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'react-vendor',
                test: /[\\/]node_modules[\\/](?:react|react-dom|react-router)/,
              },
            ],
          },
        },
      },
    },
  }
})
