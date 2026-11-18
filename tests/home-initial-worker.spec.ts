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
    import {readInitialHome,initialHomeMarkup} from './worker/home-initial';
    import {createDefaultHomeContent} from './src/content/home-editor';
    import {HERO_MOBILE_QUERY,HERO_DESKTOP_QUERY} from './src/domain/hero-visuals';
    export default {async fetch(request,env){
      const scenario=new URL(request.url).pathname.slice(1);let calls=0;
      const content=createDefaultHomeContent(),media={hombre:null,mujer:null,unisex:null,complementos:null};
      const photo=(id,width,height)=>{const src='/media/public/dynamic/'+id+'/'+'a'.repeat(64)+'/'+width+'.webp';return {id,src,width,height,variants:[{src,width,height}]}};
      const desktop=photo('61000000-0000-4000-8000-000000000011',1536,864),mobile=photo('61000000-0000-4000-8000-000000000012',1024,1536);
      const video={id:'61000000-0000-4000-8000-000000000013',src:'/media/public/dynamic/61000000-0000-4000-8000-000000000013/'+'b'.repeat(64)+'/video.mp4',width:1920,height:1080,durationMs:4000,byteSize:8000,mimeType:'video/mp4'};
      let raw={version:0,content:null,media:null,mediaAssets:[]};
      if(scenario==='reordered'){content.hero.forEach((s,i)=>s.order=i+1);content.hero[0].published=false;content.hero[2].order=0;content.hero=content.hero.filter(s=>s.published);raw={version:1,content,media,mediaAssets:[]}}
      if(scenario==='private-payload'){content.hero[0].published=false;raw={version:1,content,media,mediaAssets:[]}}
      if(scenario==='empty'){content.hero=[];raw={version:1,content,media,mediaAssets:[]}}
      if(['uploaded','video','video-alternative','video-poster'].includes(scenario)){
        const slide={...content.hero[0],fallbackIndex:null,desktopImage:desktop.src,mobileImage:mobile.src};
        if(scenario.startsWith('video')){Object.assign(slide,{mediaType:'video',desktopImage:null,mobileImage:scenario==='video-alternative'?mobile.src:null,video:video.src,poster:desktop.src,mobilePoster:scenario==='video-poster'?null:scenario==='video-alternative'?desktop.src:mobile.src,mobileVideo:scenario==='video-poster'?null:video.src})}
        content.hero=[slide];raw={version:1,content,media,mediaAssets:[desktop,...(scenario==='video-poster'?[]:[mobile]),...(scenario.startsWith('video')?[video]:[])]};
      }
      if(scenario==='malformed')raw={...raw,mediaAssets:[{src:'https://outside.invalid/private.webp'}]};
      const home=await readInitialHome(env,async(input,init)=>{
        calls++;if(new URL(input).pathname!=='/rest/v1/rpc/home_document'||new Headers(init.headers).has('authorization'))throw Error('wrong boundary');
        if(scenario==='offline')throw Error('private-error-marker');
        return Response.json(raw);
      });
      const aliases=new Map(scenario==='alias'?[['/images/hero-v2-lumiere-mobile-780.webp',mobile.src]]:[]);
      return Response.json({markup:initialHomeMarkup(home,env.SUPABASE_URL,aliases),calls,valid:!!home,mobile:HERO_MOBILE_QUERY,desktop:HERO_DESKTOP_QUERY});
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
async function read(scenario: string) {
  const response = await runtime.dispatchFetch(
    'https://fixture.invalid/' + scenario,
  )
  return (await response.json()) as {
    markup: string
    calls: number
    valid: boolean
    mobile: string
    desktop: string
  }
}
test('Home anuncia solo la primera campaña y sus dos alternativas responsive antes de React', async () => {
  const result = await read('default')
  expect(result.valid).toBe(true)
  expect(result.calls).toBe(1)
  expect(result.markup.match(/data-home-hero-hint/g)).toHaveLength(2)
  expect(result.markup).toContain('hero-v2-lumiere-mobile-780.webp 780w')
  expect(result.markup).toContain('hero-v2-lumiere-desktop-1536.webp 1536w')
  expect(result.markup).toContain('id="aroma-public-home"')
  expect(result.markup).not.toContain('sb_publishable_')
})
test('el orden publicado y las campañas ocultas determinan la precarga', async () => {
  const result = await read('reordered')
  expect(result.valid).toBe(true)
  const hints = result.markup.split('<script')[0]
  expect(hints).not.toContain('hero-v2-lumiere')
  expect(hints.match(/data-home-hero-hint/g)).toHaveLength(2)
})
test('los uploads usan sus variantes verificadas individuales', async () => {
  const result = await read('uploaded')
  expect(result.valid).toBe(true)
  expect(result.markup.split('<script')[0]).toContain('000000000011')
  expect(result.markup.split('<script')[0]).toContain('000000000012')
  expect(result.markup.split('<script')[0]).not.toContain('/images/hero-')
})
test('los vídeos anuncian pósters, sin descargar un MP4 anticipadamente', async () => {
  const result = await read('video')
  expect(result.valid).toBe(true)
  expect(result.markup.split('<script')[0]).not.toContain('.mp4')
  expect(result.markup.split('<script')[0]).toContain('000000000012')
})

test('la precarga móvil del vídeo prioriza la imagen independiente y usa el breakpoint de escritorio', async () => {
  const result = await read('video-alternative')
  expect(result.valid).toBe(true)
  const hints = result.markup.split('<script')[0]
  const mobileHint = hints.match(/<link[^>]+>/g)![0]
  expect(mobileHint).toContain('not all and (min-width: 1024px)')
  expect(mobileHint).toContain('000000000012')
  expect(mobileHint).not.toContain('000000000011')
  expect(hints).not.toContain('.mp4')
})

test('sin imagen móvil el vídeo precarga únicamente su portada configurada', async () => {
  const result = await read('video-poster')
  expect(result.valid).toBe(true)
  const hints = result.markup.split('<script')[0]
  expect(hints.match(/data-home-hero-hint/g)).toHaveLength(2)
  expect(hints).not.toContain('000000000012')
  expect(hints).not.toContain('.mp4')
})
test('ocultar todas las campañas no precarga una campaña por defecto', async () => {
  const result = await read('empty')
  expect(result.valid).toBe(true)
  expect(result.markup).toContain('aroma-public-home')
  expect(result.markup).not.toContain('data-home-hero-hint')
})
for (const scenario of ['malformed', 'offline', 'private-payload'])
  test(
    'un documento no verificado conserva el arranque ordinario: ' + scenario,
    async () => {
      const result = await read(scenario)
      expect(result.valid).toBe(false)
      expect(result.markup).toBe('')
    },
  )
test('las importaciones del inventario mantienen la resolución correspondiente', async () => {
  const result = await read('alias')
  expect(result.valid).toBe(true)
  expect(result.markup.split('<script')[0]).not.toContain(
    '/images/hero-v2-lumiere-mobile-780.webp',
  )
})
