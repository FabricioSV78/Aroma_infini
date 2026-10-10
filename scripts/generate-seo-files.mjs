import { rm, writeFile } from 'node:fs/promises'
import indexablePaths from '../src/seo/indexable-paths.json' with { type: 'json' }
import { readSeoEnvironment } from './seo-environment.mjs'

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

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

if (indexingEnabled && origin) {
  const urls = indexablePaths
    .map(
      (path) =>
        `  <url><loc>${escapeXml(new URL(path, `${origin}/`).toString())}</loc></url>`,
    )
    .join('\n')
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
    '',
  ].join('\n')
  await writeFile('public/sitemap.xml', sitemap)
} else {
  await rm('public/sitemap.xml', { force: true })
}

console.log(
  indexingEnabled
    ? `SEO público preparado para ${origin}.`
    : 'SEO protegido: noindex activo y sitemap público omitido.',
)
