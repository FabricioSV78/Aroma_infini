import { brandPathForLegacyQuery, classifyRoute } from './route-policy'

function assetUrl(request: Request, pathname: string) {
  const url = new URL(request.url)
  url.pathname = pathname
  url.search = ''
  return url
}

function withStatusAndRobots(
  response: Response,
  status: number,
  robots: string,
) {
  const headers = new Headers(response.headers)
  headers.set('X-Robots-Tag', robots)
  return new Response(response.body, { status, headers })
}

export default {
  async fetch(request, env): Promise<Response> {
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

    if (url.pathname === '/tienda') {
      const brandPath = brandPathForLegacyQuery(url.search)
      if (brandPath)
        return Response.redirect(assetUrl(request, brandPath).toString(), 308)
      const asset = await env.ASSETS.fetch(request)
      const response = asset.ok
        ? asset
        : await env.ASSETS.fetch(assetUrl(request, '/__app_shell'))
      return url.search
        ? withStatusAndRobots(response, 200, 'noindex, follow')
        : response
    }

    const kind = classifyRoute(url.pathname)
    if (kind === 'public' || kind === 'app') {
      const asset = await env.ASSETS.fetch(request)
      if (asset.ok)
        return kind === 'public' && url.search
          ? withStatusAndRobots(asset, 200, 'noindex, follow')
          : asset
      const shell = await env.ASSETS.fetch(assetUrl(request, '/__app_shell'))
      return withStatusAndRobots(shell, 200, 'noindex, nofollow')
    }

    if (kind === 'candidate') {
      // Un producto o marca creado solo en IndexedDB puede renderizar en el
      // navegador, pero el servidor no debe declarar existente una URL que no
      // aparece en la publicación estática.
      const shell = await env.ASSETS.fetch(assetUrl(request, '/__app_shell'))
      return withStatusAndRobots(shell, 404, 'noindex, nofollow')
    }

    const notFound = await env.ASSETS.fetch(assetUrl(request, '/404'))
    return withStatusAndRobots(notFound, 404, 'noindex, nofollow')
  },
} satisfies ExportedHandler<Env>
