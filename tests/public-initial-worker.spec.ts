import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { expect, test } from '@playwright/test'
let runtime: Miniflare
test.beforeAll(async () => {
  const compiled = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'ts',
      contents: `
    import {readInitialPublicContext} from './worker/public-initial-context';
    import {catalogImageHint} from './worker/catalog-image-hint';
    export default {async fetch(request,env){
      const calls=[];const scenario=request.headers.get('X-Scenario');
      if(new URL(request.url).pathname==='/__image-hint'){
        const id='61000000-0000-4000-8000-000000000011';const src=w=>'/media/public/dynamic/'+id+'/'+'a'.repeat(64)+'/'+w+'.webp';
        const variants=[480,960,1600].map(width=>({src:src(width),width,height:width*1.25}));
        const asset={id,...variants[2],variants};
        const record={product:{image:src(1600)},mediaAssets:[asset]};
        let value={items:[record,{product:{image:'/images/ignored.webp'}}]};
        if(scenario==='empty')value={items:[]};
        if(scenario==='unverified')record.mediaAssets=[];
        if(scenario==='external')record.product.image='https://outside.invalid/private.webp';
        if(scenario==='malformed')asset.variants[0].src='//outside.invalid/480.webp';
        if(scenario==='first-only')value.items.reverse();
        return Response.json({hint:catalogImageHint(value)});
      }
      const result=await readInitialPublicContext(request,env,async(input,init)=>{
        const headers=new Headers(init.headers),url=new URL(input);
        if(headers.has('authorization')||headers.has('cookie')||headers.get('apikey')!==env.SUPABASE_PUBLISHABLE_KEY||init.redirect!=='manual')throw Error('credential boundary');
        calls.push({path:url.pathname,body:JSON.parse(init.body),profile:headers.get('Content-Profile')});
        if(scenario==='offline'||scenario==='partial'&&url.pathname.endsWith('/site_settings'))throw Error('private-error-marker');
        if(scenario==='oversized')return new Response('x'.repeat(3*1024*1024),{headers:{'Content-Type':'application/json'}});
        return Response.json({title:'</script><script>attack</script>',operation:url.pathname});
      });return Response.json({result,calls},{headers:{'X-Test-Calls':JSON.stringify(calls)}});
    }}
  `,
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
        SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
      },
    }),
  )
})
test.afterAll(() => runtime.dispose())
async function read(path: string, scenario = '', method = 'GET') {
  const response = await runtime.dispatchFetch(
    'https://fixture.invalid' + path,
    {
      method,
      headers: {
        'X-Scenario': scenario,
        Authorization: 'Bearer private-request-token',
        Cookie: 'private-request-cookie',
      },
    },
  )
  return (
    method === 'HEAD'
      ? { calls: JSON.parse(response.headers.get('X-Test-Calls')!) }
      : await response.json()
  ) as {
    result?: { markup: string; timings: string[] }
    calls: { path: string; body: Record<string, unknown>; profile: string }[]
  }
}
test('Home carries only fixed anonymous projections without forwarding the visitor session', async () => {
  const result = await read('/')
  expect(result.calls.map((c) => c.path).sort()).toEqual([
    '/rest/v1/rpc/catalog_home_context',
    '/rest/v1/rpc/site_settings',
  ])
  expect(result.calls.every((c) => c.profile === 'api')).toBe(true)
  expect(result.result?.markup).not.toContain('private-request')
  expect(result.result?.markup).not.toContain('sb_publishable_')
  expect(result.result?.markup).not.toContain('</script><script>attack')
  const json = result.result!.markup.match(/>(.*)<\/script>/)![1]
  expect(JSON.parse(json).values.home.title).toBe(
    '</script><script>attack</script>',
  )
})
test('catalog and brand route share the exact bounded query sent by the browser', async () => {
  const result = await read(
    '/marcas/lattafa?marca=ignored&genero=unisex&familia=amaderado&min=200&max=20&orden=precio-desc&pagina=2&q=%20Perfume%20',
  )
  const query = result.calls.find((c) =>
    c.path.endsWith('/catalog_browse'),
  )!.body
  expect(query).toMatchObject({
    p_page_size: 12,
    p_query: {
      brands: ['lattafa'],
      genders: ['unisex'],
      families: ['amaderado'],
      min: '20',
      max: '200',
      order: 'precio-desc',
      page: 2,
      search: 'Perfume',
    },
  })
  expect(result.result?.markup).toContain('browse')
})
test('partial failures omit only the failed projection; no error or stale substitute is embedded', async () => {
  const result = await read('/', 'partial')
  const json = JSON.parse(result.result!.markup.match(/>(.*)<\/script>/)![1])
  expect(Object.keys(json.values)).toEqual(['home'])
  expect(result.result!.markup).not.toContain('private-error-marker')
})
test('private routes, invalid candidates and non-GET requests do not fetch initial data', async () => {
  for (const path of [
    '/admin',
    '/admin/login',
    '/cuenta',
    '/auth/callback',
    '/producto/not/valid',
  ])
    expect((await read(path)).calls).toEqual([])
  expect((await read('/', '', 'HEAD')).calls).toEqual([])
  expect((await read('/?q=' + 'x'.repeat(8300))).calls).toEqual([])
})
test('offline and oversized upstream responses leave no unverified bootstrap data', async () => {
  for (const scenario of ['offline', 'oversized']) {
    const result = await read('/', scenario)
    expect(
      JSON.parse(result.result!.markup.match(/>(.*)<\/script>/)![1]).values,
    ).toEqual({})
  }
})

test('catalog image hint selects only the first verified card and preserves its actual responsive candidates', async () => {
  const response = await runtime.dispatchFetch('https://fixture.invalid/__image-hint')
  const {hint} = await response.json() as {hint:string}
  expect(hint).toContain('data-catalog-image-hint')
  expect(hint).toContain('480.webp 480w')
  expect(hint).toContain('960.webp 960w')
  expect(hint).toContain('1600.webp 1600w')
  expect(hint).toContain('imagesizes="(min-width: 1440px) 296px, (min-width: 768px) 23vw, 46vw"')
  expect(hint.match(/<link/g)).toHaveLength(1)
  expect(hint).not.toContain('ignored')
})
test('empty, external, mismatched and unverified catalog images never generate speculative preloads', async () => {
  for (const scenario of ['empty','unverified','external','malformed','first-only']) {
    const response = await runtime.dispatchFetch('https://fixture.invalid/__image-hint',{headers:{'X-Scenario':scenario}})
    expect((await response.json() as {hint:string}).hint).toBe('')
  }
})
