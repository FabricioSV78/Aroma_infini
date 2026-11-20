import inventory from '../public/media-default-inventory.json' with { type: 'json' }
import {
  parseManagedMediaAsset,
  parseManagedSvgAsset,
  parseManagedVideoAsset,
} from '../src/domain/media'
import {
  parseSiteMediaDocument,
  resolveSiteMedia,
  type SiteMediaDocument,
  type SiteMediaSlot,
} from '../src/domain/site-media-slots'
import { readPublicCatalog } from './public-catalog-http'
import {
  initialCatalogProjection,
  readInitialPublicContext,
  readInitialSettings,
} from './public-initial-context'
import {
  parseMediaAliasDocument,
  type MediaAliasDocument,
} from '../src/services/media-alias-registry'
import {
  PUBLIC_MEDIA_BOOTSTRAP_ID,
  publicMediaBootstrapJson,
} from '../src/domain/public-media-bootstrap'
import { initialHomeMarkup, readInitialHome } from './home-initial'
import {
  HOME_BOOTSTRAP_ID,
  homeBootstrapJson,
} from '../src/domain/home-bootstrap'
import { publicDocumentTiming } from './public-document-timing'
import { publicInitialHeader } from './public-initial-header'
import { publicInitialVisual } from './public-initial-visual'

type SiteMediaSeoEnvironment = Pick<
  Env,
  'SUPABASE_URL' | 'SUPABASE_PUBLISHABLE_KEY' | 'APP_ENVIRONMENT'
>

interface PublicSiteMedia {
  document: SiteMediaDocument
  aliases: Map<string, string>
  aliasDocument: MediaAliasDocument
}

const originals = new Map(inventory.map((entry) => [entry.path, entry]))
const socialSlots: Readonly<Record<string, SiteMediaSlot>> = {
  '/': 'seo.home',
  '/tienda': 'seo.catalog',
  '/marcas': 'seo.brands',
}

/** Only the committed bootstrap inventory may replace a bundled source. */
function parseAliases(value: unknown): Map<string, string> {
  if (
    !value ||
    typeof value !== 'object' ||
    !('items' in value) ||
    !Array.isArray(value.items) ||
    value.items.length > inventory.length
  )
    throw new Error('Invalid public media aliases')
  const aliases = new Map<string, string>()
  for (const candidate of value.items) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
      throw new Error('Invalid public media alias')
    const item = candidate as Record<string, unknown>
    const original =
      typeof item.path === 'string' ? originals.get(item.path) : undefined
    if (!original || aliases.has(original.path))
      throw new Error('Invalid public media alias')
    const asset =
      original.kind === 'svg'
        ? parseManagedSvgAsset(item.asset)
        : original.kind === 'video'
          ? parseManagedVideoAsset(item.asset)
          : parseManagedMediaAsset(item.asset)
    if (asset.width !== original.width || asset.height !== original.height)
      throw new Error('Imported media dimensions changed')
    aliases.set(original.path, asset.src)
  }
  return aliases
}

function rewriteStructuredMedia(
  value: unknown,
  logo: string | undefined,
  alias: (source: string) => string,
): unknown {
  const rewrite = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return value
    const object = value as Record<string, unknown>
    const type = object['@type']
    const hasType = (name: string) =>
      type === name || (Array.isArray(type) && type.includes(name))
    if (hasType('Organization') && logo) return { ...object, logo }
    if (hasType('Product')) {
      if (typeof object.image === 'string')
        return { ...object, image: alias(object.image) }
      if (Array.isArray(object.image) && object.image.length <= 100)
        return {
          ...object,
          image: object.image.map((image) =>
            typeof image === 'string' ? alias(image) : image,
          ),
        }
    }
    return value
  }
  if (Array.isArray(value))
    return value.length <= 100 ? value.map(rewrite) : value
  const result = rewrite(value)
  if (!result || typeof result !== 'object' || Array.isArray(result))
    return result
  const object = result as Record<string, unknown>
  return Array.isArray(object['@graph']) && object['@graph'].length <= 100
    ? { ...object, '@graph': object['@graph'].map(rewrite) }
    : result
}

function attribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/** Buffer only the bounded JSON-LD script, while streaming the surrounding page.
 * Malformed or larger scripts pass through unchanged. */
function structuredMediaHandler(
  logo: string | undefined,
  alias: (source: string) => string,
): HTMLRewriterElementContentHandlers {
  let text = ''
  let bytes = 0
  let oversized = false
  return {
    element(element) {
      text = ''
      bytes = 0
      oversized = false
      element.onEndTag((end) => {
        if (oversized) return
        let content = text
        try {
          content = JSON.stringify(
            rewriteStructuredMedia(JSON.parse(text), logo, alias),
          ).replaceAll('<', '\\u003c')
        } catch {
          /* Keep an unrelated malformed script exactly as received. */
        }
        end.before(content, { html: true })
      })
    },
    text(chunk) {
      if (oversized) return
      const chunkBytes = new TextEncoder().encode(chunk.text).byteLength
      if (bytes + chunkBytes > 64 * 1024) {
        chunk.before(text, { html: true })
        text = ''
        oversized = true
        return
      }
      bytes += chunkBytes
      text += chunk.text
      chunk.remove()
    },
  }
}

/** Cache validated, public DTOs only. Request bodies, sessions and cross-request
 * I/O promises are never retained in the isolate. */
export function createSiteMediaSeoHandler(
  dependencies: {
    fetch?: typeof fetch
    now?: () => number
  } = {},
) {
  const transport = dependencies.fetch ?? fetch
  const now = dependencies.now ?? Date.now
  const cache = new Map<string, { expires: number; value: PublicSiteMedia }>()
  const handler = async (
    response: Response,
    request: Request,
    env: SiteMediaSeoEnvironment,
    prepared?: {
      settings: ReturnType<typeof readInitialSettings>
      diagnostics: ReturnType<typeof publicDocumentTiming>
      product?: unknown
    },
  ): Promise<Response> => {
    if (
      request.method !== 'GET' ||
      response.status !== 200 ||
      !/^text\/html\b/i.test(response.headers.get('Content-Type') ?? '')
    )
      return response
    const key = `${env.APP_ENVIRONMENT}:${env.SUPABASE_URL}:${env.SUPABASE_PUBLISHABLE_KEY}`
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/'
    const diagnostics =
      prepared?.diagnostics ??
      publicDocumentTiming(env.APP_ENVIRONMENT, env.SUPABASE_URL, transport)
    let content = cache.get(key)
    if (content && content.expires <= now()) content = undefined
    const media: Partial<PublicSiteMedia> = content ? { ...content.value } : {}
    const failures: string[] = []
    const contextStarted = performance.now()
    const streamInitial = Boolean(initialCatalogProjection(path))
    // Start fresh public reads immediately, but do not hold the head, Hero
    // hints, styles or modulepreloads behind them. Deferred module scripts run
    // after parsing, so the inert body-end projection remains available first.
    const initialPromise = readInitialPublicContext(
      request,
      env,
      diagnostics.fetch,
      prepared?.settings,
    ).catch(() => undefined)
    const [home] = await Promise.all([
      path === '/' ? readInitialHome(env, diagnostics.fetch) : undefined,
      (async () => {
        if (content) return
        // Optional metadata must not discard independent Home/catalog reads.
        // Keep each verified result request-local, and cache only a complete
        // pair. A missing part is not an empty successful projection.
        await Promise.all([
          (async () => {
            let phase = 'read'
            try {
              const value = await readPublicCatalog(
                env,
                'site_media_document',
                {},
                diagnostics.fetch,
                128 * 1024,
                1000,
              )
              phase = 'validation'
              media.document = parseSiteMediaDocument(value)
            } catch {
              failures.push(`site_media_document:${phase}`)
            }
          })(),
          (async () => {
            let phase = 'read'
            try {
              const value = await readPublicCatalog(
                env,
                'public_media_aliases',
                {},
                diagnostics.fetch,
                512 * 1024,
                1000,
              )
              phase = 'validation'
              const aliases = parseAliases(value)
              const aliasDocument = parseMediaAliasDocument(value)
              media.aliases = aliases
              media.aliasDocument = aliasDocument
            } catch {
              failures.push(`public_media_aliases:${phase}`)
            }
          })(),
        ])
        if (media.document && media.aliases && media.aliasDocument) {
          content = {
            expires: now() + 30000,
            value: {
              document: media.document,
              aliases: media.aliases,
              aliasDocument: media.aliasDocument,
            },
          }
          if (cache.size >= 8) cache.delete(cache.keys().next().value!)
          cache.set(key, content)
        }
      })(),
    ])
    // Preserve the existing complete-outage shell in production. Staging still
    // reports bounded technical diagnostics, without error bodies or sessions.
    if (
      !home &&
      !media.document &&
      !media.aliases &&
      env.APP_ENVIRONMENT !== 'staging'
    ) {
      const initial = await initialPromise
      if (!initial?.timings.length) return response
    }
    // The catalog experiment improved with early resource discovery. Product
    // pages did not: retain their simpler, measured head insertion path.
    const initialForHead = streamInitial ? undefined : await initialPromise
    const { document } = media
    const aliases = media.aliases ?? new Map<string, string>()
    const origin = new URL(request.url).origin
    const aliasImage = (source: string) => {
      try {
        const url = new URL(source, origin)
        if (
          url.origin !== origin ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          originals.get(url.pathname)?.kind === 'video'
        )
          return source
        const managed = aliases.get(url.pathname)
        return managed ? new URL(managed, origin).href : source
      } catch {
        return source
      }
    }
    const resolve = (slot: SiteMediaSlot) => {
      if (!document) return undefined
      const image = resolveSiteMedia(document, slot)
      // Without the complete public metadata, a bundled default may have been
      // retired. Use a configured verified asset or a verified imported alias;
      // never revive that default merely because an auxiliary read failed.
      if (
        !content &&
        !document.items.find((item) => item.slot === slot)?.asset &&
        !aliases.has(image.src)
      )
        return undefined
      return {
        ...image,
        src: new URL(aliases.get(image.src) ?? image.src, origin).href,
      }
    }
    const slot = socialSlots[path]
    const image = slot ? resolve(slot) : undefined
    const logo =
      resolve('identity.logo')?.src ?? aliases.get('/brand/logo-on-light.svg')
    // The existing request-scoped public DTOs supply the first paint. Never
    // initialize browser stores or add another catalog/authorization read.
    const visualEnabled =
      env.APP_ENVIRONMENT === 'staging' &&
      (streamInitial || Boolean(prepared?.product))
    function initialRoot(initial: Awaited<typeof initialPromise>) {
      if (!logo) return '<div id="root"></div>'
      const visual =
        visualEnabled
          ? publicInitialVisual({
              path: path + new URL(request.url).search,
              home,
              catalog:
                initial?.values.home ??
                (initial?.values.browse as { value?: unknown } | undefined)
                  ?.value,
              product: prepared?.product,
              aliases,
            })
          : ''
      if (!visual) return '<div id="root"></div>'
      const catalog = initial?.values.home
      const context =
        catalog && typeof catalog === 'object'
          ? (catalog as Record<string, unknown>)
          : undefined
      const announcement =
        context?.homeAnnouncement ?? home?.document.content.announcement
      const notice =
        announcement && typeof announcement === 'object'
          ? (announcement as Record<string, unknown>)
          : undefined
      const shipping =
        context?.shipping && typeof context.shipping === 'object'
          ? (context.shipping as Record<string, unknown>)
          : undefined
      const threshold = shipping?.freeThresholdCents
      const deliveryText =
        shipping?.provinceShippingEnabled === true &&
        notice?.deliveryText === 'Envíos en Lima y Callao'
          ? 'Envíos a todo el Perú'
          : notice?.deliveryText
      return `<div id="root" data-public-initial-path="${attribute(new URL(request.url).pathname + new URL(request.url).search)}"><div class="store-layout${path === '/' ? ' store-layout--home' : ''}" data-public-initial-visual>${publicInitialHeader({ home: path === '/', logo, announcement: notice && typeof deliveryText === 'string' && typeof notice.freeShippingLabel === 'string' && typeof threshold === 'number' ? { enabled: true, deliveryText, freeShippingLabel: notice.freeShippingLabel, thresholdCents: threshold } : undefined })}<main id="contenido" tabindex="-1">${visual}</main></div></div>`
    }
    const headers = new Headers(response.headers)
    for (const name of [
      'Content-Length',
      'Content-Encoding',
      'ETag',
      'Last-Modified',
    ])
      headers.delete(name)
    headers.set('Cache-Control', 'no-store')
    const publicReads = diagnostics.header()
    if (publicReads) headers.set('X-Aroma-Public-Reads', publicReads)
    if (env.APP_ENVIRONMENT === 'staging' && failures.length)
      headers.set('X-Aroma-Public-Fallback', failures.toSorted().join(', '))
    if (env.APP_ENVIRONMENT === 'staging')
      headers.append(
        'Server-Timing',
        `public_context;dur=${(performance.now() - contextStarted).toFixed(1)}`,
      )
    if (env.APP_ENVIRONMENT === 'staging' && initialForHead?.timings.length)
      headers.append('Server-Timing', initialForHead.timings.join(', '))
    const rewriter = new HTMLRewriter()
    if (visualEnabled)
      rewriter.on('#root', {
        element(element) {
          if (streamInitial) element.remove()
          else {
            // This response already awaited its matching product projection.
            // Preserve the one root rather than duplicate landmarks/IDs.
            element.replace(initialRoot(initialForHead), { html: true })
          }
        },
      })
    // The two browser consumers validate and consume their own fragment.
    // Omit a failed part rather than repeating an independent successful read
    // or seeding a fabricated empty document. Complete cached pairs retain
    // their original age; uncached fragments came from this request only.
    const bootstrap =
      (media.document || media.aliasDocument) &&
      publicMediaBootstrapJson(
        env.SUPABASE_URL,
        media.document,
        media.aliasDocument,
        content ? Math.max(0, 30000 - (content.expires - now())) : 0,
      )
    const backendOrigin = /^https:\/\/[a-z]{20}\.supabase\.co\/?$/.test(
      env.SUPABASE_URL,
    )
      ? env.SUPABASE_URL.replace(/\/$/, '')
      : undefined
    rewriter.on('head', {
      element(element) {
        // The initial public reads now happen at the edge. Keep the browser's
        // first subsequent SDK request from paying a cold TLS connection.
        // This opens only a connection to our existing essential backend.
        if (backendOrigin)
          element.append(
            `<link rel="preconnect" href="${attribute(backendOrigin)}" crossorigin>`,
            { html: true },
          )
        if (initialForHead?.timings.length)
          element.append(initialForHead.markup, { html: true })
        if (home) {
          // A failed alias lookup must not preload a retired builtin. Preserve
          // the valid Home DTO so React does not repeat its successful read.
          const json =
            !media.aliases && homeBootstrapJson(env.SUPABASE_URL, home.raw)
          element.append(
            media.aliases
              ? initialHomeMarkup(home, env.SUPABASE_URL, aliases)
              : json
                ? `<script type="application/json" id="${HOME_BOOTSTRAP_ID}">${json}</script>`
                : '',
            { html: true },
          )
        }
        // SVG identity has no raster srcset ambiguity; configured bitmaps keep
        // the image component's existing adaptive candidate selection.
        if (logo && new URL(logo, origin).pathname.endsWith('.svg'))
          element.append(
            `<link rel="preload" as="image" href="${attribute(logo)}" fetchpriority="high">`,
            { html: true },
          )
        if (bootstrap)
          element.append(
            `<script type="application/json" id="${PUBLIC_MEDIA_BOOTSTRAP_ID}">${bootstrap}</script>`,
            { html: true },
          )
      },
    })
    if (streamInitial)
      rewriter.on('body', {
        element(element) {
          element.onEndTag((end) => {
            end.remove()
          })
        },
      })
    if (streamInitial)
      rewriter.on('html', {
        element(element) {
          element.onEndTag((end) => {
            end.remove()
          })
        },
      })
    if (image) {
      const tags = [
        ['property', 'og:image', image.src],
        ['property', 'og:image:alt', image.alt],
        ['property', 'og:image:width', String(image.width)],
        ['property', 'og:image:height', String(image.height)],
        ['name', 'twitter:image', image.src],
        ['name', 'twitter:image:alt', image.alt],
        ['name', 'twitter:card', 'summary_large_image'],
      ] as const
      const seen = new Set<string>()
      for (const [attributeName, name, value] of tags)
        rewriter.on(`head meta[${attributeName}="${name}"]`, {
          element(element) {
            seen.add(name)
            element.setAttribute('content', value)
          },
        })
      rewriter.on('head', {
        element(element) {
          element.onEndTag((end) => {
            for (const [attributeName, name, value] of tags)
              if (!seen.has(name))
                end.before(
                  `<meta ${attributeName}="${name}" content="${attribute(value)}">`,
                  { html: true },
                )
          })
        },
      })
      rewriter.on('head meta[property="og:image:secure_url"]', {
        element(element) {
          element.setAttribute('content', image.src)
        },
      })
      rewriter.on('head meta[property="og:image:type"]', {
        element(element) {
          element.setAttribute('content', 'image/webp')
        },
      })
    } else {
      for (const selector of [
        'head meta[property="og:image"]',
        'head meta[property="og:image:secure_url"]',
        'head meta[name="twitter:image"]',
      ])
        rewriter.on(selector, {
          element(element) {
            const source = element.getAttribute('content')
            if (source) element.setAttribute('content', aliasImage(source))
          },
        })
    }
    rewriter.on(
      'head script[type="application/ld+json"]',
      structuredMediaHandler(logo, aliasImage),
    )
    const shell = rewriter.transform(
      new Response(response.body, { status: response.status, headers }),
    )
    if (!streamInitial) return shell
    const reader = shell.body!.getReader()
    // These owned documents have canonical body/html end tags. Stream the
    // complete shell first, then the inert projection and those end tags. An
    // async HTMLRewriter handler retains a small input chunk until it settles;
    // pumping the shell avoids holding its styles and preload hints that way.
    let shellComplete = false
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          if (!shellComplete) {
            const chunk = await reader.read()
            if (!chunk.done) {
              controller.enqueue(chunk.value)
              return
            }
            shellComplete = true
          }
          const initial = await initialPromise
          controller.enqueue(
            new TextEncoder().encode(
              (initial?.timings.length ? initial.markup : '') +
                (visualEnabled ? initialRoot(initial) : '') +
                '</body></html>',
            ),
          )
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
      cancel(reason) {
        return reader.cancel(reason)
      },
    })
    return new Response(body, { status: shell.status, headers: shell.headers })
  }
  return Object.assign(handler, {
    prepareSettings(request: Request, env: SiteMediaSeoEnvironment) {
      const url = new URL(request.url)
      const product = url.pathname.match(
        /^\/producto\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/,
      )
      // No speculative reads for arbitrary, private, filtered or malformed URLs.
      // A syntactically valid missing product may incur this one public read;
      // the caller cancels it when SEO resolves to a non-success response.
      if (
        request.method !== 'GET' ||
        url.search.length > 8192 ||
        !product ||
        product[1].length > 512
      )
        return undefined
      const cancel = new AbortController()
      const scopedRequest = new Request(request, {
        signal: AbortSignal.any([request.signal, cancel.signal]),
      })
      const diagnostics = publicDocumentTiming(
        env.APP_ENVIRONMENT,
        env.SUPABASE_URL,
        transport,
      )
      return {
        diagnostics,
        settings: readInitialSettings(scopedRequest, env, diagnostics.fetch),
        cancel: () => cancel.abort(),
      }
    },
  })
}
