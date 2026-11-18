import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { test, expect } from '@playwright/test'
let runtime: Miniflare
test.beforeAll(async () => {
  const compiled = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'ts',
      contents: `
 import{filterPublicRouteHints}from'./worker/public-route-hints';
 const html='<html><head><link rel="modulepreload" href="/assets/home.js" data-public-route="/"><link rel="stylesheet" href="/assets/home.css" data-public-route="/"><link rel="modulepreload" href="/assets/catalog.js" data-public-route="/tienda"><link rel="modulepreload" href="/assets/product.js" data-public-route="/producto"><link rel="stylesheet" href="/assets/common.css"><link rel="modulepreload" href="/assets/sdk.js" data-auth-route><link rel="preload" as="font" href="/fonts/lato-latin-300-normal.woff2"><link rel="preload" as="font" href="/fonts/lato-latin-400-normal.woff2"></head><body><main>Intacto</main></body></html>';
 export default{fetch(request){const text=new URL(request.url).searchParams.has('text');return filterPublicRouteHints(new Response(html,{headers:{'Content-Type':text?'text/plain':'text/html','Content-Length':String(html.length),ETag:'old'}}),request)}}
 `,
    },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
  })
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: compiled.outputFiles[0].text,
      compatibilityDate: '2026-10-08',
    }),
  )
})
test.afterAll(() => runtime.dispose())
test('la fuente ligera conserva su preload de escritorio sin competir en móvil en las rutas medidas', async () => {
  for(const path of ['/','/tienda','/buscar','/producto/uno','/marcas/uno']) {
    const html=await(await runtime.dispatchFetch('https://fixture.invalid'+path)).text()
    expect(html).toContain('href="/fonts/lato-latin-300-normal.woff2" media="(min-width: 1024px)" data-public-font="light"')
    expect(html).toContain('<link rel="preload" as="font" href="/fonts/lato-latin-400-normal.woff2">')
  }
  for(const path of ['/admin/login','/contacto','/checkout','/cuenta']) {
    const html=await(await runtime.dispatchFetch('https://fixture.invalid'+path)).text()
    expect(html).not.toContain('data-public-font')
    expect(html).toContain('<link rel="preload" as="font" href="/fonts/lato-latin-300-normal.woff2">')
  }
})
test('solo Home conserva los hints de su grafo', async () => {
  const response = await runtime.dispatchFetch('https://fixture.invalid/')
  const html = await response.text()
  expect(html).toContain('data-public-route="/"')
  expect(html).not.toContain('/assets/catalog.js')
  expect(html).not.toContain('/assets/product.js')
  expect(html).not.toContain('/assets/sdk.js')
})
test('Tienda, fichas, cuentas y panel no descargan código del Home por su HTML', async () => {
  for (const path of [
    '/tienda',
    '/producto/uno',
    '/cuenta',
    '/admin/login',
    '/desconocida',
  ]) {
    const response = await runtime.dispatchFetch(
        'https://fixture.invalid' + path,
      ),
      html = await response.text()
    if (!['/tienda','/producto/uno'].includes(path))
      expect(html).not.toContain('data-public-route')
    expect(html).not.toContain('/assets/home.')
    expect(html).toContain('/assets/common.css')
    expect(html).toContain('<main>Intacto</main>')
    expect(response.headers.get('Content-Length')).toBeNull()
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  }
})

test('cada ruta recibe únicamente su código exacto de catálogo o ficha sin loaders adicionales', async () => {
  for (const path of ['/tienda','/tienda/?marca=lattafa','/buscar?q=bois','/marcas/atelier-01/','/producto/bois-clair','/producto/bois-clair/']) {
    const html=await(await runtime.dispatchFetch('https://fixture.invalid'+path)).text()
    const product=path.startsWith('/producto/')
    expect(html).toContain(product?'/assets/product.js':'/assets/catalog.js')
    expect(html).not.toContain(product?'/assets/catalog.js':'/assets/product.js')
    expect(html).not.toContain('/assets/home.')
    expect(html).not.toContain('/assets/sdk.js')
    expect(html).toContain('<main>Intacto</main>')
  }
  for(const path of ['/tiendacopia','/producto/uno/dos','/marcas/Marca','/admin-otro']) {
    const html=await(await runtime.dispatchFetch('https://fixture.invalid'+path)).text()
    expect(html).not.toContain('data-public-route')
  }
})
test('la transformación no altera otros tipos de respuesta', async () => {
  const response = await runtime.dispatchFetch(
    'https://fixture.invalid/tienda?text',
  )
  expect(response.headers.get('Content-Type')).toBe('text/plain')
  expect(await response.text()).toContain('/assets/home.js')
})

test('el shell adelanta Auth solamente en acceso, cuenta y administración', async () => {
  for (const path of ['/admin','/admin/productos','/cuenta','/cuenta/pedidos','/iniciar-sesion','/crear-cuenta']) {
    const html = await (await runtime.dispatchFetch('https://fixture.invalid'+path)).text()
    expect(html).toContain('/assets/sdk.js')
    expect(html).not.toContain('/assets/home.')
  }
  for (const path of ['/tienda','/producto/uno','/carrito','/checkout','/contacto','/admin-otro','/cuentacopia','/desconocida']) {
    const html = await (await runtime.dispatchFetch('https://fixture.invalid'+path)).text()
    expect(html).not.toContain('/assets/sdk.js')
  }
})
