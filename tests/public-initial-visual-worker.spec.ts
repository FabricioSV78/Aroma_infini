import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { expect, test } from '@playwright/test'
import { HOME_BOOTSTRAP_ID } from '../src/domain/home-bootstrap'

let runtime: Miniflare

test.beforeAll(async () => {
  const compiled = await build({
    stdin: {
      resolveDir: process.cwd(),
      sourcefile: 'public-initial-visual-native-test.ts',
      loader: 'ts',
      contents: `
        import {publicInitialVisual} from './worker/public-initial-visual';
        import {publicInitialHeader} from './worker/public-initial-header';
        import {createSiteMediaSeoHandler} from './worker/site-media-seo';
        import {readInitialHome} from './worker/home-initial';
        import {createDefaultHomeContent} from './src/content/home-editor';
        const desktopId='61000000-0000-4000-8000-000000000011',mobileId='61000000-0000-4000-8000-000000000012',logoId='61000000-0000-4000-8000-000000000013';
        const photo=(id,width,height)=>{const src='/media/public/dynamic/'+id+'/'+'a'.repeat(64)+'/'+width+'.webp';return{id,src,width,height,variants:[{src,width,height}]}};
        const desktop=photo(desktopId,1536,864),mobile=photo(mobileId,1024,1536),productImage=photo('61000000-0000-4000-8000-000000000014',960,1200);
        const logo={id:logoId,src:'/media/public/dynamic/'+logoId+'/'+'b'.repeat(64)+'/vector.svg',width:774,height:374,byteSize:1200,mimeType:'image/svg+xml'};
        const brand={id:'71000000-0000-4000-8000-000000000001',name:'Casa & prueba',slug:'casa-prueba'};
        const record={active:true,gender:'unisex',popularity:0,newest:0,lowStockThreshold:2,
          product:{id:'51000000-0000-4000-8000-000000000001',name:'Rosa Clara',slug:'rosa-clara',brandId:brand.id,productType:'perfume',family:'Floral',olfactoryFamilies:['floral'],image:productImage.src,discount:null,variants:[{id:'51000000-0000-4000-8000-000000000002',sku:'1000',ml:50,priceCents:15000,finalPriceCents:15000,stock:8,active:true}]},
          detail:{shortDescription:'Una fragancia de prueba.',description:'Detalle de prueba.',olfactoryImage:null,notes:{top:[],heart:[],base:[]},intensity:'Suave',intensityLevel:1,occasion:'Diario',season:'Todo el año',gallery:[{image:productImage.src,alt:'Rosa Clara',framing:'full'}],recommendationIds:[]},mediaAssets:[productImage]};
        const catalog={items:[record],brands:[brand],features:{complementsEnabled:false},shipping:{freeThresholdCents:33000,provinceShippingEnabled:false,nationalCourierFeeCents:2000,nationalEstimate:'2 a 4 días',zones:[]},shippingVersion:0,featuredBrandId:null,olfactoryFamilies:[],total:1,availableTotal:1,page:1,pages:1,familyCodes:['floral'],profiles:[]};
        const product={record,brands:[brand],recommendations:[],mediaAssets:[productImage],shipping:catalog.shipping,olfactoryFamilies:[{value:'floral',label:'Floral',aromaLabel:'Floral de prueba',active:true,aliases:[]}]};
        const shell='<!doctype html><html><head><title>Intacto</title><link rel="stylesheet" href="/assets/site.css"></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>';
        export default {async fetch(request,env){
          const scenario=request.headers.get('X-Scenario')||'healthy',path=request.headers.get('X-Path')||'/',calls=[];
          const content=createDefaultHomeContent();
          content.hero=content.hero.slice(0,2).map((slide,index)=>({...slide,fallbackIndex:null,desktopImage:desktop.src,mobileImage:mobile.src,order:index,title:index===0?'Primera campaña':'Segunda campaña',alt:'Perfume editorial',description:'Texto & calma',destination:{type:'shop'},showText:true,showButton:true,cta:'Explorar tienda'}));
          if(scenario==='reordered'){content.hero[0].order=2;content.hero[1].order=0;}
          if(scenario==='escaped')Object.assign(content.hero[0],{title:'Calma <script>marca</script>',description:'Texto <img src=x onerror=alert(1)> & calma',alt:'Foto "especial" <prueba>'});
          if(scenario==='unpublished')content.hero[0].published=false;
          if(scenario==='empty')content.hero=[];
          if(scenario==='video')Object.assign(content.hero[0],{mediaType:'video',desktopImage:null,mobileImage:mobile.src,poster:desktop.src,video:'/media/public/dynamic/61000000-0000-4000-8000-000000000015/'+'c'.repeat(64)+'/video.mp4',mobilePoster:null,mobileVideo:null});
          const video={id:'61000000-0000-4000-8000-000000000015',src:'/media/public/dynamic/61000000-0000-4000-8000-000000000015/'+'c'.repeat(64)+'/video.mp4',width:1920,height:1080,durationMs:4000,byteSize:8000,mimeType:'video/mp4'};
          const raw={version:1,content,media:{hombre:null,mujer:null,unisex:null,complementos:null},mediaAssets:[desktop,mobile,...(scenario==='video'?[video]:[])]};
          const home=await readInitialHome(env,async()=>Response.json(raw));
          const mutable=structuredClone(catalog),mutableProduct=structuredClone(product);
          if(scenario==='unverified'){mutable.items[0].mediaAssets=[];mutableProduct.record.mediaAssets=[];mutableProduct.mediaAssets=[];if(home)home.assets=[];}
          if(scenario==='external'){mutable.items[0].product.image='https://outside.invalid/private.webp';mutableProduct.record.product.image='https://outside.invalid/private.webp';}
          if(scenario==='wrong-product')mutableProduct.record.product.slug='otro-producto';
          if(scenario==='inactive'){mutable.items[0].active=false;mutableProduct.record.active=false;}
          if(scenario==='public-projection'){delete mutable.items[0].active;delete mutableProduct.record.active;mutable.items[0].product.variants[0].label=null;mutableProduct.record.product.variants[0].label=null;}
          if(scenario==='zero-stock'){mutable.items[0].product.variants[0].stock=0;mutableProduct.record.product.variants[0].stock=0;}
          if(scenario==='product-escaped'){mutableProduct.record.product.name='Rosa <script>attack</script>';mutableProduct.record.detail.shortDescription='Calma <img src=x onerror=alert(1)>';mutable.items[0]=mutableProduct.record;}
          if(scenario==='no-items'){mutable.items=[];mutable.total=0;mutable.availableTotal=0;}
          if(new URL(request.url).pathname==='/pure')return Response.json({html:publicInitialVisual({path,home,catalog:mutable,product:mutableProduct,aliases:new Map()}),valid:!!home});
          if(new URL(request.url).pathname==='/header')return Response.json({html:publicInitialHeader({home:scenario!=='not-home',logo:logo.src,announcement:{enabled:true,deliveryText:'Lima & Callao',freeShippingLabel:'Gratis desde',thresholdCents:33000}})});
          let held=false,release;
          const gate=new Promise(resolve=>release=resolve);
          const transport=async(input,init)=>{
            const u=new URL(input instanceof Request?input.url:input),headers=new Headers(init.headers);
            if(u.origin!==env.SUPABASE_URL||init.method!=='POST'||init.redirect!=='manual'||headers.has('authorization')||headers.has('cookie')||headers.get('apikey')!==env.SUPABASE_PUBLISHABLE_KEY)throw Error('private-boundary');
            calls.push({operation:u.pathname.split('/').at(-1),body:JSON.parse(init.body)});
            if(scenario==='offline')throw Error('private-error-marker');
            if(u.pathname.endsWith('/site_media_document')){
              if(['metadata-failed','both-metadata-failed'].includes(scenario))return Response.json({message:'private-error-marker'},{status:503});
              if(scenario==='metadata-invalid')return Response.json({items:[{slot:'identity.logo',asset:logo,version:'invalid'}]});
              return Response.json({items:[{slot:'identity.logo',asset:logo,assetId:logo.id,alt:'Aroma Infini',version:1}]});
            }
            if(u.pathname.endsWith('/public_media_aliases')){
              if(['aliases-failed','both-metadata-failed'].includes(scenario))return Response.json({message:'private-error-marker'},{status:503});
              if(scenario==='aliases-timeout')await new Promise((resolve,reject)=>{const abort=()=>reject(init.signal.reason);if(init.signal.aborted)abort();else init.signal.addEventListener('abort',abort,{once:true});});
              return Response.json({items:['metadata-failed','metadata-invalid'].includes(scenario)?[{path:'/brand/logo-on-light.svg',asset:logo}]:[]});
            }
            if(u.pathname.endsWith('/home_document'))return Response.json(raw);
            if(u.pathname.endsWith('/site_settings'))return Response.json({});
            if(u.pathname.endsWith('/catalog_home_context')||u.pathname.endsWith('/catalog_browse')){
              if(scenario==='streamed'){held=true;await gate;}
              return Response.json(mutable);
            }
            throw Error('unexpected-operation');
          };
          const handler=createSiteMediaSeoHandler({fetch:transport}),target=new Request('https://fixture.invalid'+path,{method:request.headers.get('X-Method')||'GET',headers:{Authorization:'Bearer visitor-private-token',Cookie:'visitor-private-cookie'}});
          const configuration={...env,APP_ENVIRONMENT:scenario==='production'?'production':'staging'};
          const prepared=path.startsWith('/producto/')?handler.prepareSettings(target,configuration):undefined;
          const response=await handler(new Response(shell,{headers:{'Content-Type':'text/html; charset=utf-8',ETag:'old','Content-Length':String(shell.length)}}),target,configuration,prepared?{...prepared,product:mutableProduct}:undefined);
          if(scenario==='streamed'){
            const reader=response.body.getReader(),decoder=new TextDecoder();let prefix='';
            while(!prefix.includes('</head>')){const chunk=await reader.read();if(chunk.done)break;prefix+=decoder.decode(chunk.value,{stream:true});}
            const wasHeld=held;release();let html=prefix;
            for(;;){const chunk=await reader.read();if(chunk.done)break;html+=decoder.decode(chunk.value,{stream:true});}html+=decoder.decode();
            return Response.json({html,prefix,held:wasHeld,calls,status:response.status,cacheControl:response.headers.get('Cache-Control')});
          }
          return Response.json({html:await response.text(),calls,status:response.status,cacheControl:response.headers.get('Cache-Control'),fallback:response.headers.get('X-Aroma-Public-Fallback'),publicReads:response.headers.get('X-Aroma-Public-Reads')});
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
        APP_ENVIRONMENT: 'staging',
        SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
      },
    }),
  )
})

test.afterAll(async () => runtime?.dispose())

async function read(
  scenario = 'healthy',
  path = '/',
  endpoint = '/pure',
  method = 'GET',
) {
  const response = await runtime.dispatchFetch(
    'https://fixture.invalid' + endpoint,
    {
      headers: { 'X-Scenario': scenario, 'X-Path': path, 'X-Method': method },
    },
  )
  return (await response.json()) as {
    html: string
    valid?: boolean
    prefix?: string
    held?: boolean
    calls?: { operation: string; body: Record<string, unknown> }[]
    status?: number
    cacheControl?: string
    fallback?: string | null
    publicReads?: string | null
  }
}

test('el Hero inicial usa únicamente la primera campaña publicada con imágenes verificadas y alternativas responsive', async () => {
  const { html, valid } = await read()
  expect(valid).toBe(true)
  expect(html).toContain('data-initial-content="home"')
  expect(html).toContain('Primera campaña')
  expect(html).not.toContain('Segunda campaña')
  expect(html.match(/<picture>/g)).toHaveLength(1)
  expect(html).toContain('000000000012')
  expect(html).toContain('000000000011')
  expect(html).toContain('fetchpriority="high"')
  expect(html).toContain('sizes="100vw"')
  expect(html).toContain('href="/tienda"')
  expect(html).not.toContain('/images/hero-')
  expect(html).not.toContain('sb_publishable_')
})

test('la publicación y el orden del Home determinan el visual inicial; los textos nunca se interpretan como HTML', async () => {
  const reordered = await read('reordered')
  expect(reordered.html).toContain('Segunda campaña')
  expect(reordered.html).not.toContain('Primera campaña')
  const escaped = await read('escaped')
  expect(escaped.html).toContain('&lt;script&gt;marca&lt;/script&gt;')
  expect(escaped.html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  expect(escaped.html).not.toContain('<script>marca')
  expect(escaped.html).not.toContain('<img src=x')
  for (const scenario of ['empty', 'unpublished', 'unverified'])
    expect((await read(scenario)).html).toBe('')
})

test('un slide de vídeo muestra solo sus imágenes de portada antes de React y nunca contiene fuentes MP4', async () => {
  const { html } = await read('video')
  expect(html).toContain('data-media-type="video"')
  expect(html).toContain('000000000012')
  expect(html).toContain('000000000011')
  expect(html).not.toContain('<video')
  expect(html).not.toContain('.mp4')
  expect(html).toContain('min-width: 1024px')
})

test('el encabezado progresivo utiliza enlaces nativos y no inventa cuentas, carrito ni destinatarios privados', async () => {
  const { html } = await read('healthy', '/', '/header')
  expect(html).toContain('href="/tienda"')
  expect(html).toContain('href="/carrito"')
  expect(html).toContain('href="/cuenta"')
  expect(html).toContain('href="#contenido"')
  expect(html).toContain('Lima &amp; Callao')
  expect(html).toContain('330')
  expect(html).not.toContain('visitor-private')
  expect(html).not.toContain('Carrito, 1')
})

test('las rutas privadas y desconocidas no reciben un visual de Home como sustitución', async () => {
  for (const path of [
    '/admin',
    '/admin/login',
    '/cuenta',
    '/checkout',
    '/carrito',
    '/auth/callback',
    '/desconocida',
    '/producto/uno/dos',
  ])
    expect((await read('healthy', path)).html).toBe('')
})

test('catálogo y ficha utilizan sus propios productos verificados y no habilitan compras antes del montaje interactivo', async () => {
  const catalog = await read('healthy', '/tienda')
  expect(catalog.html).toContain('Rosa Clara')
  expect(catalog.html).toContain('Casa &amp; prueba')
  expect(catalog.html).toContain('000000000014')
  expect(catalog.html).toContain('href="/producto/rosa-clara"')
  expect(catalog.html).not.toContain('Primera campaña')
  const product = await read('healthy', '/producto/rosa-clara')
  expect(product.html).toContain('Rosa Clara')
  expect(product.html).toContain('Una fragancia de prueba.')
  expect(product.html).toContain('000000000014')
  expect(product.html).toContain('product-gallery')
  expect(product.html).toContain('Floral de prueba')
  expect(product.html).toContain('Productos garantizados')
  expect(product.html).toContain('product-info-nav')
  expect(product.html).toContain('aria-disabled="true"')
  expect(product.html).not.toMatch(/<form\b/)
  expect(product.html).not.toMatch(
    /<button\b(?![^>]*\bdisabled\b)[^>]*>[^<]*Añadir/,
  )
  expect(product.html).not.toContain('sb_publishable_')
})

test('fichas sin disponibilidad o correspondencia exacta y fotografías no verificadas conservan el cliente como fallback', async () => {
  for (const scenario of ['unverified', 'external', 'inactive', 'zero-stock']) {
    expect((await read(scenario, '/tienda')).html).toBe('')
    expect((await read(scenario, '/producto/rosa-clara')).html).toBe('')
  }
  expect((await read('wrong-product', '/producto/rosa-clara')).html).toBe('')
  expect((await read('no-items', '/tienda')).html).toBe('')
})

test('los nombres y descripciones del producto se escapan también en el visual inicial', async () => {
  const product = await read('product-escaped', '/producto/rosa-clara')
  expect(product.html).toContain('Rosa &lt;script&gt;attack&lt;/script&gt;')
  expect(product.html).toContain('Calma &lt;img src=x onerror=alert(1)&gt;')
  expect(product.html).not.toContain('<script>attack')
  expect(product.html).not.toContain('<img src=x')
})

test('la proyección pública omite el flag administrativo y admite etiquetas opcionales nulas', async () => {
  expect((await read('public-projection', '/tienda')).html).toContain(
    'data-initial-content="catalog"',
  )
  expect(
    (await read('public-projection', '/producto/rosa-clara')).html,
  ).toContain('data-initial-content="product"')
})

test('la transformación nativa incluye un único root y contenido inicial sin duplicar lecturas ni reenviar la sesión', async () => {
  const result = await read('healthy', '/', '/integration')
  expect(result.html.match(/id="root"/g)).toHaveLength(1)
  expect(result.html.match(/id="contenido"/g)).toHaveLength(1)
  expect(result.html).toContain('data-public-initial-visual')
  expect(result.html).toContain('data-public-initial-path="/"')
  expect(result.html).toContain('Primera campaña')
  expect(result.html).toContain('Envíos en Lima y Callao')
  expect(result.html).toMatch(/Gratis desde S\/\s330/)
  expect(result.html).toContain('/assets/app.js')
  expect(result.html).toContain('/assets/site.css')
  expect(result.html).not.toContain('visitor-private')
  expect(result.html).not.toContain('sb_publishable_')
  expect(result.calls?.map((entry) => entry.operation).sort()).toEqual([
    'catalog_home_context',
    'home_document',
    'public_media_aliases',
    'site_media_document',
    'site_settings',
  ])
  expect(result.cacheControl).toBe('no-store')
})

test('el encabezado del documento se entrega antes de la proyección inicial retenida y el visual llega con su mismo contexto', async () => {
  const result = await read('streamed', '/', '/integration')
  expect(result.held).toBe(true)
  expect(result.prefix).toContain('</head>')
  expect(result.prefix).toContain('/assets/site.css')
  expect(result.prefix).not.toContain('data-public-initial-visual')
  expect(result.html).toContain('data-public-initial-visual')
  expect(result.html).toContain('aroma-public-initial-context')
  expect(result.html.match(/id="root"/g)).toHaveLength(1)
})

test('producción, fallos y métodos ajenos conservan el shell original sin visuales especulativos', async () => {
  for (const scenario of ['production', 'offline']) {
    const result = await read(scenario, '/', '/integration')
    expect(result.html).not.toContain('data-public-initial-visual')
    expect(result.html.match(/id="root"/g)).toHaveLength(1)
    expect(result.html).not.toContain('private-error-marker')
  }
  for (const method of ['HEAD', 'POST']) {
    const result = await read('healthy', '/', '/integration', method)
    expect(result.html).not.toContain('data-public-initial-visual')
    expect(result.calls).toEqual([])
  }
})

for (const [scenario, operation, phase, missing] of [
  ['metadata-failed', 'site_media_document', 'read', 'document'],
  ['metadata-invalid', 'site_media_document', 'validation', 'document'],
  ['aliases-failed', 'public_media_aliases', 'read', 'aliases'],
  ['aliases-timeout', 'public_media_aliases', 'read', 'aliases'],
] as const) {
  test(`un fallo aislado ${scenario} conserva Home, catálogo y ficha verificados sin repetir lecturas`, async () => {
    for (const [path, marker] of [
      ['/', 'Primera campaña'],
      ['/tienda', 'data-initial-content="catalog"'],
      ['/producto/rosa-clara', 'data-initial-content="product"'],
    ]) {
      const result = await read(scenario, path, '/integration')
      expect(result.status).toBe(200)
      expect(result.cacheControl).toBe('no-store')
      expect(result.fallback).toBe(`${operation}:${phase}`)
      expect(result.html).toContain('data-public-initial-visual')
      expect(result.html).toContain(marker)
      expect(result.html.match(/id="root"/g)).toHaveLength(1)
      expect(result.html).toContain('id="aroma-public-initial-context"')
      expect(result.html).not.toContain('private-error-marker')
      expect(result.html).not.toContain('visitor-private')
      expect(result.html).not.toContain('sb_publishable_')
      const metadata = JSON.parse(
        result.html.match(
          /<script[^>]*id="aroma-public-media"[^>]*>([^<]*)<\/script>/,
        )![1],
      )
      expect(metadata).not.toHaveProperty(missing)
      expect(metadata).toHaveProperty(
        missing === 'document' ? 'aliases' : 'document',
      )
      expect(metadata.ageMs).toBe(0)
      for (const name of new Set(
        result.calls?.map((entry) => entry.operation),
      )) {
        expect(
          result.calls?.filter((entry) => entry.operation === name),
        ).toHaveLength(1)
      }
      const diagnostics = JSON.parse(result.publicReads!) as {
        operation: string
        clientId: string
      }[]
      expect(
        diagnostics.some(
          (entry) =>
            entry.operation === operation &&
            /^[a-f0-9-]{36}$/.test(entry.clientId),
        ),
      ).toBe(true)
    }
  })
}

test('una caída de ambos metadatos conserva los DTO exitosos sin inventar el logo o imágenes de publicación', async () => {
  const result = await read('both-metadata-failed', '/', '/integration')
  expect(result.html).toContain('id="aroma-public-initial-context"')
  expect(result.html).toContain(`id="${HOME_BOOTSTRAP_ID}"`)
  expect(result.html).not.toContain('id="aroma-public-media"')
  expect(result.html).not.toContain('data-public-initial-visual')
  expect(result.html.match(/id="root"/g)).toHaveLength(1)
  expect(result.fallback).toBe(
    'public_media_aliases:read, site_media_document:read',
  )
  expect(result.html).not.toContain('private-error-marker')
  expect(result.cacheControl).toBe('no-store')
})
