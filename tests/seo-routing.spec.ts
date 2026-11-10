import { expect, test } from './test'
import { classifyRoute } from '../worker/route-policy'

const authRoutes = [
  '/iniciar-sesion',
  '/crear-cuenta',
  '/recuperar-contrasena',
  '/restablecer-contrasena',
  '/auth/callback',
  '/admin/login',
  '/admin/recuperar',
  '/admin/restablecer',
  '/admin/productos/00000000-0000-4000-8000-000000000001/fotos',
  '/admin/configuracion',
  '/admin/reclamaciones',
]

test('los accesos y callbacks son rutas de aplicación, nunca páginas inexistentes o indexables', () => {
  for (const path of authRoutes) expect(classifyRoute(path), path).toBe('app')
  expect(classifyRoute('/admin/acceso-inexistente')).toBe('missing')
  expect(classifyRoute('/admin/pedidos/123/fotos')).toBe('missing')
  expect(classifyRoute('/admin/productos/123/fotos/extra')).toBe('missing')
})

test('el Worker sirve los accesos con noindex tanto desde activos como desde el shell', async () => {
  const workerModulePath = '../worker/seo-router'
  const worker = (await import(workerModulePath)).default as {
    fetch(
      request: Request,
      env: { ASSETS: { fetch(request: Request): Promise<Response> } },
    ): Promise<Response>
  }
  for (const path of authRoutes) {
    for (const assetExists of [false, true]) {
      const visited: string[] = []
      const env = {
        ASSETS: {
          async fetch(request: Request | URL) {
            const pathname = new URL(
              request instanceof Request ? request.url : request,
            ).pathname
            visited.push(pathname)
            return new Response('<html>app</html>', {
              status: assetExists || pathname === '/__app_shell' ? 200 : 404,
            })
          },
        },
      }
      const response = await worker.fetch(
        new Request(`https://aroma.example${path}`),
        env,
      )
      expect(response.status, path).toBe(200)
      expect(response.headers.get('X-Robots-Tag'), path).toBe(
        'noindex, nofollow',
      )
      expect(visited, path).toEqual(
        assetExists ? [path] : [path, '/__app_shell'],
      )
    }
  }
})

test('Las rutas públicas y privadas se distinguen de URLs inexistentes', () => {
  expect(classifyRoute('/')).toBe('public')
  expect(classifyRoute('/tienda')).toBe('public')
  expect(classifyRoute('/marcas/forme')).toBe('candidate')
  expect(classifyRoute('/producto/petale-nu')).toBe('candidate')
  expect(classifyRoute('/checkout')).toBe('app')
  expect(classifyRoute('/admin/productos/nuevo')).toBe('app')
  expect(classifyRoute('/marcas/inexistente')).toBe('candidate')
  expect(classifyRoute('/producto/inexistente')).toBe('candidate')
  expect(classifyRoute('/ruta-inexistente')).toBe('missing')
})

test('La selección simple por marca permanece en Tienda y conserva noindex', async () => {
  const workerModulePath = '../worker/seo-router'
  const seoRouter = (await import(workerModulePath)).default as {
    fetch(
      request: Request,
      env: { ASSETS: { fetch(request: Request): Promise<Response> } },
    ): Promise<Response>
  }
  const request = new Request('https://aroma.example/tienda?marca=forme')
  const visited: string[] = []
  const env = {
    ASSETS: {
      async fetch(input: Request) {
        visited.push(input.url)
        return new Response('<html></html>', { status: 200 })
      },
    },
  }

  const response = await seoRouter.fetch(request, env)

  expect(response.status).toBe(200)
  expect(response.headers.get('Location')).toBeNull()
  expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
  expect(visited).toEqual([request.url])
})
