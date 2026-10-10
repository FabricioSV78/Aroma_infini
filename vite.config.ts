import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const robots =
    env.VITE_ALLOW_INDEXING === 'true'
      ? 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
      : 'noindex,nofollow'
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'seo-index-defaults',
        transformIndexHtml(html) {
          return html.replace('__SEO_ROBOTS__', robots)
        },
      },
    ],
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
