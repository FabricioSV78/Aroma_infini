import { expect, test } from '@playwright/test'
import { classifyRoute } from '../worker/route-policy'

test('Las rutas públicas y privadas se distinguen de URLs inexistentes', () => {
  expect(classifyRoute('/')).toBe('public')
  expect(classifyRoute('/tienda')).toBe('public')
  expect(classifyRoute('/marcas/forme')).toBe('public')
  expect(classifyRoute('/producto/petale-nu')).toBe('public')
  expect(classifyRoute('/checkout')).toBe('app')
  expect(classifyRoute('/admin/productos/nuevo')).toBe('app')
  expect(classifyRoute('/marcas/inexistente')).toBe('candidate')
  expect(classifyRoute('/producto/inexistente')).toBe('candidate')
  expect(classifyRoute('/ruta-inexistente')).toBe('missing')
})

test('La selección simple por marca permanece en Tienda y conserva noindex', async () => {
  const workerModulePath = '../worker/seo-router'
  const seoRouter = (await import(workerModulePath)).default as {
    fetch(request: Request, env: { ASSETS: { fetch(request: Request): Promise<Response> } }): Promise<Response>
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
  expect(response.headers.get('X-Robots-Tag')).toBe('noindex, follow')
  expect(visited).toEqual([request.url])
})
