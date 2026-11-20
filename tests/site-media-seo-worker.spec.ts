import { build } from 'esbuild'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { expect, test } from '@playwright/test'

const origin = 'https://www.aromainfini.pe'
const imageId = '61000000-0000-4000-8000-000000000001'
const logoId = '61000000-0000-4000-8000-000000000002'
const imageSource = `/media/public/dynamic/${imageId}/${'a'.repeat(64)}/1536.webp`
const logoSource = `/media/public/dynamic/${logoId}/${'b'.repeat(64)}/vector.svg`
const image = {
  id: imageId,
  src: imageSource,
  width: 1536,
  height: 864,
  variants: [{ src: imageSource, width: 1536, height: 864 }],
}
const logo = {
  id: logoId,
  src: logoSource,
  width: 774,
  height: 374,
  byteSize: 21032,
  mimeType: 'image/svg+xml',
}
const productImageId = '61000000-0000-4000-8000-000000000003'
const productImageSource = `/media/public/dynamic/${productImageId}/${'c'.repeat(64)}/480.webp`
const productImage = {
  id: productImageId,
  src: productImageSource,
  width: 480,
  height: 600,
  variants: [{ src: productImageSource, width: 480, height: 600 }],
}
const body =
  '<main id="root">Contenido intacto</main><script src="/assets/app.js"></script>'
const graph = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      name: 'Aroma Infini',
      logo: '/brand/logo-on-light.svg',
    },
    { '@type': 'Product', name: 'Perfume', image: '/product-canonical.webp' },
  ],
}
const shell = `<!doctype html><html><head><title>Título intacto</title>
<meta property="og:image" content="https://old.invalid/old.webp">
<meta name="twitter:image" content="https://old.invalid/old.webp">
<script type="application/ld+json">${JSON.stringify(graph)}</script>
</head><body>${body}</body></html>`
let runtime: Miniflare

