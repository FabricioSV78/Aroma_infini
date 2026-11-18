import test from 'node:test'
import assert from 'node:assert/strict'
import {
  publicRouteHints,
  stripPublicRouteHints,
  authRouteHint,
  selectPublicFontPreloads,
} from '../scripts/public-route-hints.mjs'
test('only measured routes defer the light font preload on mobile and preserve other weights', () => {
  const html='<head><link rel="preload" href="/fonts/lato-latin-300-normal.woff2" as="font"><link rel="preload" href="/fonts/lato-latin-400-normal.woff2" as="font"></head><body>Unchanged</body>'
  for(const route of ['/','/tienda','/buscar','/marcas/atelier-01','/producto/bois-clair']) {
    const selected=selectPublicFontPreloads(html,route)
    assert(selected.includes('media="(min-width: 1024px)" data-public-font="light"'))
    assert(selected.includes('<link rel="preload" href="/fonts/lato-latin-400-normal.woff2" as="font">'))
    assert.equal(selectPublicFontPreloads(selected,route),selected)
    for(const other of ['/contacto','/admin','/checkout','/cuenta'])assert.equal(selectPublicFontPreloads(selected,other),html)
  }
  assert.equal(selectPublicFontPreloads(html,'/contacto'),html)
})
test('current route hints traverse only the selected static graph and deduplicate existing assets', () => {
  const manifest = {
    'src/features/home/HomePage.tsx': {
      file: 'assets/HomePage-abc.js',
      imports: ['_shared.js'],
      css: ['assets/HomePage-abc.css'],
      dynamicImports: ['private'],
    },
    'src/features/catalog/CatalogPage.tsx': {file:'assets/CatalogPage-abc.js',imports:['_shared.js']},
    'src/features/product/ProductPage.tsx': {file:'assets/ProductPage-abc.js',imports:['_shared.js'],dynamicImports:['private']},
    '_shared.js': {
      file: 'assets/shared.js',
      imports: ['_cycle.js'],
      css: ['assets/shared.css'],
    },
    '_cycle.js': { file: 'assets/cycle.js', imports: ['_shared.js'] },
    private: { file: 'assets/admin.js' },
  }
  const html =
      '<head><link rel="modulepreload" href="/assets/shared.js"></head>',
    hints = publicRouteHints(manifest, html)
  assert(hints.includes('/assets/HomePage-abc.js'))
  assert(hints.includes('/assets/HomePage-abc.css'))
  assert(hints.includes('/assets/shared.css'))
  assert(!hints.includes('/assets/shared.js'))
  assert(!hints.includes('admin.js'))
  const catalog = publicRouteHints(manifest, html, '/tienda')
  assert(catalog.includes('/assets/CatalogPage-abc.js'))
  assert(catalog.includes('data-public-route="/tienda"'))
  assert(!catalog.includes('HomePage'))
  const product = publicRouteHints(manifest, html, '/producto/bois-clair')
  assert(product.includes('/assets/ProductPage-abc.js'))
  assert(!product.includes('admin.js'))
  assert(!product.includes('HomePage'))
  assert(!product.includes('CatalogPage'))
  const shell = hints + catalog + product
  assert.equal(stripPublicRouteHints(shell, '/buscar'), catalog)
  assert.equal(stripPublicRouteHints(shell, '/marcas/atelier-01/'), catalog)
  assert.equal(stripPublicRouteHints(shell, '/producto/bois-clair/'), product)
  for(const route of ['/admin','/contacto','/checkout','/tiendacopia','/producto/uno/dos','/producto/../admin','/marcas/Marca']) {
    assert.equal(publicRouteHints(manifest,html,route),'')
    assert.equal(stripPublicRouteHints(shell,route),'')
  }
  assert.equal(stripPublicRouteHints(hints, '/tienda'), '')
  assert.equal(stripPublicRouteHints(hints, '/'), hints)
})

test('the private shell references only the actual deferred SDK build asset', () => {
  const key = 'node_modules/@supabase/supabase-js/dist/index.mjs'
  assert.equal(authRouteHint({[key]: {file:'assets/dist-sdk.js',isDynamicEntry:true}}), '<link rel="modulepreload" crossorigin href="/assets/dist-sdk.js" data-auth-route>')
  assert.throws(() => authRouteHint({}))
  for(const file of ['https://other.invalid/sdk.js','../sdk.js','assets/sdk.css','assets/sdk.js" onload="bad'])
    assert.throws(() => authRouteHint({[key]: {file,isDynamicEntry:true}}))
})
test('missing or unsafe route assets fail a build instead of creating an untrusted preload', () => {
  for (const file of [
    'https://outside.invalid/image.js',
    '../secret.js',
    'assets/x.js" onclick="bad',
    'assets/x.mp4',
  ])
    assert.throws(() =>
      publicRouteHints({ 'src/features/home/HomePage.tsx': { file } }, ''),
    )
  assert.throws(() => publicRouteHints({}, ''))
})
