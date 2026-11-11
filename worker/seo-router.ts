import { classifyRoute } from './route-policy'
import { createMediaHandler, cleanupMedia } from './media-handler'
import { createCheckoutHandler } from './checkout-handler'
import { createCatalogSeoHandler } from './catalog-seo'
import { createSitemapHandler } from './sitemap'
import { createSiteMediaSeoHandler } from './site-media-seo'
import { createComplaintsHandler } from './complaints-handler'
import { createAdminPushHandler, dispatchAdminPush } from './admin-push-handler'
import { createAdminDeviceHandler } from './admin-device-handler'
import {
  seoPageRobots,
  seoPublicationOrigin,
} from '../src/domain/seo-publication'

const checkoutRequest = createCheckoutHandler()
const catalogSeoRequest = createCatalogSeoHandler()
const sitemapRequest = createSitemapHandler()
const siteMediaSeo = createSiteMediaSeoHandler()
const complaintsRequest = createComplaintsHandler()
const adminPushRequest = createAdminPushHandler()
const adminDeviceRequest = createAdminDeviceHandler()

// SEO, ordinary page requests and cleanup do not need the image decoder.
// Load it only after the upload handler has authorized and bounded the file.
const mediaRequest = createMediaHandler({
  async decodeWebp(bytes) {
    const { decodeWebp } = await import('./media-codec')
    return decodeWebp(bytes)
  },
})

function assetUrl(request: Request, pathname: string) {
  const url = new URL(request.url)
  url.pathname = pathname
  url.search = ''
  return url
}

async function withPagePolicy(
  response: Response,
  status: number,
  request: Request,
  env: Env,
  indexable = false,
  follow = false,
) {
  const url = new URL(request.url)
  const publicationOrigin = seoPublicationOrigin(
    {
      environment: env.APP_ENVIRONMENT,
      allowIndexing: env.SEO_ALLOW_INDEXING,
      catalogIsReal: env.SEO_CATALOG_IS_REAL,
      siteUrl: env.SEO_SITE_URL,
      supabaseUrl: env.SUPABASE_URL,
    },
    url.origin,
  )
  const robots = seoPageRobots(Boolean(publicationOrigin), {
    status,
    indexable,
    follow,
  })
  const headers = new Headers(response.headers)
  headers.set('X-Robots-Tag', robots.split(',').join(', '))
  const transformHtml =
    publicationOrigin &&
    /^text\/html\b/i.test(headers.get('Content-Type') ?? '')
  if (transformHtml) {
    for (const key of [
      'Content-Length',
      'ETag',
      'Last-Modified',
      'Content-Encoding',
    ])
      headers.delete(key)
    headers.set('Cache-Control', 'no-store')
  }
  if (request.method === 'HEAD') {
    await response.body?.cancel()
    return new Response(null, { status, headers })
  }
  if (transformHtml) {
    const page = new HTMLRewriter()
      .on('head meta[name="robots"]', {
        element(element) {
          element.setAttribute('content', robots)
        },
      })
      .transform(new Response(response.body, { status, headers }))
    return classifyRoute(url.pathname) === 'public'
      ? siteMediaSeo(page, request, env)
      : page
  }
  return new Response(response.body, { status, headers })
}

export default {
  async fetch(request, env): Promise<Response> {
    const adminDevice = await adminDeviceRequest(request, env)
    if (adminDevice) return adminDevice
    const adminPush = await adminPushRequest(request, env)
    if (adminPush) return adminPush
    const complaint = await complaintsRequest(request, env)
    if (complaint) return complaint
    const checkout = await checkoutRequest(request, env)
    if (checkout) return checkout
    const media = await mediaRequest(request, env)
    if (media) return media
    const sitemap = await sitemapRequest(request, env)
    if (sitemap) return sitemap
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return new Response('Método no permitido', {
        status: 405,
        headers: { Allow: 'GET, HEAD' },
      })

    const url = new URL(request.url)
    if (url.pathname === '/catalogo') {
      const destination = assetUrl(request, '/tienda')
      destination.search = url.search
      destination.hash = url.hash
      return Response.redirect(destination.toString(), 308)
    }

    const catalogPage = await catalogSeoRequest(request, env)
    if (catalogPage) return siteMediaSeo(catalogPage, request, env)

    if (url.pathname === '/tienda') {
      const asset = await env.ASSETS.fetch(request)
      const response = asset.ok
        ? asset
        : await env.ASSETS.fetch(assetUrl(request, '/__app_shell'))
      return withPagePolicy(response, 200, request, env, !url.search, true)
    }

    const kind = classifyRoute(url.pathname)
    if (kind === 'public' || kind === 'app') {
      const asset = await env.ASSETS.fetch(request)
      if (asset.ok)
        return withPagePolicy(
          asset,
          asset.status,
          request,
          env,
          kind === 'public' && !url.search,
          kind === 'public',
        )
      const shell = await env.ASSETS.fetch(assetUrl(request, '/__app_shell'))
      return withPagePolicy(
        shell,
        200,
        request,
        env,
        kind === 'public' && !url.search,
        kind === 'public',
      )
    }

    if (kind === 'candidate') {
      // Invalid multi-segment/empty slugs remain outside the public catalog.
      const shell = await env.ASSETS.fetch(assetUrl(request, '/__app_shell'))
      return withPagePolicy(shell, 404, request, env)
    }

    const notFound = await env.ASSETS.fetch(assetUrl(request, '/404'))
    return withPagePolicy(notFound, 404, request, env)
  },
  async scheduled(event, env) {
    // One-minute outbox ticks; bounded media cleanup every five minutes.
    const results = await Promise.allSettled([
      dispatchAdminPush(env),
      ...(new Date(event.scheduledTime).getUTCMinutes() % 5 === 3 &&
      env.SUPABASE_MEDIA_SECRET_KEY
        ? [cleanupMedia(env)]
        : []),
    ])
    if (results.some((result) => result.status === 'rejected'))
      console.warn(
        JSON.stringify({
          event: 'scheduled_job_failed',
          count: results.filter((result) => result.status === 'rejected')
            .length,
        }),
      )
  },
} satisfies ExportedHandler<Env>
