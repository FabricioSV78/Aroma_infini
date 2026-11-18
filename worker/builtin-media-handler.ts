import inventory from '../src/content/media-default-inventory.json' with { type: 'json' }
import {
  parseManagedMediaAsset,
  parseManagedSvgAsset,
  parseManagedVideoAsset,
} from '../src/domain/media'
import { readPublicCatalog } from './public-catalog-http'

type BuiltinMediaEnvironment = Pick<
  Env,
  'SUPABASE_URL' | 'SUPABASE_PUBLISHABLE_KEY'
> & {
  APP_ENVIRONMENT?: Env['APP_ENVIRONMENT']
  MEDIA_BUILTIN_STORAGE?: string
}

const originals = new Map(inventory.map((item) => [item.path, item]))

function unavailable(request: Request, status: number): Response {
  return new Response(request.method === 'HEAD' ? null : 'Recurso no disponible.', {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...(status === 405 ? { Allow: 'GET, HEAD' } : {}),
    },
  })
}

/** Original URLs resolve current references only; no publication decision is cached. */
export function createBuiltinMediaHandler({
  fetch: transport = fetch,
}: { fetch?: typeof fetch } = {}) {
  return async function builtinMediaRequest(
    request: Request,
    env: BuiltinMediaEnvironment,
  ): Promise<Response | null> {
    // Other environments keep their existing static delivery until migration is verified.
    if (env.MEDIA_BUILTIN_STORAGE !== 'r2') return null
    const original = originals.get(new URL(request.url).pathname)
    if (!original) return null
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return unavailable(request, 405)
    try {
      const value = await readPublicCatalog(
        env,
        'builtin_media_resolve',
        { p_path: original.path },
        transport,
        64 * 1024,
        10000,
        request.signal,
      )
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid builtin media resolution')
      const resolution = value as Record<string, unknown>
      if (typeof resolution.retired !== 'boolean')
        throw new Error('Invalid builtin media retirement')
      if (resolution.asset === null)
        return unavailable(request, resolution.retired ? 410 : 503)
      const asset =
        original.kind === 'svg'
          ? parseManagedSvgAsset(resolution.asset)
          : original.kind === 'video'
            ? parseManagedVideoAsset(resolution.asset)
            : parseManagedMediaAsset(resolution.asset)
      if (asset.width !== original.width || asset.height !== original.height)
        throw new Error('Builtin media dimensions changed')
      return new Response(null, {
        status: 302,
        headers: {
          Location: asset.src,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch {
      // A failed/malformed lookup must never fall back to retired bundled bytes.
      return unavailable(request, 503)
    }
  }
}
