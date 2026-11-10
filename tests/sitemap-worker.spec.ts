import { build } from 'esbuild'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { expect, test } from '@playwright/test'

const origin = 'https://www.aromainfini.pe'
let runtime: Miniflare

test.beforeAll(async () => {
  const compiled = await build({
    stdin: {
      contents: `
        import { createSitemapHandler } from './worker/sitemap';
        export default { async fetch(request, bindings) {
          const scenario=request.headers.get('X-Test-Scenario') || 'healthy';
          const env={...bindings};
          if(scenario==='staging') env.APP_ENVIRONMENT='staging';
          if(scenario==='disabled') env.SEO_ALLOW_INDEXING='false';
          if(scenario==='unconfirmed') env.SEO_CATALOG_IS_REAL='false';
          if(scenario==='development-project') env.SUPABASE_URL='https://tkxvexfapszilzhogvgu.supabase.co';
          if(scenario==='invalid-site') env.SEO_SITE_URL='http://127.0.0.1:5173';
          if(scenario==='privileged-key') env.SUPABASE_PUBLISHABLE_KEY='sb_secret_synthetic-not-public';
          const calls=[];
          const handle=createSitemapHandler({fetch:async(input,init)=>{
            const url=new URL(input instanceof Request?input.url:input);
            const headers=new Headers(init?.headers);
            if(url.origin!==env.SUPABASE_URL || init?.method!=='POST' || init.redirect!=='manual' ||
              headers.get('apikey')!==env.SUPABASE_PUBLISHABLE_KEY || headers.has('authorization') ||
              headers.get('Content-Profile')!=='api' || !(init.signal instanceof AbortSignal) ||
              !['/rest/v1/rpc/catalog_products','/rest/v1/rpc/catalog_brands'].includes(url.pathname))
              throw Error('Unexpected destination, credential or operation');
            calls.push({path:url.pathname,body:JSON.parse(init.body)});
            if(scenario==='upstream-error') return Response.json({message:'sensitive-diagnostic-marker'}, {status:500});
            if(scenario==='redirect') return new Response(null,{status:302,headers:{Location:'https://outside.invalid/private-token'}});
            if(scenario==='html') return new Response('<p>sensitive-diagnostic-marker</p>',{headers:{'Content-Type':'text/html'}});
            if(scenario==='invalid-json') return new Response('{sensitive-diagnostic-marker',{headers:{'Content-Type':'application/json'}});
            if(scenario==='network-error') throw Error('sensitive-diagnostic-marker sb_secret_synthetic');
            if(scenario==='oversized') return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(8*1024*1024+1));c.close()}}),{headers:{'Content-Type':'application/json'}});
            if(url.pathname.endsWith('/catalog_brands')) return Response.json([
              {id:'50000000-0000-4000-8000-000000000001',name:'Forme & Cia',slug:scenario==='unsafe-brand'?'forme?secret=1':'forme'},
              {id:'50000000-0000-4000-8000-000000000002',name:'Atelier 01',slug:'atelier-01'},
            ]);
            const body=JSON.parse(init.body);
            if(![1,100].includes(body.p_limit) || !Number.isInteger(body.p_offset) || body.p_offset<0 || body.p_offset>100000)
              throw Error('Unbounded catalog request');
            const total=scenario==='empty'?0:scenario==='large'?2350:scenario==='maximum'?100100:scenario==='beyond-maximum'?100101:3;
            const count=Math.max(0,Math.min(body.p_limit,total-body.p_offset));
            const items=Array.from({length:count},(_,i)=>({product:{
              slug:scenario==='unsafe-product'?'bad?private=1':scenario==='duplicate'?'duplicate':'perfume-'+(body.p_offset+i+1),
              name:'Commercial text must not be copied',privateDiagnostic:'sensitive-owner-marker',
            },detail:{description:'Descriptions and prices are not sitemap data'}}));
            if(scenario==='inconsistent' && body.p_limit===100) items.pop();
            return Response.json({items,total});
          }});
          const result=await handle(request,env);
          if(!result) return new Response('outside-scope',{status:418});
          const headers=new Headers(result.headers);
          headers.set('X-Test-Upstream-Requests',String(calls.length));
          headers.set('X-Test-Catalog-Request',JSON.stringify(calls.at(-1)?.body??null));
          return new Response(result.body,{status:result.status,headers});
        }};
      `,
      resolveDir: process.cwd(),
      sourcefile: 'sitemap-native-test.ts',
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
        APP_ENVIRONMENT: 'production',
        SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_syntheticpublickey',
        SEO_ALLOW_INDEXING: 'true',
        SEO_CATALOG_IS_REAL: 'true',
        SEO_SITE_URL: origin,
      },
    }),
  )
})

