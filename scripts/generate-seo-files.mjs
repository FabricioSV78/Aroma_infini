import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import indexablePaths from '../src/seo/indexable-paths.json' with { type: 'json' }

const mode =
  process.env.NODE_ENV === 'development' ? 'development' : 'production'

function parseEnv(source) {
  const result = {}
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1)
    result[key] = value
  }
  return result
}

async function environment() {
  const files = ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]
  const values = {}
  for (const file of files) {
    if (!existsSync(file)) continue
    Object.assign(values, parseEnv(await readFile(file, 'utf8')))
  }
  return { ...values, ...process.env }
}

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

const env = await environment()
const indexingEnabled = env.VITE_ALLOW_INDEXING === 'true'
const rawSiteUrl = env.VITE_SITE_URL?.trim()
let origin = null

if (rawSiteUrl) {
  const url = new URL(rawSiteUrl)
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('VITE_SITE_URL debe usar http o https.')
  origin = url.origin
}

if (indexingEnabled && (!origin || /localhost|127\.0\.0\.1/.test(origin)))
  throw new Error(
    'Para habilitar la indexación configura VITE_SITE_URL con el dominio público definitivo.',
  )

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
