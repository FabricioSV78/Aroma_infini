import { build } from 'esbuild'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { expect, test } from '@playwright/test'

const origin = 'https://aroma-staging.fixture.workers.dev'
const productId = '50000000-0000-4000-8000-000000000001'
const brandId = '50000000-0000-4000-8000-000000000002'
const mediaId = '50000000-0000-4000-8000-000000000003'
const source = `/media/public/dynamic/${mediaId}/${'a'.repeat(64)}/960.webp`
const asset = {
  id: mediaId,
  src: source,
  width: 960,
  height: 1200,
  variants: [{ src: source, width: 960, height: 1200 }],
}
const body =
  '<main id="root"><p>La aplicación mantiene su contenido.</p></main><script type="module" src="/assets/index-fixture.js"></script>'
const shell = `<!doctype html><html lang="es-PE"><head>
<title>Home anterior | Aroma Infini</title>
<meta name="description" content="Descripción anterior del Home">
<meta name="robots" content="index,follow">
<meta property="og:title" content="Home anterior">
<meta property="og:description" content="Descripción anterior">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="Home anterior">
<meta name="twitter:description" content="Descripción anterior">
<meta property="og:image" content="https://old.example/old.webp">
<meta property="og:url" content="https://old.example/">
<meta name="twitter:image" content="https://old.example/old.webp">
<link rel="canonical" href="https://old.example/">
<link rel="alternate" hreflang="es-PE" href="https://old.example/">
<script type="application/ld+json">{"@type":"Organization","name":"Anterior"}</script>
<link rel="stylesheet" href="/assets/index-fixture.css">
</head><body>${body}</body></html>`

let runtime: Miniflare