test.afterAll(async () => {
  await runtime?.dispose()
})

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
  return { response, xml: await response.text() }
}

function locations(xml: string) {
  return [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1])
}

test('staging and incomplete publication declarations never query the catalog or publish a sitemap', async () => {
  for (const scenario of [
    'staging',
    'disabled',
    'unconfirmed',
    'development-project',
    'invalid-site',
  ]) {
    for (const path of [
      '/sitemap.xml',
      '/sitemap-pages.xml',
      '/sitemap-brands.xml',
      '/sitemap-products-1.xml',
    ]) {
      const { response, xml } = await request(path, scenario)
      expect(response.status, `${scenario} ${path}`).toBe(404)
      expect(response.headers.get('X-Test-Upstream-Requests')).toBe('0')
      expect(response.headers.get('x-robots-tag')).toContain('noindex')
      expect(xml).not.toContain('<loc>')
    }
    const robots = await request('/robots.txt', scenario)
    expect(robots.response.status).toBe(200)
    expect(robots.xml).toContain('Allow: /')
    expect(robots.xml).not.toContain('Sitemap:')
    expect(robots.response.headers.get('X-Test-Upstream-Requests')).toBe('0')
  }
})

test('an alternate request origin cannot activate the configured production sitemap', async () => {
  const { response, xml } = await request(
    '/sitemap.xml',
    'healthy',
    'GET',
    'https://another-domain.pe',
  )
  expect(response.status).toBe(404)
  expect(response.headers.get('X-Test-Upstream-Requests')).toBe('0')
  expect(xml).not.toContain('<loc>')
})

test('production robots advertises only the configured canonical sitemap and unrelated routes are untouched', async () => {
  const { response, xml } = await request('/robots.txt')
  expect(response.status).toBe(200)
  expect(xml).toContain(`Sitemap: ${origin}/sitemap.xml`)
  expect(xml).not.toContain('workers.dev')
  expect(response.headers.get('X-Test-Upstream-Requests')).toBe('0')
  expect((await request('/cuenta')).response.status).toBe(418)
})

test('sitemap index includes static, brand and product shards without fetching the entire catalog', async () => {
  const { response, xml } = await request('/sitemap.xml', 'large')
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('xml')
  expect(xml).toContain('<sitemapindex')
  const urls = locations(xml)
  expect(urls).toHaveLength(26)
  expect(new Set(urls).size).toBe(urls.length)
  expect(urls).toContain(`${origin}/sitemap-pages.xml`)
  expect(urls).toContain(`${origin}/sitemap-brands.xml`)
  expect(urls).toContain(`${origin}/sitemap-products-24.xml`)
  expect(response.headers.get('X-Test-Upstream-Requests')).toBe('1')
  expect(JSON.parse(response.headers.get('X-Test-Catalog-Request')!)).toEqual({
    p_limit: 1,
    p_offset: 0,
  })
})

test('static URLs are clean indexable routes and exclude private pages or fabricated timestamps', async () => {
  const { response, xml } = await request('/sitemap-pages.xml')
  expect(response.status).toBe(200)
  expect(locations(xml)).toEqual([
    `${origin}/`,
    `${origin}/tienda`,
    `${origin}/marcas`,
  ])
  expect(xml).not.toMatch(/cuenta|checkout|admin|lastmod|changefreq|priority/)
  expect(response.headers.get('X-Test-Upstream-Requests')).toBe('0')
})

test('brand sitemap uses only returned public slugs and never merchant names or other DTO fields', async () => {
  const { response, xml } = await request('/sitemap-brands.xml')
  expect(response.status).toBe(200)
  expect(locations(xml)).toEqual([
    `${origin}/marcas/forme`,
    `${origin}/marcas/atelier-01`,
  ])
  expect(xml).not.toContain('Forme & Cia')
  expect(locations(xml).every((url) => new URL(url).search === '')).toBe(true)
  expect(response.headers.get('X-Test-Upstream-Requests')).toBe('1')
})

