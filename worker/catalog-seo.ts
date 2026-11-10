import {
  brandPageMetadata,
  productPageMetadata,
  shareableProductImage,
  type CatalogPageMetadata,
} from '../src/seo/catalog-metadata'
import {
  parseManagedMediaAsset,
  parseManagedMediaPath,
} from '../src/domain/media'
import {
  seoPageRobots,
  seoPublicationOrigin,
} from '../src/domain/seo-publication'
import { readPublicCatalog } from './public-catalog-http'

type SeoEnvironment = Pick<
  Env,
  | 'ASSETS'
  | 'SUPABASE_URL'
  | 'SUPABASE_PUBLISHABLE_KEY'
  | 'APP_ENVIRONMENT'
  | 'SEO_ALLOW_INDEXING'
  | 'SEO_CATALOG_IS_REAL'
  | 'SEO_SITE_URL'
>
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const uuidPattern =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('catalog-document')
  return value as Record<string, unknown>
}
function text(value: unknown, maximum: number, empty = false): string {
  if (
    typeof value !== 'string' ||
    value.length > maximum ||
    (!empty && !value.trim())
  )
    throw new Error('catalog-text')
  return value
}
function slug(value: unknown): string {
  const result = text(value, 512)
  if (!slugPattern.test(result)) throw new Error('catalog-slug')
  return result
}
function uuid(value: unknown): string {
  const result = text(value, 36)
  if (!uuidPattern.test(result)) throw new Error('catalog-id')
  return result
}
function brands(value: unknown) {
  if (!Array.isArray(value) || value.length > 10000)
    throw new Error('catalog-brands')
  return value.map((entry) => {
    const brand = object(entry)
    return {
      id: uuid(brand.id),
      name: text(brand.name, 160),
      slug: slug(brand.slug),
    }
  })
}
function productImage(
  record: Record<string, unknown>,
  image: unknown,
): string | undefined {
  const source = text(image, 1000, true)
  if (source.startsWith('/media/')) {
    const path = parseManagedMediaPath(source)
    if (
      !path ||
      !Array.isArray(record.mediaAssets) ||
      record.mediaAssets.length > 100
    )
      throw new Error('catalog-image')
    const asset = record.mediaAssets.find(
      (candidate) => object(candidate).src === source,
    )
    if (!asset || parseManagedMediaAsset(asset).src !== source)
      throw new Error('catalog-image')
    return source
  }
  // Legacy local resources are public; arbitrary external URLs and drafts are not.
  if (/^(?:\/images\/[a-z0-9-]+\.webp|[a-z0-9-]+)$/i.test(source))
    return shareableProductImage(source)
  return undefined
}
function productMetadata(
  value: unknown,
  requestedSlug: string,
): CatalogPageMetadata | null {
  const context = object(value)
  if (context.record === null) return null
  const record = object(context.record),
    product = object(record.product),
    detail = object(record.detail)
  uuid(product.id)
  const productSlug = slug(product.slug)
  if (productSlug !== requestedSlug) throw new Error('catalog-slug')
  const brandId = product.brandId === '' ? '' : uuid(product.brandId)
  const brand = brands(context.brands).find((entry) => entry.id === brandId)
  return productPageMetadata({
    name: text(product.name, 240),
    brandName: brand?.name,
    slug: productSlug,
    description: text(detail.shortDescription, 10000, true),
    imagePath: productImage(record, product.image),
  })
}
function errorMetadata(status: 404 | 503): CatalogPageMetadata {
  return {
    title:
      status === 404
        ? 'Página no encontrada | Aroma Infini'
        : 'Página no disponible | Aroma Infini',
    description:
      status === 404
        ? 'No encontramos esta página en Aroma Infini.'
        : 'No pudimos cargar esta página. Vuelve a intentarlo en unos momentos.',
    canonicalPath: null,
    type: 'website',
  }
}
function escape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
function headMarkup(
  metadata: CatalogPageMetadata,
  origin: string,
  robots: string,
) {
  const meta = (
    attribute: 'name' | 'property',
    key: string,
    value: string,
    managed = false,
  ) =>
    `<meta ${attribute}="${key}" content="${escape(value)}"${managed ? ' data-seo-managed="true"' : ''}>`
  let result =
    `<title>${escape(metadata.title)}</title>` +
    meta('name', 'description', metadata.description) +
    meta('name', 'robots', robots) +
    meta('property', 'og:locale', 'es_PE') +
    meta('property', 'og:site_name', 'Aroma Infini') +
    meta('property', 'og:title', metadata.title) +
    meta('property', 'og:description', metadata.description) +
    meta('property', 'og:type', metadata.type) +
    meta(
      'name',
      'twitter:card',
      metadata.imagePath ? 'summary_large_image' : 'summary',
    ) +
    meta('name', 'twitter:title', metadata.title) +
    meta('name', 'twitter:description', metadata.description)
  if (metadata.canonicalPath) {
    const canonical = escape(new URL(metadata.canonicalPath, origin).href)
    result +=
      `<link rel="canonical" href="${canonical}" data-seo-managed="true">` +
      `<link rel="alternate" hreflang="es-PE" href="${canonical}" data-seo-managed="true">` +
      `<link rel="alternate" hreflang="x-default" href="${canonical}" data-seo-managed="true">` +
      meta(
        'property',
        'og:url',
        new URL(metadata.canonicalPath, origin).href,
        true,
      )
  }
  if (metadata.imagePath) {
    const image = new URL(metadata.imagePath, origin).href
    result +=
      meta('property', 'og:image', image, true) +
      meta('name', 'twitter:image', image, true) +
      meta(
        'property',
        'og:image:alt',
        metadata.imageAlt ?? 'Aroma Infini',
        true,
      ) +
      meta(
        'name',
        'twitter:image:alt',
        metadata.imageAlt ?? 'Aroma Infini',
        true,
      )
  }
  return result
}
async function render(
  request: Request,
  env: SeoEnvironment,
  metadata: CatalogPageMetadata,
  status: number,
) {
  const requestUrl = new URL(request.url)
  const publicationOrigin = seoPublicationOrigin(
    {
      environment: env.APP_ENVIRONMENT,
      allowIndexing: env.SEO_ALLOW_INDEXING,
      catalogIsReal: env.SEO_CATALOG_IS_REAL,
      siteUrl: env.SEO_SITE_URL,
      supabaseUrl: env.SUPABASE_URL,
    },
    requestUrl.origin,
  )
  const robots = seoPageRobots(Boolean(publicationOrigin), {
    status,
    indexable: Boolean(metadata.canonicalPath) && !requestUrl.search,
    follow: Boolean(metadata.canonicalPath),
  })
  const location = new URL('/__app_shell', request.url)
  const shell = await env.ASSETS.fetch(new Request(location, { method: 'GET' }))
  const headers = new Headers(shell.headers)
  for (const key of [
    'Content-Length',
    'ETag',
    'Last-Modified',
    'Content-Encoding',
    'Link',
  ])
    headers.delete(key)
  headers.set('Cache-Control', 'no-store')
  headers.set('X-Robots-Tag', robots.split(',').join(', '))
  if (
    !shell.ok ||
    !/^text\/html\b/i.test(shell.headers.get('Content-Type') ?? '')
  ) {
    await shell.body?.cancel()
    headers.set('Content-Type', 'text/plain; charset=utf-8')
    return new Response(
      request.method === 'HEAD' ? null : 'Página no disponible.',
      { status: 503, headers },
    )
  }
  if (request.method === 'HEAD') {
    await shell.body?.cancel()
    return new Response(null, { status, headers })
  }
  const rewriter = new HTMLRewriter()
  const names = [
    'description',
    'robots',
    'twitter:card',
    'twitter:title',
    'twitter:description',
    'twitter:image',
    'twitter:image:alt',
  ]
  const properties = [
    'og:locale',
    'og:site_name',
    'og:title',
    'og:description',
    'og:type',
    'og:url',
    'og:image',
    'og:image:alt',
    'og:image:width',
    'og:image:height',
    'og:image:type',
    'og:image:secure_url',
  ]
  for (const selector of [
    'head title',
    'head link[rel="canonical"]',
    'head link[rel="alternate"]',
    'head script[type="application/ld+json"]',
    ...names.map((name) => `head meta[name="${name}"]`),
    ...properties.map((property) => `head meta[property="${property}"]`),
  ])
    rewriter.on(selector, {
      element(element) {
        element.remove()
      },
    })
  rewriter.on('head', {
    element(element) {
      element.append(
        headMarkup(metadata, publicationOrigin ?? requestUrl.origin, robots),
        {
          html: true,
        },
      )
    },
  })
  return rewriter.transform(new Response(shell.body, { status, headers }))
}