test.beforeAll(async () => {
  const compiled = await build({
    stdin: {
      contents: `
        import { createCatalogSeoHandler } from './worker/catalog-seo';
        const shell = ${JSON.stringify(shell)};
        const asset = ${JSON.stringify(asset)};
        const brand = {id:${JSON.stringify(brandId)},name:'Forme & Cía',slug:'forme'};
        export default {async fetch(request, bindings) {
          const scenario = request.headers.get('X-Test-Scenario') || 'healthy';
          const env={...bindings};
          if(scenario.startsWith('production')) Object.assign(env, {
            APP_ENVIRONMENT:'production', SEO_ALLOW_INDEXING:'true',
            SEO_CATALOG_IS_REAL:'true', SEO_SITE_URL:'https://www.aromainfini.pe',
            SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',
          });
          const calls = [];
          const handle = createCatalogSeoHandler({fetch:async(input, init) => {
            const url = new URL(input instanceof Request ? input.url : input);
            const headers = new Headers(init?.headers);
            if (url.origin !== env.SUPABASE_URL || init?.method !== 'POST' ||
                init.redirect !== 'manual' || headers.get('apikey') !== env.SUPABASE_PUBLISHABLE_KEY ||
                headers.has('authorization') || headers.get('Content-Profile') !== 'api' ||
                !['/rest/v1/rpc/catalog_product_context','/rest/v1/rpc/catalog_brands'].includes(url.pathname))
              throw new Error('Unexpected external request or privileged credential');
            calls.push(url.pathname);
            if(scenario==='upstream-error') return Response.json({message:'secret-error-response-marker'}, {status:500});
            if(scenario==='redirect') return new Response(null,{status:302,headers:{Location:'https://outside.invalid/private-token'}});
            if(scenario==='html') return new Response('<p>secret-error-response-marker</p>',{headers:{'Content-Type':'text/html'}});
            if(scenario==='oversized') return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(2*1024*1024+1));c.close()}}),{headers:{'Content-Type':'application/json'}});
            if(scenario==='network-error') throw new Error('secret-error-response-marker sb_secret_synthetic');
            if(url.pathname.endsWith('/catalog_brands')) return Response.json(scenario.endsWith('missing') ? [] : [brand]);
            const payload=JSON.parse(init.body);
            const record={
              product:{id:${JSON.stringify(productId)},name:'Rosa Clara',slug:payload.p_slug,brandId:brand.id,image:asset.src},
              detail:{shortDescription:'Una fragancia floral, suave y luminosa.'},
              mediaAssets:[asset],
            };
            if(scenario==='malformed') record.product.name=42;
            if(scenario==='wrong-slug') record.product.slug='otro-producto';
            if(scenario==='escaped') {record.product.name='Rosa "Clara" <script>alert(1)</script> & $&';record.detail.shortDescription='Maderas <b>claras</b> & "frescas" $&';}
            if(scenario==='unmanifested') record.mediaAssets=[];
            if(scenario==='external') record.product.image='https://outside.invalid/private-image.webp';
            if(scenario==='data') record.product.image='data:image/webp;base64,AAAA';
            if(scenario==='blob') record.product.image='blob:https://old.example/private';
            if(scenario==='local') {record.product.image='rosa-clara';record.mediaAssets=[];}
            return Response.json({record:scenario.endsWith('missing') ? null : record,brands:[brand],recommendations:[]});
          }});
          const assets={async fetch(input) {
            const url=new URL(input instanceof Request ? input.url : input);
            if(url.pathname!=='/__app_shell') throw new Error('Unexpected asset route');
            if(input instanceof Request && input.method!=='GET') throw new Error('Shell requires a GET');
            return new Response(shell,{headers:{
              'Content-Type':'text/html; charset=utf-8',
              'Content-Length':String(new TextEncoder().encode(shell).length),
              ETag:'"original-shell-etag"',
              'X-Content-Type-Options':'nosniff',
              'X-Frame-Options':'DENY',
              'Referrer-Policy':'strict-origin-when-cross-origin',
            }});
          }};
          const response=await handle(request,{...env,ASSETS:assets});
          if(!response) return new Response('outside-scope',{status:418});
          const headers=new Headers(response.headers);
          headers.set('X-Test-Upstream-Requests',String(calls.length));
          return new Response(response.body,{status:response.status,headers});
        }};
      `,
      resolveDir: process.cwd(),
      sourcefile: 'catalog-seo-native-test.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
  })
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: compiled.outputFiles[0].text,
      compatibilityDate: '2026-10-08',
      bindings: {
        SUPABASE_URL: 'https://tkxvexfapszilzhogvgu.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_syntheticpublickey',
      },
    }),
  )
})

test.afterAll(async () => {
  await runtime?.dispose()
})

