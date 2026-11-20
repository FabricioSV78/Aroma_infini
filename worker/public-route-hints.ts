import { DESKTOP_VIDEO_QUERY as DESKTOP_LAYOUT_QUERY } from '../src/domain/media-playback'

/** Filter route-specific code hints even when optional upstream metadata fails. */
export function filterPublicRouteHints(
  response: Response,
  request: Request,
): Response {
  if (
    request.method !== 'GET' ||
    !/^text\/html\b/i.test(response.headers.get('Content-Type') ?? '')
  )
    return response
  const headers = new Headers(response.headers)
  const path = new URL(request.url).pathname
  const group = path === '/'
    ? '/'
    : /^\/(?:tienda|buscar)\/?$/.test(path) ||
        /^\/marcas\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(path)
      ? '/tienda'
      : /^\/producto\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(path)
        ? '/producto'
        : undefined
  const needsAuthAtStartup =
    /^\/(?:admin|cuenta)(?:\/|$)/.test(path) ||
    /^\/(?:iniciar-sesion|crear-cuenta)\/?$/.test(path)
  for (const name of [
    'Content-Length',
    'Content-Encoding',
    'ETag',
    'Last-Modified',
  ])
    headers.delete(name)
  headers.set('Cache-Control', 'no-store')
  return new HTMLRewriter()
    .on('head link[data-public-route]', {
      element(element) {
        if (element.getAttribute('data-public-route') !== group) element.remove()
      },
    })
    .on('head link[data-auth-route]', {
      element(element) {
        if (!needsAuthAtStartup) element.remove()
      },
    })
    .on('head link[rel="preload"][as="font"]', {
      element(element) {
        if (!/^\/(?:fonts\/lato-latin-300-normal|assets\/lato-latin-300-normal-[A-Za-z0-9_-]+)\.woff2$/.test(element.getAttribute('href') ?? '')) return
        if (group) {
          element.setAttribute('media', DESKTOP_LAYOUT_QUERY)
          element.setAttribute('data-public-font', 'light')
        } else if (element.getAttribute('data-public-font') === 'light') {
          element.removeAttribute('media')
          element.removeAttribute('data-public-font')
        }
      },
    })
    .transform(
      new Response(response.body, { status: response.status, headers }),
    )
}