test.beforeAll(async () => {
  const compiled = await build({
    stdin: {
      resolveDir: process.cwd(),
      sourcefile: 'site-media-seo-native-test.ts',
      loader: 'ts',
      contents: `
      import { createSiteMediaSeoHandler } from './worker/site-media-seo';
      const image=${JSON.stringify(image)}, logo=${JSON.stringify(logo)}, productImage=${JSON.stringify(productImage)};
      const handlers=new Map(), counts=new Map();let now=0;
      export default {async fetch(request,bindings){
        const scenario=request.headers.get('X-Test-Scenario')||'configured';
        now=Number(request.headers.get('X-Test-Time')||0);
        if(!handlers.has(scenario)) handlers.set(scenario,createSiteMediaSeoHandler({now:()=>now,fetch:async(input,init)=>{
          const url=new URL(input instanceof Request?input.url:input);
          const headers=new Headers(init?.headers);
          if(scenario==='streamed-initial'&&url.pathname.endsWith('/catalog_browse')){
            await new Promise(resolve=>setTimeout(resolve,250));return Response.json({items:[]});
          }
          if(url.origin!==bindings.SUPABASE_URL||init?.method!=='POST'||init.redirect!=='manual'||
            headers.has('authorization')||headers.get('apikey')!==bindings.SUPABASE_PUBLISHABLE_KEY||
            headers.get('Content-Profile')!=='api'||JSON.stringify(JSON.parse(init.body))!=='{}'||
            !['/rest/v1/rpc/site_media_document','/rest/v1/rpc/public_media_aliases'].includes(url.pathname))
            throw new Error('Unexpected public metadata request');
          counts.set(scenario,(counts.get(scenario)||0)+1);
          if(scenario==='partial-recovery'&&counts.get(scenario)===1) return Response.json({message:'private-error-marker'},{status:503});
          if(scenario==='upstream-error') return Response.json({message:'private-error-marker'},{status:503});
          if(scenario==='redirect') return new Response(null,{status:302,headers:{Location:'https://outside.invalid/private'}});
          if(url.pathname.endsWith('/site_media_document')){
            if(['aliases','wrong-dimensions'].includes(scenario))return Response.json({items:[]});
            if(scenario==='malformed')return Response.json({items:[{slot:'identity.logo',asset:logo,alt:'Logo',version:'invalid'}]});
            return Response.json({items:[
              {slot:'seo.home',asset:image,assetId:image.id,alt:'"Nueva" <portada> & calma',version:2},
              {slot:'identity.logo',asset:logo,assetId:logo.id,alt:'Aroma Infini',version:2},
            ]});
          }
          return Response.json({items:scenario==='product-alias' ? [{path:'/images/cedre-480.webp',asset:productImage}] : ['aliases','wrong-dimensions'].includes(scenario)?[
            {path:'/images/hero-v2-lumiere-desktop-1536.webp',asset:scenario==='wrong-dimensions'?{...image,height:100,variants:[{...image.variants[0],height:100}]}:image},
            {path:'/brand/logo-on-light.svg',asset:logo},
          ]:[]});
        }}));
        const original=${JSON.stringify(shell)};
        const html=scenario==='large-script'?original.replace('"@context":"https://schema.org"','"padding":"'+'x'.repeat(66000)+'","@context":"https://schema.org"')
          : scenario==='product-alias' ? original.replaceAll('https://old.invalid/old.webp','https://www.aromainfini.pe/images/cedre-480.webp')
            .replace('"image":"/product-canonical.webp"','"image":'+JSON.stringify([
              'https://www.aromainfini.pe/images/cedre-480.webp','/images/cedre-480.webp',
              'https://www.aromainfini.pe'+productImage.src,'https://outside.invalid/images/cedre-480.webp'
            ])) : original;
        const response=await handlers.get(scenario)(new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8',ETag:'old', 'Content-Length':String(html.length)}}),request,bindings);
        if(scenario==='streamed-initial'){
          // Inspect native stream chunks before Miniflare's local HTTP proxy,
          // which coalesces small network responses regardless of the producer.
          const reader=response.body.getReader(),decoder=new TextDecoder();
          const first=await reader.read();let prefix=decoder.decode(first.value,{stream:true});
          while(!prefix.includes('</head>')){const next=await reader.read();if(next.done)break;prefix+=decoder.decode(next.value,{stream:true})}
          let html=prefix;
          for(;;){const next=await reader.read();if(next.done)break;html+=decoder.decode(next.value,{stream:true})}
          html+=decoder.decode();return Response.json({prefix,html,cacheControl:response.headers.get('Cache-Control')});
        }
        const headers=new Headers(response.headers);headers.set('X-Test-Calls',String(counts.get(scenario)||0));
        return new Response(response.body,{status:response.status,headers});
      }};
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
        APP_ENVIRONMENT: 'production',
        SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_syntheticpublickey',
      },
    }),
  )
})

test.afterAll(async () => {
  await runtime?.dispose()
})

async function request(scenario: string, path = '/', time = 0) {
  const response = await runtime.dispatchFetch(`${origin}${path}`, {
    headers: { 'X-Test-Scenario': scenario, 'X-Test-Time': String(time) },
  })
  return { response, html: await response.text() }
}

function schema(html: string) {
  return JSON.parse(
    html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    )?.[1] ?? '{}',
  )
}

test('El Worker actualiza imágenes sociales y logo SVG antes de JavaScript sin cambiar productos ni cuerpo', async () => {
  const { html, response } = await request('configured')
  expect(html).toContain(`content="${origin}${imageSource}"`)
  expect(html).toContain(
    'content="&quot;Nueva&quot; &lt;portada&gt; &amp; calma"',
  )
  expect(html).toContain('name="twitter:card" content="summary_large_image"')
  expect(schema(html)['@graph'][0].logo).toBe(`${origin}${logoSource}`)
  expect(schema(html)['@graph'][1].image).toBe('/product-canonical.webp')
  expect(html.match(/<body>([\s\S]*?)<\/body>/)?.[1]).toBe(body)
  expect(response.headers.get('etag')).toBeNull()
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(html.match(/rel="preconnect"/g)).toHaveLength(1)
  expect(html).toContain(
    'href="https://abcdefghijklmnopqrst.supabase.co" crossorigin',
  )
  const json = html.match(
    /<script type="application\/json" id="aroma-public-media">([\s\S]*?)<\/script>/,
  )?.[1]
  expect(json).toBeTruthy()
  const initial = JSON.parse(json!)
  expect(initial.version).toBe(1)
  expect(Array.isArray(initial.document.items)).toBe(true)
  expect(Array.isArray(initial.aliases.items)).toBe(true)
  expect(json).not.toContain('<')
  expect(json).not.toMatch(/sb_(secret|publishable)_/)
  expect(html).toContain(
    `rel="preload" as="image" href="${origin}${logoSource}"`,
  )
})

test('Las asociaciones importadas resuelven las rutas originales sin recortar ni cambiar su composición', async () => {
  const { html } = await request('aliases')
  expect(html).toContain(`content="${origin}${imageSource}"`)
  expect(schema(html)['@graph'][0].logo).toBe(`${origin}${logoSource}`)
})

test('Solo se guardan DTO públicos validados durante 30 segundos y el producto conserva su imagen propia', async () => {
  const first = await request('cached')
  expect(first.response.headers.get('x-test-calls')).toBe('2')
  const second = await request('cached', '/producto/rosa', 10000)
  expect(second.response.headers.get('x-test-calls')).toBe('2')
  expect(second.html).toContain('content="https://old.invalid/old.webp"')
  const metadata = (html: string) =>
    JSON.parse(
      html.match(
        /<script[^>]*id="aroma-public-media"[^>]*>([^<]*)<\/script>/,
      )![1],
    )
  expect(metadata(first.html).ageMs).toBe(0)
  expect(metadata(second.html).ageMs).toBe(10000)
  const expired = await request('cached', '/', 30001)
  expect(expired.response.headers.get('x-test-calls')).toBe('4')
  expect(metadata(expired.html).ageMs).toBe(0)
})

test('Una caída conserva el cuerpo original y no publica datos inválidos ni errores privados', async () => {
  for (const scenario of [
    'upstream-error',
    'redirect',
    'malformed',
    'wrong-dimensions',
  ]) {
    const { html } = await request(scenario)
    expect(html.match(/<body>([\s\S]*?)<\/body>/)?.[1], scenario).toBe(body)
    expect(schema(html)['@graph'][0].logo).toBe('/brand/logo-on-light.svg')
    expect(html).not.toContain('data-public-initial-visual')
    if (scenario === 'upstream-error' || scenario === 'redirect')
      expect(html).toBe(shell)
    expect(html).not.toContain('private-error-marker')
  }
})

test('una parte fallida no se cachea y una recuperación completa conserva su edad original', async () => {
  const first = await request('partial-recovery')
  const metadata = (html: string) =>
    JSON.parse(
      html.match(
        /<script[^>]*id="aroma-public-media"[^>]*>([^<]*)<\/script>/,
      )![1],
    )
  expect(first.response.headers.get('x-test-calls')).toBe('2')
  expect(metadata(first.html)).not.toHaveProperty('document')
  expect(metadata(first.html).aliases.items).toEqual([])
  const recovered = await request('partial-recovery', '/', 5000)
  expect(recovered.response.headers.get('x-test-calls')).toBe('4')
  expect(metadata(recovered.html).document.items).toHaveLength(2)
  expect(metadata(recovered.html).ageMs).toBe(0)
  const cached = await request('partial-recovery', '/', 10000)
  expect(cached.response.headers.get('x-test-calls')).toBe('4')
  expect(metadata(cached.html).ageMs).toBe(5000)
})

test('Un JSON-LD de más de 64 KiB se transmite sin retenerlo ni modificarlo', async () => {
  const { html } = await request('large-script')
  expect(schema(html)['@graph'][0].logo).toBe('/brand/logo-on-light.svg')
  expect(schema(html).padding).toHaveLength(66000)
  expect(html.match(/<body>([\s\S]*?)<\/body>/)?.[1]).toBe(body)
})

test('Las fichas y marcas reutilizan solo alias de imágenes propias y conservan imágenes gestionadas o externas', async () => {
  for (const path of ['/producto/rosa', '/marcas/forme']) {
    const { html } = await request('product-alias', path)
    const expected = `${origin}${productImageSource}`
    expect(html).toContain(`property="og:image" content="${expected}"`)
    expect(html).toContain(`name="twitter:image" content="${expected}"`)
    expect(schema(html)['@graph'][1].image).toEqual([
      expected,
      expected,
      expected,
      'https://outside.invalid/images/cedre-480.webp',
    ])
    expect(html.match(/<body>([\s\S]*?)<\/body>/)?.[1]).toBe(body)
  }
})

test('el encabezado se transmite antes del catálogo y la proyección llega antes de cerrar el cuerpo', async () => {
  const response = await runtime.dispatchFetch(`${origin}/tienda`, {
    headers: { 'X-Test-Scenario': 'streamed-initial' },
  })
  const { prefix, html, cacheControl } = (await response.json()) as {
    prefix: string
    html: string
    cacheControl: string
  }
  expect(prefix).toContain('<head>')
  expect(prefix).not.toContain('id="aroma-public-initial-context"')
  const projection = html.indexOf('id="aroma-public-initial-context"')
  expect(projection).toBeGreaterThan(html.indexOf(body))
  expect(projection).toBeLessThan(html.indexOf('</body>'))
  expect(cacheControl).toBe('no-store')
})
