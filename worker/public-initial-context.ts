import { catalogRequestQuery, PAGE_SIZE } from '../src/domain/catalog-query'
import {
  PUBLIC_INITIAL_CONTEXT_ID,
  publicInitialContextJson,
} from '../src/domain/public-initial-context'
import { readPublicCatalog } from './public-catalog-http'
import { classifyRoute } from './route-policy'
import { catalogImageHint } from './catalog-image-hint'

export function initialCatalogProjection(path: string) {
  if (path === '/') return 'home'
  if (
    ['/tienda', '/buscar'].includes(path) ||
    /^\/marcas\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)
  )
    return 'browse'
  return undefined
}
/** Fresh anonymous projections, bounded and request-scoped. No bearer session
 * or privileged credential is forwarded, retained or serialized. */
export async function readInitialPublicContext(
  request: Request,
  env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_PUBLISHABLE_KEY'>,
  transport: typeof fetch,
  preparedSettings?: ReturnType<typeof readInitialSettings>,
) {
  const url = new URL(request.url),
    values: Record<string, unknown> = {},
    timings: string[] = []
  if (request.method !== 'GET' || url.search.length > 8192) return undefined
  if (
    classifyRoute(url.pathname) !== 'public' &&
    !/^\/(?:producto|marcas)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.pathname)
  )
    return undefined
  async function read(
    kind: 'home' | 'browse' | 'settings',
    operation: 'catalog_home_context' | 'catalog_browse' | 'site_settings',
    body: Record<string, unknown>,
    maximum: number,
    key?: string,
  ) {
    const start = performance.now()
    try {
      const value = await readPublicCatalog(
        env,
        operation,
        body,
        transport,
        maximum,
        1000,
      )
      values[kind] = key ? { key, value } : value
      timings.push(
        `initial_${kind};dur=${(performance.now() - start).toFixed(1)}`,
      )
    } catch {
      /* Each missing projection independently falls back in the client. */
    }
  }
  const jobs = [
    preparedSettings
      ? preparedSettings.then((settings) => {
          if (!settings) return
          values.settings = settings.value
          timings.push(`initial_settings;dur=${settings.durationMs.toFixed(1)}`)
        })
      : read('settings', 'site_settings', {}, 128 * 1024),
  ]
  const projection = initialCatalogProjection(url.pathname)
  if (projection === 'home')
    jobs.push(read('home', 'catalog_home_context', {}, 2 * 1024 * 1024))
  if (projection === 'browse') {
    const query = catalogRequestQuery(
      url.searchParams,
      url.pathname.startsWith('/marcas/') ? url.pathname.slice(8) : undefined,
    )
    jobs.push(
      read(
        'browse',
        'catalog_browse',
        { p_query: { ...query }, p_page_size: PAGE_SIZE },
        1024 * 1024,
        JSON.stringify([query, PAGE_SIZE]),
      ),
    )
  }
  await Promise.all(jobs)
  const json = publicInitialContextJson(
    env.SUPABASE_URL,
    url.pathname + url.search,
    values,
  )
  return json
    ? {
        markup: `${projection === 'browse' ? catalogImageHint((values.browse as { value?: unknown } | undefined)?.value) : ''}<script type="application/json" id="${PUBLIC_INITIAL_CONTEXT_ID}">${json}</script>`,
        timings,
      }
    : undefined
}

/** One fresh anonymous read that a matching product request may start alongside
 * its SEO lookup. Its deadline and payload limit are identical to the ordinary
 * initial settings read; failures still fall back independently in the client. */
export async function readInitialSettings(
  request: Request,
  env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_PUBLISHABLE_KEY'>,
  transport: typeof fetch,
) {
  const start = performance.now()
  try {
    const value = await readPublicCatalog(
      env, 'site_settings', {}, transport, 128 * 1024, 1000, request.signal,
    )
    return { value, durationMs: performance.now() - start }
  } catch {
    return undefined
  }
}
