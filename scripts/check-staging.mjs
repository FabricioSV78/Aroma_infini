import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import ts from 'typescript'
import { loadEnv } from 'vite'
import {
  MEDIA_VARIANT_MAX_BYTES,
  MEDIA_PREPARED_MAX_PIXELS,
  parseManagedMediaAsset,
  parseManagedMediaPath,
  parseManagedVideoAsset,
  parseManagedVideoPath,
} from '../src/domain/media.ts'

const limits = Object.freeze({
  requests: 128,
  downloadedBytes: 64 * 1024 * 1024,
  responseBytes: 8 * 1024 * 1024,
  requestTimeoutMs: 15000,
  totalTimeoutMs: 180000,
  catalogProducts: 12,
  managedImages: 6,
  managedVideos: 2,
})

/** No arbitrary destinations, server keys, browser sessions or CLI credentials. */
export function validateStagingConfiguration({ config, publicEnv }) {
  try {
    const stage = config.env.staging
    const origin = new URL(stage.vars.CHECKOUT_SIMULATION_ORIGIN)
    const database = new URL(stage.vars.SUPABASE_URL)
    const key = publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY
    assert.equal(stage.vars.APP_ENVIRONMENT, 'staging')
    assert.equal(origin.href, `${origin.origin}/`)
    assert.equal(origin.protocol, 'https:')
    assert.match(origin.hostname, /^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/)
    assert.equal(origin.hostname.split('.')[0], stage.name)
    assert.equal(origin.port, '')
    assert.equal(origin.username, '')
    assert.equal(origin.password, '')
    assert.match(database.href, /^https:\/\/[a-z]{20}\.supabase\.co\/$/)
    assert.equal(new URL(publicEnv.VITE_SUPABASE_URL).href, database.href)
    assert.equal(typeof key, 'string')
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
      assert.match(key, /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
      const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url'))
      assert.equal(claims.role, 'anon')
    }
    return {
      origin: origin.origin,
      supabaseOrigin: database.origin,
      publishableKey: key,
    }
  } catch {
    throw new Error('staging-configuration')
  }
}

