import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import { loadEnv } from 'vite'
import { privilegedPublicValue } from './public-environment.mjs'

function secureOrigin(value) {
  try {
    const url = new URL(value)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.port ||
      !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(url.hostname) ||
      /^(?:\d+\.)+\d+$/.test(url.hostname) ||
      /(^|[.-])(localhost|local|invalid|example|test|staging|dev)([.-]|$)/i.test(
        url.hostname,
      )
    )
      return null
    return url.origin
  } catch {
    return null
  }
}

function publicKey(value) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value || '')) return true
  try {
    return (
      value.startsWith('eyJ') &&
      JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString())
        .role === 'anon'
    )
  } catch {
    return false
  }
}

/** Configuration-only, offline preflight. It never declares real payments ready. */
export function assessProductionConfiguration({ env, config }) {
  const checks = []
  const check = (code, valid, message) =>
    checks.push({
      code,
      status: valid ? 'pass' : 'blocked',
      message,
    })
  // Vars and R2 bindings are non-inheritable in Wrangler environments.
  const production = config.env?.production
  const vars = production?.vars || {}
  const staging = config.env?.staging
  check(
    'production-environment',
    Boolean(production),
    'Debe existir env.production explícito; no se utiliza la configuración raíz como alternativa.',
  )
  check(
    'environment-markers',
    Boolean(production) &&
      vars.APP_ENVIRONMENT === 'production' &&
      env.VITE_APP_ENV === 'production',
    'Frontend y Worker deben declarar production explícitamente.',
  )
  check(
    'worker-identity',
    Boolean(production?.name) &&
      ![config.name, staging?.name].includes(production.name) &&
      !/(^|[-_])(dev|staging|test)([-_]|$)/i.test(production.name),
    'Producción necesita un Worker identificado por separado de desarrollo y staging.',
  )
  const site = secureOrigin(env.VITE_SITE_URL)
  check(
    'public-domain',
    Boolean(site) &&
      !/\.(workers\.dev|r2\.dev|supabase\.co)$/.test(new URL(site).hostname) &&
      !site.includes('dominio-confirmado'),
    'Falta un dominio HTTPS definitivo, sin rutas ni valores de ejemplo.',
  )
  check(
    'catalog-source',
    env.VITE_CATALOG_SOURCE === 'supabase',
    'El catálogo comercial debe usar Supabase, sin fixtures locales.',
  )
  check(
    'public-key',
    publicKey(env.VITE_SUPABASE_PUBLISHABLE_KEY),
    'Hace falta una clave publicable o anon válida en la configuración pública.',
  )
  check(
    'public-secrets',
    !Object.entries(env).some(
      ([key, value]) =>
        key.startsWith('VITE_') && privilegedPublicValue(key, value),
    ),
    'Ninguna variable VITE_ puede contener credenciales privilegiadas.',
  )
  check(
    'server-secrets',
    !Object.entries(vars).some(
      ([key, value]) =>
        typeof value === 'string' && privilegedPublicValue(key, value),
    ),
    'Las credenciales de servidor deben configurarse como secretos, nunca como vars en Wrangler.',
  )
  const database = secureOrigin(env.VITE_SUPABASE_URL)
  const backendDatabase = secureOrigin(vars.SUPABASE_URL)
  const developmentDatabases = [
    config.vars?.SUPABASE_URL,
    staging?.vars?.SUPABASE_URL,
  ]
    .filter(Boolean)
    .map((value) => {
      try {
        return new URL(value).origin
      } catch {
        return value
      }
    })
  check(
    'database-isolation',
    Boolean(database) &&
      database === backendDatabase &&
      !developmentDatabases.includes(database),
    'Frontend y Worker deben usar el mismo proyecto, independiente de desarrollo y staging.',
  )
  const bucket = production?.r2_buckets?.find(
    (entry) => entry.binding === 'MEDIA_BUCKET',
  )
  const otherBuckets = [config, staging]
    .flatMap((entry) => entry?.r2_buckets || [])
    .map((entry) => entry.bucket_name)
  check(
    'media-isolation',
    Boolean(bucket?.bucket_name) &&
      !otherBuckets.includes(bucket.bucket_name) &&
      !/(^|[-_])(dev|staging|test)([-_]|$)/i.test(bucket.bucket_name),
    'MEDIA_BUCKET debe apuntar a un bucket propio de producción, no al de desarrollo.',
  )
  check(
    'simulation-disabled',
    Boolean(production) &&
      [undefined, 'false'].includes(vars.CHECKOUT_SIMULATION_ENABLED) &&
      !vars.CHECKOUT_SIMULATION_ORIGIN,
    'Producción no puede habilitar ni declarar un origen de checkout simulado.',
  )
  check(
    'api-origin',
    Boolean(site) &&
      (!env.VITE_MEDIA_API_BASE_URL ||
        secureOrigin(env.VITE_MEDIA_API_BASE_URL) === site),
    'La API debe compartir el dominio definitivo del Worker; no se reutiliza la API de staging.',
  )
  check(
    'static-media-origin',
    !env.VITE_MEDIA_BASE_URL,
    'No se activa una copia estática/CDN de medios sin una migración verificada.',
  )
  const allowedOrigins = (vars.MEDIA_ALLOWED_ORIGINS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
  check(
    'media-origins',
    Boolean(site) &&
      allowedOrigins.includes(site) &&
      allowedOrigins.every((value) => secureOrigin(value) === site),
    'Las cargas deben aceptar únicamente el dominio definitivo, sin localhost ni comodines.',
  )
  const routes = production?.routes || []
  check(
    'worker-domain',
    Boolean(site) &&
      routes.some(
        (route) =>
          typeof route === 'object' &&
          route.custom_domain === true &&
          route.pattern === new URL(site).hostname,
      ),
    'El entorno debe vincular explícitamente el dominio mediante una ruta custom_domain.',
  )
  check(
    'private-worker-urls',
    production?.workers_dev === false && production?.preview_urls === false,
    'La publicación debe usar el dominio configurado, sin URLs workers.dev o de vista previa públicas.',
  )
  const observation = production?.observability || config.observability
  const compatibilityFlags =
    production?.compatibility_flags || config.compatibility_flags || []
  check(
    'request-disconnect-signal',
    compatibilityFlags.includes('enable_request_signal') &&
      !compatibilityFlags.includes('disable_request_signal'),
    'El runtime debe propagar la desconexión del cliente sin retirar los plazos explícitos de las operaciones.',
  )
  check(
    'observability',
    observation?.enabled === true && observation?.traces?.enabled === true,
    'Deben conservarse logs y trazas del Worker, sin registrar credenciales o datos sensibles.',
  )
  check(
    'observability-query-redaction',
    observation?.redact_query_string === true,
    'Logs y trazas deben omitir los parámetros de URL, que pueden contener búsquedas o referencias privadas.',
  )
  check(
    'no-premature-indexing',
    env.VITE_ALLOW_INDEXING === 'false' && vars.SEO_ALLOW_INDEXING === 'false',
    'La indexación permanece cerrada hasta revisar contenido, rutas y condiciones comerciales.',
  )
  check(
    'seo-configuration-alignment',
    vars.SEO_ALLOW_INDEXING === env.VITE_ALLOW_INDEXING &&
      vars.SEO_CATALOG_IS_REAL === env.VITE_CATALOG_IS_REAL &&
      Boolean(site) &&
      secureOrigin(vars.SEO_SITE_URL) === site,
    'Frontend y Worker deben compartir dominio y banderas SEO explícitas; sitemap y metadatos usan la misma política.',
  )
  checks.push({
    code: 'live-environment-validation',
    status: 'pending',
    message:
      'La comprobación local no certifica Auth/MFA, RLS, medios ni respaldos alojados; consulta las evidencias del entorno independiente en PRODUCTION_PREPARATION.md.',
  })
  checks.push({
    code: 'real-payments',
    status: 'pending',
    message:
      'Mercado Pago real, eventos verificados e inventario/cupones transaccionales siguen pendientes; el checkout de producción continúa bloqueado.',
  })
  return {
    scope: 'offline-production-configuration',
    configurationReady: !checks.some((item) => item.status === 'blocked'),
    commercialReady: false,
    checks,
  }
}

export async function inspectProduction(directory = process.cwd()) {
  const content = await readFile(resolve(directory, 'wrangler.jsonc'), 'utf8')
  const parsed = ts.parseConfigFileTextToJson('wrangler.jsonc', content)
  if (parsed.error) throw new Error('invalid-worker-configuration')
  const env = loadEnv('production', directory, 'VITE_')
  return assessProductionConfiguration({ env, config: parsed.config })
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const result = await inspectProduction()
    if (process.argv.includes('--json'))
      console.log(JSON.stringify(result, null, 2))
    else {
      console.log(
        'Preparación de producción: comprobación local, sin despliegues ni cambios remotos.',
      )
      for (const item of result.checks)
        console.log(`[${item.status}] ${item.message}`)
      console.log(
        result.configurationReady
          ? 'Configuración preparada para validación alojada. Lanzamiento comercial pendiente.'
          : 'Publicación bloqueada: completa los puntos indicados antes de preparar el entorno real.',
      )
    }
    // A valid configuration alone never authorizes a commercial launch.
    process.exitCode =
      result.configurationReady && result.commercialReady ? 0 : 1
  } catch {
    // Do not echo parse errors, values or stack traces containing private configuration.
    console.error(
      'No se pudo comprobar la configuración de producción. Revisa wrangler.jsonc y los archivos de entorno.',
    )
    process.exitCode = 1
  }
}
