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
import { publicDocumentTiming } from './public-document-timing'

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
  logo: string,
  alias: (source: string) => string,
): unknown {
  const rewrite = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return value
    const object = value as Record<string, unknown>
    const type = object['@type']
    const hasType = (name: string) =>
      type === name || (Array.isArray(type) && type.includes(name))
    if (hasType('Organization')) return { ...object, logo }
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
  logo: string,
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
    const diagnostics = prepared?.diagnostics ?? publicDocumentTiming(env.APP_ENVIRONMENT, env.SUPABASE_URL, transport)
    let content = cache.get(key)
    const contextStarted = performance.now()
    const streamInitial = Boolean(initialCatalogProjection(path))
    let home: Awaited<ReturnType<typeof readInitialHome>>
    // Start fresh public reads immediately, but do not hold the head, Hero
    // hints, styles or modulepreloads behind them. Deferred module scripts run
    // after parsing, so the inert body-end projection remains available first.
    const initialPromise = readInitialPublicContext(
      request,
      env,
      diagnostics.fetch,
      prepared?.settings,
    ).catch(() => undefined)
    try {
      ;[home] = await Promise.all([
        path === '/' ? readInitialHome(env, diagnostics.fetch) : undefined,
        (async () => {
          if (content && content.expires > now()) return
          const [document, aliases] = await Promise.all([
            readPublicCatalog(
              env,
              'site_media_document',
              {},
              diagnostics.fetch,
              128 * 1024,
              1000,
            ),
            readPublicCatalog(
              env,
              'public_media_aliases',
              {},
              diagnostics.fetch,
              512 * 1024,
              1000,
            ),
          ])
          content = {
            expires: now() + 30000,
            value: {
              document: parseSiteMediaDocument(document),
              aliases: parseAliases(aliases),
              aliasDocument: parseMediaAliasDocument(aliases),
            },
          }
          if (cache.size >= 8) cache.delete(cache.keys().next().value!)
          cache.set(key, content)
        })(),
      ])
    } catch {
      // A public metadata outage must not prevent rendering the storefront.
      return response
    }
    if (!content) return response
    // The catalog experiment improved with early resource discovery. Product
    // pages did not: retain their simpler, measured head insertion path.
    const initialForHead = streamInitial ? undefined : await initialPromise
    const { document, aliases } = content.value
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
      const image = resolveSiteMedia(document, slot)
      return {
        ...image,
        src: new URL(aliases.get(image.src) ?? image.src, origin).href,
      }
    }
    const slot = socialSlots[path]
    const image = slot ? resolve(slot) : undefined
    const logo = resolve('identity.logo').src
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
    if (env.APP_ENVIRONMENT === 'staging')
      headers.append(
        'Server-Timing',
        `public_context;dur=${(performance.now() - contextStarted).toFixed(1)}`,
      )
    if (env.APP_ENVIRONMENT === 'staging' && initialForHead?.timings.length)
      headers.append('Server-Timing', initialForHead.timings.join(', '))
    const rewriter = new HTMLRewriter()
    const bootstrap = publicMediaBootstrapJson(
      env.SUPABASE_URL,
      document,
      content.value.aliasDocument,
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
        if (home)
          element.append(initialHomeMarkup(home, env.SUPABASE_URL, aliases), {
            html: true,
          })
        // SVG identity has no raster srcset ambiguity; configured bitmaps keep
        // the image component's existing adaptive candidate selection.
        if (new URL(logo).pathname.endsWith('.svg'))
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
      const product = url.pathname.match(/^\/producto\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/)
      // No speculative reads for arbitrary, private, filtered or malformed URLs.
      // A syntactically valid missing product may incur this one public read;
      // the caller cancels it when SEO resolves to a non-success response.
      if (request.method !== 'GET' || url.search.length > 8192 ||
          !product || product[1].length > 512) return undefined
      const cancel = new AbortController()
      const scopedRequest = new Request(request, {
        signal: AbortSignal.any([request.signal, cancel.signal]),
      })
      const diagnostics = publicDocumentTiming(env.APP_ENVIRONMENT, env.SUPABASE_URL, transport)
      return {
        diagnostics,
        settings: readInitialSettings(scopedRequest, env, diagnostics.fetch),
        cancel: () => cancel.abort(),
      }
    },
  })
}
