import indexablePaths from '../src/seo/indexable-paths.json' with { type: 'json' }
import { seoPublicationOrigin } from '../src/domain/seo-publication'
import { readPublicCatalog } from './public-catalog-http'

type SitemapEnvironment = Pick<
  Env,
  | 'APP_ENVIRONMENT'
  | 'SUPABASE_URL'
  | 'SUPABASE_PUBLISHABLE_KEY'
  | 'SEO_ALLOW_INDEXING'
  | 'SEO_CATALOG_IS_REAL'
  | 'SEO_SITE_URL'
>
const productsPerShard = 100
// Existing public RPC accepts offsets up to 100000, inclusive. Never truncate.
const maximumProducts = 100100
const maximumBytes = 8 * 1024 * 1024
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function escape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
function sourceSlug(value: unknown) {
  if (
    typeof value !== 'string' ||
    value.length > 512 ||
    !slugPattern.test(value)
  )
    throw new Error('sitemap-slug')
  return value
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('sitemap-document')
  return value as Record<string, unknown>
}
function products(value: unknown, limit: number, offset: number) {
  const data = record(value)
  if (
    !Number.isSafeInteger(data.total) ||
    typeof data.total !== 'number' ||
    data.total < 0 ||
    data.total > maximumProducts ||
    !Array.isArray(data.items) ||
    data.items.length !== Math.max(0, Math.min(limit, data.total - offset))
  )
    throw new Error('sitemap-page')
  const slugs = data.items.map((item) =>
    sourceSlug(record(record(item).product).slug),
  )
  if (new Set(slugs).size !== slugs.length)
    throw new Error('sitemap-duplicates')
  return { total: data.total, slugs }
}
function xml(paths: string[], origin: string, index = false) {
  const tag = index ? 'sitemap' : 'url'
  const root = index ? 'sitemapindex' : 'urlset'
  const body = paths
    .map(
      (path) =>
        `<${tag}><loc>${escape(new URL(path, origin).href)}</loc></${tag}>`,
    )
    .join('\n')
  const document = `<?xml version="1.0" encoding="UTF-8"?>\n<${root} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</${root}>\n`
  if (new TextEncoder().encode(document).byteLength > maximumBytes)
    throw new Error('sitemap-size')
  return document
}
function response(
  request: Request,
  body: string,
  status: number,
  type = 'text/plain; charset=utf-8',
) {
  return new Response(request.method === 'HEAD' ? null : body, {
    status,
    headers: {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
      ...(status === 405 ? { Allow: 'GET, HEAD' } : {}),
    },
  })
}

/** Current public catalog only. One bounded read per dynamic shard, no writes. */
export function createSitemapHandler(
  dependencies: { fetch?: typeof fetch } = {},
) {
  const transport = dependencies.fetch ?? fetch
  return async (
    request: Request,
    env: SitemapEnvironment,
  ): Promise<Response | null> => {
    const url = new URL(request.url)
    if (
      url.pathname !== '/robots.txt' &&
      !/^\/sitemap(?:[.-]|$)/.test(url.pathname)
    )
      return null
    if (!['GET', 'HEAD'].includes(request.method))
      return response(request, 'Método no permitido.', 405)
    const origin = seoPublicationOrigin(
      {
        environment: env.APP_ENVIRONMENT,
        allowIndexing: env.SEO_ALLOW_INDEXING,
        catalogIsReal: env.SEO_CATALOG_IS_REAL,
        siteUrl: env.SEO_SITE_URL,
        supabaseUrl: env.SUPABASE_URL,
      },
      url.origin,
    )
    if (url.pathname === '/robots.txt')
      return response(
        request,
        `User-agent: *\nAllow: /\n${origin ? `\nSitemap: ${origin}/sitemap.xml\n` : ''}`,
        200,
      )
    if (!origin || url.search)
      return response(request, 'Página no encontrada.', 404)
    try {
      let paths: string[],
        index = false
      if (url.pathname === '/sitemap.xml') {
        const page = products(
          await readPublicCatalog(
            env,
            'catalog_products',
            { p_limit: 1, p_offset: 0 },
            transport,
            maximumBytes,
          ),
          1,
          0,
        )
        paths = [
          '/sitemap-pages.xml',
          '/sitemap-brands.xml',
          ...Array.from(
            { length: Math.ceil(page.total / productsPerShard) },
            (_, position) => `/sitemap-products-${position + 1}.xml`,
          ),
        ]
        index = true
      } else if (url.pathname === '/sitemap-pages.xml') {
        if (
          new Set(indexablePaths).size !== indexablePaths.length ||
          indexablePaths.some((path) => !/^\/(?:[a-z0-9-]+)?$/.test(path))
        )
          throw new Error('sitemap-paths')
        paths = indexablePaths
      } else if (url.pathname === '/sitemap-brands.xml') {
        const data = await readPublicCatalog(
          env,
          'catalog_brands',
          {},
          transport,
          maximumBytes,
        )
        if (!Array.isArray(data) || data.length > 10000)
          throw new Error('sitemap-brands')
        paths = data.map((brand) => `/marcas/${sourceSlug(record(brand).slug)}`)
        if (new Set(paths).size !== paths.length)
          throw new Error('sitemap-duplicates')
      } else {
        const match = url.pathname.match(
          /^\/sitemap-products-([1-9][0-9]{0,3})\.xml$/,
        )
        if (!match || Number(match[1]) > maximumProducts / productsPerShard)
          return response(request, 'Página no encontrada.', 404)
        const offset = (Number(match[1]) - 1) * productsPerShard
        const page = products(
          await readPublicCatalog(
            env,
            'catalog_products',
            { p_limit: productsPerShard, p_offset: offset },
            transport,
            maximumBytes,
          ),
          productsPerShard,
          offset,
        )
        if (offset >= page.total)
          return response(request, 'Página no encontrada.', 404)
        paths = page.slugs.map((slug) => `/producto/${slug}`)
      }
      return response(
        request,
        xml(paths, origin, index),
        200,
        'application/xml; charset=utf-8',
      )
    } catch {
      return response(
        request,
        'No pudimos generar el sitemap. Vuelve a intentarlo.',
        503,
      )
    }
  }
}
