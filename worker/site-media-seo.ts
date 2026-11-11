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

type SiteMediaSeoEnvironment = Pick<
  Env,
  'SUPABASE_URL' | 'SUPABASE_PUBLISHABLE_KEY' | 'APP_ENVIRONMENT'
>

interface PublicSiteMedia {
  document: SiteMediaDocument
  aliases: Map<string, string>
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
  return async (
    response: Response,
    request: Request,
    env: SiteMediaSeoEnvironment,
  ): Promise<Response> => {
    if (
      request.method !== 'GET' ||
      response.status !== 200 ||
      !/^text\/html\b/i.test(response.headers.get('Content-Type') ?? '')
    )
      return response
    const key = `${env.APP_ENVIRONMENT}:${env.SUPABASE_URL}:${env.SUPABASE_PUBLISHABLE_KEY}`
    let content = cache.get(key)
    if (!content || content.expires <= now()) {
      try {
        const [document, aliases] = await Promise.all([
          readPublicCatalog(
            env,
            'site_media_document',
            {},
            transport,
            128 * 1024,
          ),
          readPublicCatalog(
            env,
            'public_media_aliases',
            {},
            transport,
            512 * 1024,
          ),
        ])
        content = {
          expires: now() + 30000,
          value: {
            document: parseSiteMediaDocument(document),
            aliases: parseAliases(aliases),
          },
        }
        if (cache.size >= 8) cache.delete(cache.keys().next().value!)
        cache.set(key, content)
      } catch {
        // A public metadata outage must not prevent rendering the storefront.
        return response
      }
    }
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
    const path = new URL(request.url).pathname.replace(/\/+$/, '') || '/'
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
    const rewriter = new HTMLRewriter()
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
    return rewriter.transform(
      new Response(response.body, { status: response.status, headers }),
    )
  }
}
