import { rm, writeFile } from 'node:fs/promises'
import indexablePaths from '../src/seo/indexable-paths.json' with { type: 'json' }
import { readSeoEnvironment } from './seo-environment.mjs'

const env = await readSeoEnvironment()
const indexingEnabled = env.VITE_ALLOW_INDEXING === 'true'
const catalogIsReal = env.VITE_CATALOG_IS_REAL === 'true'
const rawSiteUrl = env.VITE_SITE_URL?.trim()
let origin = null

if (rawSiteUrl) {
  const url = new URL(rawSiteUrl)
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('VITE_SITE_URL debe usar http o https.')
  origin = url.origin
}

if (
  indexingEnabled &&
  (!origin || /localhost|127\.0\.0\.1|dominio-confirmado\.pe/.test(origin))
)
  throw new Error(
    'Para habilitar la indexación configura VITE_SITE_URL con el dominio público definitivo, no el valor de ejemplo.',
  )

if (indexingEnabled && !catalogIsReal)
  throw new Error(
    'No se puede indexar el catálogo de muestra. Confirma datos comerciales reales y configura VITE_CATALOG_IS_REAL=true.',
  )

if (new Set(indexablePaths).size !== indexablePaths.length)
  throw new Error('La lista de rutas SEO contiene duplicados.')
if (indexablePaths.some((path) => !path.startsWith('/') || path.includes('?')))
  throw new Error('El sitemap solo puede incluir rutas canónicas limpias.')

const robots = [
  'User-agent: *',
  'Allow: /',
  ...(indexingEnabled && origin ? ['', `Sitemap: ${origin}/sitemap.xml`] : []),
  '',
].join('\n')
await writeFile('public/robots.txt', robots)

// The Worker owns the live index and catalog shards. Never publish a stale
// build-time snapshot that omits products created later in the admin panel.
await rm('public/sitemap.xml', { force: true })

console.log(
  indexingEnabled
    ? `Robots preparado para ${origin}; el Worker controla el sitemap dinámico.`
    : 'SEO protegido: noindex activo y sitemap público omitido.',
)