function decode(value: string) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}
function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, 'i'))
  return match ? decode(match[1]) : null
}
function meta(html: string, key: string) {
  const tag = [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map(([value]) => value)
    .find(
      (value) =>
        attribute(value, 'name') === key ||
        attribute(value, 'property') === key,
    )
  return tag ? attribute(tag, 'content') : null
}
function title(html: string) {
  return decode(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '')
}
function canonical(html: string) {
  const tag = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map(([value]) => value)
    .find((value) => attribute(value, 'rel') === 'canonical')
  return tag ? attribute(tag, 'href') : null
}
async function request(
  path: string,
  scenario = 'healthy',
  method = 'GET',
  base = origin,
) {
  const response = await runtime.dispatchFetch(`${base}${path}`, {
    method,
    headers: { 'X-Test-Scenario': scenario },
  })
  const html = await response.text()
  return { response, html }
}

test('a direct product has current metadata before JavaScript while its app body is preserved', async () => {
  const { response, html } = await request('/producto/rosa-clara')
  expect(response.status).toBe(200)
  expect(title(html)).toBe('Rosa Clara de Forme & Cía | Aroma Infini')
  expect(meta(html, 'description')).toBe(
    'Una fragancia floral, suave y luminosa.',
  )
  expect(meta(html, 'og:title')).toBe(title(html))
  expect(meta(html, 'twitter:title')).toBe(title(html))
  expect(meta(html, 'og:type')).toBe('product')
  expect(html.match(/<body>([\s\S]*?)<\/body>/i)?.[1]).toBe(body)
  expect(html).toContain('/assets/index-fixture.css')
  expect(response.headers.get('X-Test-Upstream-Requests')).toBe('1')
})

test('product canonical excludes tracking and presentation queries and optional tags support SPA cleanup', async () => {
  const { html } = await request(
    '/producto/rosa-clara?presentacion=100&utm_source=private-token',
  )
  expect(canonical(html)).toBe(`${origin}/producto/rosa-clara`)
  expect(meta(html, 'og:url')).toBe(canonical(html))
  expect(meta(html, 'og:image')).toBe(`${origin}${source}`)
  expect(meta(html, 'twitter:image')).toBe(`${origin}${source}`)
  expect(html).not.toContain('private-token')
  expect(html).not.toContain('https://old.example')
  expect([
    ...html.matchAll(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi),
  ]).toHaveLength(1)
  for (const [tag] of html.matchAll(/<(?:meta|link)\b[^>]*>/gi)) {
    if (
      ['og:url', 'og:image', 'og:image:alt'].includes(
        attribute(tag, 'property') || '',
      ) ||
      ['twitter:image', 'twitter:image:alt'].includes(
        attribute(tag, 'name') || '',
      ) ||
      ['canonical', 'alternate'].includes(attribute(tag, 'rel') || '')
    ) {
      expect(attribute(tag, 'data-seo-managed')).toBe('true')
    }
  }
})

test('direct brands and the single-brand store filter share the same clean metadata', async () => {
  for (const path of ['/marcas/forme', '/tienda?marca=forme']) {
    const { response, html } = await request(path)
    expect(response.status).toBe(200)
    expect(title(html)).toBe('Forme & Cía: perfumes | Aroma Infini')
    expect(canonical(html)).toBe(`${origin}/marcas/forme`)
    expect(meta(html, 'description')).toBe(
      'Conoce los perfumes de Forme & Cía y sus presentaciones en Aroma Infini.',
    )
    expect(meta(html, 'og:image')).toBeNull()
  }
})

test('unrelated pages, multi-brand filters and additional shop facets remain outside the handler', async () => {
  for (const path of [
    '/cuenta',
    '/tienda',
    '/tienda?marca=forme&marca=otra',
    '/tienda?marca=forme&genero=unisex',
  ]) {
    const { response, html } = await request(path)
    expect(response.status, path).toBe(418)
    expect(html).toBe('outside-scope')
  }
})

test('merchant text is escaped literally instead of becoming HTML or replacement syntax', async () => {
  const { response, html } = await request('/producto/rosa-clara', 'escaped')
  expect(response.status).toBe(200)
  expect(title(html)).toBe(
    'Rosa "Clara" <script>alert(1)</script> & $& de Forme & Cía | Aroma Infini',
  )
  expect(meta(html, 'description')).toBe('Maderas <b>claras</b> & "frescas" $&')
  expect(meta(html, 'og:title')).toBe(title(html))
  expect(html).not.toContain('<script>alert(1)</script>')
  expect(html).not.toContain('<b>claras</b>')
})

test('HEAD has the same safe metadata headers and an empty body without original-shell validators', async () => {
  const { response, html } = await request(
    '/producto/rosa-clara',
    'healthy',
    'HEAD',
  )
  expect(response.status).toBe(200)
  expect(html).toBe('')
  expect(response.headers.get('etag')).toBeNull()
  expect([null, '0']).toContain(response.headers.get('content-length'))
  expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(response.headers.get('x-frame-options')).toBe('DENY')
})

test('the transformed HTML stays noindex, noncommercial and uncached', async () => {
  const { response, html } = await request('/producto/rosa-clara')
  expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  expect(meta(html, 'robots')?.replaceAll(' ', '')).toBe('noindex,nofollow')
  expect(response.headers.get('cache-control')).toContain('no-store')
  expect(response.headers.get('etag')).toBeNull()
  expect(response.headers.get('x-content-type-options')).toBe('nosniff')
  expect(html).not.toContain('application/ld+json')
  expect(html).not.toContain('aggregateRating')
  expect(html).not.toContain('priceCurrency')
})

test('only the exact explicitly published production origin indexes direct catalog pages', async () => {
  const commercialOrigin = 'https://www.aromainfini.pe'
  for (const path of ['/producto/rosa-clara', '/marcas/forme']) {
    const { response, html } = await request(
      path,
      'production',
      'GET',
      commercialOrigin,
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('x-robots-tag')).toMatch(/^index, follow,/)
    expect(meta(html, 'robots')).toMatch(/^index,follow,/)
    expect(canonical(html)).toBe(commercialOrigin + path)
  }
  for (const [path, scenario, base] of [
    ['/producto/rosa-clara?presentacion=50', 'production', commercialOrigin],
    ['/tienda?marca=forme', 'production', commercialOrigin],
    ['/producto/rosa-clara', 'production-missing', commercialOrigin],
    ['/producto/rosa-clara', 'production', origin],
  ]) {
    const { response, html } = await request(path, scenario, 'GET', base)
    expect(response.headers.get('x-robots-tag')).toMatch(/^noindex,/)
    expect(meta(html, 'robots')).toMatch(/^noindex,/)
  }
})

test('missing products and brands return 404 without stale product data', async () => {
  for (const path of ['/producto/rosa-clara', '/marcas/forme']) {
    const { response, html } = await request(path, 'missing')
    expect(response.status).toBe(404)
    expect(title(html)).not.toContain('Rosa Clara')
    expect(meta(html, 'og:image')).toBeNull()
    expect(canonical(html)).toBeNull()
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  }
  expect(
    (await request('/tienda?marca=forme', 'missing')).response.status,
  ).toBe(418)
})

test('invalid product fields and a mismatching slug fail as unavailable rather than publishing metadata', async () => {
  for (const scenario of ['malformed', 'wrong-slug']) {
    const { response, html } = await request('/producto/rosa-clara', scenario)
    expect(response.status, scenario).toBe(503)
    expect(title(html)).not.toContain('Rosa Clara')
    expect(canonical(html)).toBeNull()
    expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow')
  }
})

test('upstream errors, redirects and non-JSON responses do not leak diagnostic values', async () => {
  for (const scenario of [
    'upstream-error',
    'redirect',
    'html',
    'network-error',
  ]) {
    const { response, html } = await request('/producto/rosa-clara', scenario)
    expect(response.status, scenario).toBe(503)
    expect(html).not.toContain('secret-error-response-marker')
    expect(html).not.toContain('sb_secret_')
    expect(html).not.toContain('private-token')
    expect(response.headers.get('X-Test-Upstream-Requests')).toBe('1')
  }
})

test('a streamed RPC response exceeding the byte budget is rejected', async () => {
  const { response, html } = await request('/producto/rosa-clara', 'oversized')
  expect(response.status).toBe(503)
  expect(meta(html, 'og:image')).toBeNull()
})

test('temporary, external or unmanifested images never become a public social image', async () => {
  for (const scenario of ['external', 'data', 'blob', 'unmanifested']) {
    const { response, html } = await request('/producto/rosa-clara', scenario)
    expect(response.status).toBe(scenario === 'unmanifested' ? 503 : 200)
    expect(meta(html, 'og:image'), scenario).toBeNull()
    expect(meta(html, 'twitter:image'), scenario).toBeNull()
    expect(html).not.toContain('https://outside.invalid')
  }
  const { response, html } = await request('/producto/rosa-clara', 'local')
  expect(response.status).toBe(200)
  expect(meta(html, 'og:image')).toBe(`${origin}/images/rosa-clara-960.webp`)
})