/** Public metadata only. Never uses a session, privileged key or image decoder. */
export function createCatalogSeoHandler(
  dependencies: { fetch?: typeof fetch } = {},
) {
  const transport = dependencies.fetch ?? fetch
  return async (
    request: Request,
    env: SeoEnvironment,
  ): Promise<Response | null> => {
    if (!['GET', 'HEAD'].includes(request.method)) return null
    const url = new URL(request.url)
    const direct = url.pathname.match(/^\/(producto|marcas)\/([^/]+)\/?$/)
    const selected = url.searchParams.getAll('marca')
    const filtered =
      url.pathname === '/tienda' &&
      selected.length === 1 &&
      [...url.searchParams.keys()].every((key) => key === 'marca') &&
      selected[0].length <= 512 &&
      slugPattern.test(selected[0])
    if (!direct && !filtered) return null
    const requested = direct ? direct[2] : selected[0]
    if (requested.length > 512 || !slugPattern.test(requested))
      return render(request, env, errorMetadata(404), 404)
    if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY)
      return filtered ? null : render(request, env, errorMetadata(404), 404)
    let metadata: CatalogPageMetadata | null,
      status = 200
    try {
      const endpoint =
        direct?.[1] === 'producto'
          ? 'catalog_product_context'
          : 'catalog_brands'
      const document = await readPublicCatalog(
        env,
        endpoint,
        endpoint === 'catalog_product_context' ? { p_slug: requested } : {},
        transport,
      )
      if (endpoint === 'catalog_product_context')
        metadata = productMetadata(document, requested)
      else {
        const brand = brands(document).find((entry) => entry.slug === requested)
        if (!brand && filtered) return null
        metadata = brand ? brandPageMetadata(brand) : null
      }
      if (!metadata) {
        metadata = errorMetadata(404)
        status = 404
      }
    } catch {
      metadata = errorMetadata(503)
      status = 503
    }
    return render(request, env, metadata, status)
  }
}