test('product shards fetch exactly one bounded page and the last shard contains only its remaining products', async () => {
  const second = await request('/sitemap-products-2.xml', 'large')
  expect(second.response.status).toBe(200)
  expect(locations(second.xml)).toHaveLength(100)
  expect(locations(second.xml)[0]).toBe(`${origin}/producto/perfume-101`)
  expect(locations(second.xml).at(-1)).toBe(`${origin}/producto/perfume-200`)
  expect(
    JSON.parse(second.response.headers.get('X-Test-Catalog-Request')!),
  ).toEqual({ p_limit: 100, p_offset: 100 })
  expect(second.xml).not.toContain('sensitive-owner-marker')
  expect(second.xml).not.toContain('Commercial text')
  const last = await request('/sitemap-products-24.xml', 'large')
  expect(last.response.status).toBe(200)
  expect(locations(last.xml)).toHaveLength(50)
  expect(locations(last.xml).at(-1)).toBe(`${origin}/producto/perfume-2350`)
  expect(last.response.headers.get('X-Test-Upstream-Requests')).toBe('1')
})

test('an empty public catalog omits product shards and stale indexes resolve to 404', async () => {
  const index = await request('/sitemap.xml', 'empty')
  expect(index.response.status).toBe(200)
  expect(locations(index.xml)).toEqual([
    `${origin}/sitemap-pages.xml`,
    `${origin}/sitemap-brands.xml`,
  ])
  expect(
    (await request('/sitemap-products-1.xml', 'empty')).response.status,
  ).toBe(404)
  expect(
    (await request('/sitemap-products-25.xml', 'large')).response.status,
  ).toBe(404)
})

test('the existing API pagination ceiling is handled explicitly instead of silently truncating URLs', async () => {
  const maximum = await request('/sitemap.xml', 'maximum')
  expect(maximum.response.status).toBe(200)
  expect(locations(maximum.xml)).toHaveLength(1003)
  expect(locations(maximum.xml).at(-1)).toBe(
    `${origin}/sitemap-products-1001.xml`,
  )
  const tooLarge = await request('/sitemap.xml', 'beyond-maximum')
  expect(tooLarge.response.status).toBe(503)
  expect(tooLarge.xml).not.toContain('<loc>')
})

test('invalid shard paths and unsupported methods never trigger catalog reads', async () => {
  for (const path of [
    '/sitemap-products-0.xml',
    '/sitemap-products-01.xml',
    '/sitemap-products-NaN.xml',
    '/sitemap-products-1002.xml',
    '/sitemap.xml?query=private',
  ]) {
    const { response } = await request(path)
    expect(response.status, path).toBe(404)
    expect(response.headers.get('X-Test-Upstream-Requests')).toBe('0')
  }
  const post = await request('/sitemap.xml', 'healthy', 'POST')
  expect(post.response.status).toBe(405)
  expect(post.response.headers.get('allow')).toMatch(/GET.*HEAD/)
  expect(post.response.headers.get('X-Test-Upstream-Requests')).toBe('0')
})

test('invalid, duplicate or inconsistent public data fail closed instead of emitting a partial sitemap', async () => {
  for (const [path, scenario] of [
    ['/sitemap-products-1.xml', 'unsafe-product'],
    ['/sitemap-products-1.xml', 'duplicate'],
    ['/sitemap-products-1.xml', 'inconsistent'],
    ['/sitemap-brands.xml', 'unsafe-brand'],
  ]) {
    const { response, xml } = await request(path, scenario)
    expect(response.status, scenario).toBe(503)
    expect(xml).not.toContain('<loc>')
    expect(xml).not.toContain('private=1')
    expect(response.headers.get('x-robots-tag')).toContain('noindex')
  }
})

test('upstream failures, malformed JSON, redirects and excessive payloads never expose diagnostics', async () => {
  for (const scenario of [
    'upstream-error',
    'redirect',
    'html',
    'invalid-json',
    'network-error',
    'oversized',
    'privileged-key',
  ]) {
    const { response, xml } = await request('/sitemap-products-1.xml', scenario)
    expect(response.status, scenario).toBe(503)
    expect(xml).not.toMatch(
      /sensitive-diagnostic-marker|sb_secret_|private-token|<loc>/,
    )
  }
})

test('HEAD preserves operational headers and status while returning no XML body', async () => {
  for (const path of [
    '/robots.txt',
    '/sitemap.xml',
    '/sitemap-pages.xml',
    '/sitemap-brands.xml',
    '/sitemap-products-1.xml',
  ]) {
    const get = await request(path)
    const head = await request(path, 'healthy', 'HEAD')
    expect(head.response.status, path).toBe(get.response.status)
    expect(head.xml, path).toBe('')
    expect(head.response.headers.get('content-type')).toBe(
      get.response.headers.get('content-type'),
    )
    expect(head.response.headers.get('cache-control')).toContain('no-store')
    expect(head.response.headers.get('x-content-type-options')).toBe('nosniff')
  }
})