/** A bounded availability sample, never a bucket inventory, backup or load test. */
export async function runStagingChecks({
  config,
  publicEnv,
  fetchImpl = fetch,
}) {
  const { origin, supabaseOrigin, publishableKey } =
    validateStagingConfiguration({ config, publicEnv })
  const deadline = AbortSignal.timeout(limits.totalTimeoutMs)
  const stats = {
    requests: 0,
    downloadedBytes: 0,
    catalogProducts: 0,
    catalogTotal: 0,
    managedImagesDiscovered: 0,
    managedImagesChecked: 0,
    managedImageVariantsChecked: 0,
    managedVideosDiscovered: 0,
    managedVideosChecked: 0,
  }
  const checks = []
  async function check(code, action) {
    try {
      await action()
      checks.push({ code, status: 'passed' })
      return true
    } catch {
      // Fetch, decoding and server errors may contain response text or keys.
      checks.push({ code, status: 'failed', reason: 'contract-or-connection' })
      return false
    }
  }
  async function request(path, { method = 'GET', headers = {}, rpc } = {}) {
    assert(!deadline.aborted)
    assert(stats.requests < limits.requests)
    assert.match(path, /^\/(?!\/)[A-Za-z0-9/_.?=&-]+$|^\/$/)
    assert(!path.split(/[/?]/).includes('..'))
    if (rpc) {
      assert.equal(method, 'POST')
      assert(['catalog_products', 'home_document'].includes(rpc))
      assert.equal(path, `/rest/v1/rpc/${rpc}`)
    } else assert(['GET', 'HEAD'].includes(method))
    stats.requests++
    return fetchImpl(new URL(path, rpc ? supabaseOrigin : origin), {
      method,
      redirect: 'manual',
      credentials: 'omit',
      signal: AbortSignal.any([
        deadline,
        AbortSignal.timeout(limits.requestTimeoutMs),
      ]),
      headers: {
        ...headers,
        ...(rpc
          ? {
              apikey: publishableKey,
              'Accept-Profile': 'api',
              'Content-Profile': 'api',
              'Content-Type': 'application/json',
            }
          : {}),
      },
      ...(rpc
        ? {
            body: JSON.stringify(
              rpc === 'catalog_products'
                ? { p_limit: limits.catalogProducts, p_offset: 0 }
                : {},
            ),
          }
        : {}),
    })
  }
  async function bytes(response, maximum = limits.responseBytes) {
    const chunks = []
    let size = 0
    const reader = response.body?.getReader()
    try {
      const declared = response.headers.get('content-length')
      if (declared !== null) {
        assert.match(declared, /^\d+$/)
        assert(Number(declared) <= maximum)
      }
      if (!reader) return Buffer.alloc(0)
      while (true) {
        assert(!deadline.aborted)
        const next = await reader.read()
        if (next.done) break
        size += next.value.byteLength
        stats.downloadedBytes += next.value.byteLength
        assert(size <= maximum)
        assert(stats.downloadedBytes <= limits.downloadedBytes)
        chunks.push(next.value)
      }
      return Buffer.concat(chunks)
    } finally {
      if (reader) {
        await reader.cancel().catch(() => {})
        reader.releaseLock()
      }
    }
  }
  async function expectResponse(response, status, type, maximum) {
    try {
      assert.equal(response.status, status)
      if (type) assert.match(response.headers.get('content-type') || '', type)
      return await bytes(response, maximum)
    } catch (error) {
      await response.body?.cancel().catch(() => {})
      throw error
    }
  }
  function nosniff(response) {
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
  }
  function immutable(response, requireEtag = true) {
    nosniff(response)
    const cache = response.headers.get('cache-control') || ''
    assert.match(cache, /\bpublic\b/i)
    assert.match(cache, /\bimmutable\b/i)
    assert.match(cache, /\bmax-age=31536000\b/i)
    const etag = response.headers.get('etag')
    if (requireEtag) {
      assert.match(etag || '', /^"[^"\r\n]+"$/)
      assert.equal(response.headers.get('access-control-allow-origin'), '*')
    }
    return etag
  }
  let shell = ''
  const pages = [
    '/',
    '/tienda',
    '/marcas',
    '/contacto',
    '/envios',
    '/seguir-pedido',
    '/iniciar-sesion',
    '/crear-cuenta',
    '/cuenta',
    '/admin/login',
    '/admin',
  ]
  async function page(path, status = 200, applicationShell = true) {
    const response = await request(path)
    const html = (
      await expectResponse(response, status, /^text\/html\b/i, 2 * 1024 * 1024)
    ).toString()
    nosniff(response)
    assert.equal(response.headers.get('x-frame-options'), 'DENY')
    assert.equal(
      response.headers.get('referrer-policy'),
      'strict-origin-when-cross-origin',
    )
    if (applicationShell) assert.match(html, /id=["']root["']/)
    else assert.match(html, /<!doctype html>/i)
    const robots = `${response.headers.get('x-robots-tag') || ''} ${
      html.match(/<meta\b(?=[^>]*name=["']robots["'])[^>]*>/i)?.[0] || ''
    }`
    assert.match(robots, /\bnoindex\b/i)
    return html
  }
  for (const path of pages) {
    await check(
      `page-${path === '/' ? 'home' : path.slice(1).replaceAll('/', '-')}`,
      async () => {
        const html = await page(path)
        if (path === '/') shell = html
      },
    )
  }
  await check('compiled-assets', async () => {
    // Entry scripts/styles only: font and module preloads are not entry points.
    const paths = [
      ...new Set(
        [...shell.matchAll(/<(?:script|link)\b[^>]*>/gi)]
          .map(([tag]) =>
            /^<script\b/i.test(tag)
              ? tag.match(/\bsrc=["']([^"']+)["']/i)?.[1]
              : /\brel=["']stylesheet["']/i.test(tag)
                ? tag.match(/\bhref=["']([^"']+)["']/i)?.[1]
                : undefined,
          )
          .filter(Boolean),
      ),
    ]
    assert(paths.length >= 2 && paths.length <= 12)
    for (const path of paths)
      assert.match(path, /^\/assets\/[A-Za-z0-9_-]+\.(?:js|css)$/)
    assert(paths.some((path) => path.endsWith('.js')))
    assert(paths.some((path) => path.endsWith('.css')))
    for (const path of paths) {
      const response = await request(path)
      const data = await expectResponse(
        response,
        200,
        path.endsWith('.js')
          ? /^(?:text|application)\/javascript\b/i
          : /^text\/css\b/i,
      )
      immutable(response, false)
      assert(data.length > 0)
    }
  })
  await check('legacy-catalog-redirect', async () => {
    const response = await request('/catalogo?marca=operational-check')
    await expectResponse(response, 308)
    assert.equal(
      response.headers.get('location'),
      `${origin}/tienda?marca=operational-check`,
    )
  })
  await check('staging-robots', async () => {
    const response = await request('/robots.txt')
    const content = (
      await expectResponse(response, 200, /^text\/plain\b/i, 65536)
    ).toString()
    assert.match(content, /User-agent:\s*\*/i)
    assert(!/^\s*Sitemap:/im.test(content))
  })
  await check('missing-route', () =>
    page('/staging-operational-check-missing', 404, false),
  )
  await check('missing-product', () =>
    page('/producto/staging-operational-check-missing', 404),
  )
  for (const [code, path, status] of [
    ['private-media-closed', '/media/private/staging-operational-check', 404],
    ['checkout-read-only-method', '/api/checkout/simulate', 405],
  ]) {
    await check(code, async () => {
      const response = await request(path)
      await expectResponse(response, status, undefined, 65536)
      nosniff(response)
      assert.match(response.headers.get('cache-control') || '', /\bno-store\b/i)
    })
  }
  const images = new Map(),
    videos = new Map()
  function collect(assets) {
    assert(Array.isArray(assets) && assets.length <= 100)
    const parsed = []
    for (const source of assets) {
      const asset =
        source?.mimeType === 'video/mp4'
          ? parseManagedVideoAsset(source)
          : parseManagedMediaAsset(source)
      const destination = 'mimeType' in asset ? videos : images
      if (destination.has(asset.id))
        assert.deepEqual(destination.get(asset.id), asset)
      else destination.set(asset.id, asset)
      parsed.push(asset)
    }
    return parsed
  }
  function references(document, assets) {
    const declared = new Set(
      assets.flatMap((asset) => [
        asset.src,
        ...('variants' in asset
          ? asset.variants.map((variant) => variant.src)
          : []),
      ]),
    )
    let nodes = 0
    function visit(value, depth = 0) {
      assert(depth <= 20 && ++nodes <= 20000)
      if (typeof value === 'string' && value.startsWith('/media/')) {
        assert(parseManagedMediaPath(value) || parseManagedVideoPath(value))
        assert(declared.has(value))
      } else if (value && typeof value === 'object') {
        for (const child of Object.values(value)) visit(child, depth + 1)
      }
    }
    visit(document)
  }
  await check('public-catalog-and-product', async () => {
    const response = await request('/rest/v1/rpc/catalog_products', {
      method: 'POST',
      rpc: 'catalog_products',
    })
    const data = JSON.parse(
      await expectResponse(
        response,
        200,
        /^application\/json\b/i,
        2 * 1024 * 1024,
      ),
    )
    assert(
      Array.isArray(data.items) && data.items.length <= limits.catalogProducts,
    )
    assert(Number.isSafeInteger(data.total) && data.total >= data.items.length)
    stats.catalogProducts = data.items.length
    stats.catalogTotal = data.total
    for (const product of data.items) {
      assert.match(product.product?.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      references(product, collect(product.mediaAssets ?? []))
    }
    if (data.items.length) await page(`/producto/${data.items[0].product.slug}`)
  })
  await check('public-home', async () => {
    const response = await request('/rest/v1/rpc/home_document', {
      method: 'POST',
      rpc: 'home_document',
    })
    const data = JSON.parse(
      await expectResponse(response, 200, /^application\/json\b/i, 1024 * 1024),
    )
    assert(Number.isSafeInteger(data.version) && data.version >= 0)
    references(data, collect(data.mediaAssets))
  })
  stats.managedImagesDiscovered = images.size
  stats.managedVideosDiscovered = videos.size
  for (const [index, asset] of [...images.values()]
    .slice(0, limits.managedImages)
    .entries()) {
    await check(`managed-image-${index + 1}`, async () => {
      for (const variant of asset.variants) {
        const response = await request(variant.src)
        const data = await expectResponse(
          response,
          200,
          /^image\/webp\b/i,
          MEDIA_VARIANT_MAX_BYTES,
        )
        const etag = immutable(response)
        assert.equal(
          Number(response.headers.get('content-length')),
          data.length,
        )
        const decoder = sharp(data, {
          limitInputPixels: MEDIA_PREPARED_MAX_PIXELS,
        })
        const metadata = await decoder.metadata()
        assert.equal(metadata.format, 'webp')
        assert.equal(metadata.width, variant.width)
        assert.equal(metadata.height, variant.height)
        await decoder.stats() // Decode the complete image, not just its header.
        if (variant.src === asset.src)
          assert.equal(
            createHash('sha256').update(data).digest('hex'),
            parseManagedMediaPath(asset.src).hash,
          )
        const head = await request(variant.src, { method: 'HEAD' })
        assert.equal(
          (
            await expectResponse(
              head,
              200,
              /^image\/webp\b/i,
              MEDIA_VARIANT_MAX_BYTES,
            )
          ).length,
          0,
        )
        assert.equal(immutable(head), etag)
        assert.match(head.headers.get('content-type') || '', /^image\/webp\b/i)
        assert.equal(Number(head.headers.get('content-length')), data.length)
        const cached = await request(variant.src, {
          headers: { 'If-None-Match': etag },
        })
        assert.equal(
          (
            await expectResponse(
              cached,
              304,
              undefined,
              MEDIA_VARIANT_MAX_BYTES,
            )
          ).length,
          0,
        )
        assert.equal(immutable(cached), etag)
        stats.managedImageVariantsChecked++
      }
      stats.managedImagesChecked++
    })
  }
  for (const [index, asset] of [...videos.values()]
    .slice(0, limits.managedVideos)
    .entries()) {
    await check(`managed-video-${index + 1}`, async () => {
      const head = await request(asset.src, { method: 'HEAD' })
      assert.equal(
        (await expectResponse(head, 200, /^video\/mp4\b/i, asset.byteSize))
          .length,
        0,
      )
      const etag = immutable(head)
      assert.match(head.headers.get('content-type') || '', /^video\/mp4\b/i)
      assert.equal(Number(head.headers.get('content-length')), asset.byteSize)
      assert.equal(head.headers.get('accept-ranges'), 'bytes')
      const end = Math.min(asset.byteSize - 1, 1023)
      const range = await request(asset.src, {
        headers: { Range: `bytes=0-${end}`, 'If-Range': etag },
      })
      const data = await expectResponse(range, 206, /^video\/mp4\b/i, end + 1)
      assert.equal(immutable(range), etag)
      assert.equal(
        range.headers.get('content-range'),
        `bytes 0-${end}/${asset.byteSize}`,
      )
      assert.equal(data.length, end + 1)
      stats.managedVideosChecked++
    })
  }
  return {
    scope: 'hosted-staging-read-only',
    result: checks.every((item) => item.status === 'passed')
      ? 'passed'
      : 'failed',
    commercialReady: false,
    checks,
    stats,
    limits,
    coverage:
      'Public pages, compiled assets and bounded published-media sample; no authentication, writes, bucket inventory, backup or full-video integrity check.',
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    assert(process.argv.slice(2).every((argument) => argument === '--json'))
    const parsed = ts.parseConfigFileTextToJson(
      'wrangler.jsonc',
      await readFile('wrangler.jsonc', 'utf8'),
    )
    assert(!parsed.error)
    const result = await runStagingChecks({
      config: parsed.config,
      publicEnv: loadEnv('staging', process.cwd(), 'VITE_'),
    })
    if (process.argv.includes('--json'))
      console.log(JSON.stringify(result, null, 2))
    else {
      for (const item of result.checks)
        console.log(`[${item.status}] ${item.code}`)
      console.log(
        `Staging: ${result.result}; ${result.stats.requests} solicitudes. Sin escrituras ni habilitación de producción.`,
      )
      console.log(
        `Medios comprobados: ${result.stats.managedImagesChecked}/${result.stats.managedImagesDiscovered} imágenes; ${result.stats.managedVideosChecked}/${result.stats.managedVideosDiscovered} vídeos publicados descubiertos en la muestra.`,
      )
    }
    process.exitCode = result.result === 'passed' ? 0 : 1
  } catch {
    console.error(
      'No se pudo comprobar staging. Revisa la configuración pública y la conexión; no se realizaron escrituras.',
    )
    process.exitCode = 1
  }
}
