import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { expect, test } from '@playwright/test'

let runtime: Miniflare
test.beforeAll(async () => {
  const compiled = await build({
    stdin: {
      resolveDir: process.cwd(), loader: 'ts', contents: `
      import {createSiteMediaSeoHandler} from './worker/site-media-seo';
      import {createCatalogSeoHandler} from './worker/catalog-seo';
      export default {async fetch(request,env){
        const scenario=request.headers.get('X-Scenario')||'ok', calls=[];
        let settingsStarted=false, productStarted=false, canceled=false;
        const upstream='66666666-7777-4888-8999-aaaaaaaaaaaa';
        const transport=async(input,init)=>{
          const name=new URL(input instanceof Request?input.url:input).pathname.split('/').pop();
          const headers=new Headers(init.headers);
          if(headers.has('authorization')||headers.has('cookie')||headers.get('apikey')!==env.SUPABASE_PUBLISHABLE_KEY)throw Error('credential boundary');
          calls.push(name);
          const json=value=>Response.json(value,{headers:{'sb-request-id':upstream}});
          if(name==='site_settings'){
            settingsStarted=true;
            if(scenario==='missing')return new Promise((resolve,reject)=>{
              const stop=()=>{canceled=true;reject(Error('canceled'));};
              if(init.signal.aborted)stop();else init.signal.addEventListener('abort',stop,{once:true});
            });
            if(scenario==='settings-error')throw Error('private-error-marker');
            await Promise.resolve();
            if(!productStarted)throw Error('settings and product must overlap');
            return json({marker:'fresh-settings'});
          }
          if(name==='catalog_product_context'){
            productStarted=true;
            if(!settingsStarted)throw Error('settings was not started alongside product');
            await Promise.resolve();
            return json({record:scenario==='missing'?null:{product:{id:'50000000-0000-4000-8000-000000000001',name:'Perfume',slug:'rosa',brandId:'50000000-0000-4000-8000-000000000002',image:'rosa'},detail:{shortDescription:'Descripción',gallery:[]},mediaAssets:[]},brands:[],recommendations:[]});
          }
          if(name==='site_media_document'||name==='public_media_aliases')return json({items:[]});
          throw Error('unexpected request');
        };
        const media=createSiteMediaSeoHandler({fetch:transport});
        const scoped=media.prepareSettings(request,env);
        if(!scoped)return Response.json({prepared:false,calls});
        const seo=createCatalogSeoHandler({fetch:transport});
        const page=await seo(request,{...env,ASSETS:{fetch:async()=>new Response('<html><head></head><body>untouched</body></html>',{headers:{'Content-Type':'text/html'}})}},scoped.diagnostics.fetch);
        if(page.status!==200)scoped.cancel();
        const response=await media(page,request,env,scoped),html=await response.text();
        await scoped.settings;
        return Response.json({prepared:true,status:response.status,calls,canceled,html,reads:response.headers.get('X-Aroma-Public-Reads')});
      }};`,
    }, bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022',
  })
  runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: compiled.outputFiles[0].text,
    compatibilityDate: '2026-10-08',
    bindings: { APP_ENVIRONMENT: 'staging', SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture' },
  }))
})
test.afterAll(async () => runtime?.dispose())
async function read(path = '/producto/rosa', scenario = 'ok', method = 'GET') {
  const response = await runtime.dispatchFetch('https://fixture.invalid' + path, { method, headers: { 'X-Scenario': scenario, Cookie: 'private-cookie', Authorization: 'Bearer private-session' } })
  return await response.json() as { prepared: boolean; status: number; calls: string[]; canceled: boolean; html: string; reads: string | null }
}
test('product and fresh settings overlap with one read each and correlated IDs', async () => {
  const value = await read()
  expect(value.status).toBe(200)
  expect(value.calls.sort()).toEqual(['catalog_product_context', 'public_media_aliases', 'site_media_document', 'site_settings'])
  expect(value.html).toContain('fresh-settings')
  expect(value.html).toContain('untouched')
  expect(value.html).not.toMatch(/private-session|private-cookie|sb_publishable/)
  const reads = JSON.parse(value.reads!) as { operation: string; upstreamId: string }[]
  expect(reads.map(r => r.operation).sort()).toEqual(value.calls)
  expect(reads.every(r => r.upstreamId === '66666666-7777-4888-8999-aaaaaaaaaaaa')).toBe(true)
})
test('a missing product cancels speculative settings and fetches no other metadata', async () => {
  const value = await read('/producto/rosa', 'missing')
  expect(value.status).toBe(404)
  expect(value.canceled).toBe(true)
  expect(value.calls).toEqual(['site_settings', 'catalog_product_context'])
  expect(value.html).not.toContain('aroma-public-initial-context')
})
test('settings failure is independent of product rendering and never duplicated', async () => {
  const value = await read('/producto/rosa', 'settings-error')
  expect(value.status).toBe(200)
  expect(value.calls.filter(name => name === 'site_settings')).toHaveLength(1)
  expect(value.html).not.toContain('private-error-marker')
})
test('preparation excludes non-GET, private, malformed, other routes and excessive queries', async () => {
  for (const path of ['/admin', '/cuenta', '/', '/tienda', '/marcas/forme', '/producto/no/valid', '/producto/INVALID', '/producto/' + 'a'.repeat(513), '/producto/rosa?q=' + 'a'.repeat(8200)]) {
    const value = await read(path)
    expect(value.prepared, path).toBe(false)
    expect(value.calls).toEqual([])
  }
  expect((await read('/producto/rosa', 'ok', 'POST')).prepared).toBe(false)
})
