import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import sharp from 'sharp'
import {
  runStagingChecks,
  validateStagingConfiguration,
} from '../scripts/check-staging.mjs'

const origin = 'https://aroma-staging.fixture.workers.dev'
const supabaseOrigin = 'https://abcdefghijklmnopqrst.supabase.co'
const publishableKey = 'sb_publishable_syntheticpublickey'
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), geolocation=(self), microphone=()',
}
const immutable = 'public, max-age=31536000, immutable'
const html = `<!doctype html><html lang="es"><head>
  <meta name="robots" content="noindex,nofollow">
  <script type="module" crossorigin src="/assets/index-Abc123.js"></script>
  <link rel="stylesheet" crossorigin href="/assets/index-Abc123.css">
  </head><body><div id="root"></div></body></html>`

function configuration() {
  return {
    config: {
      env: {
        staging: {
          name: 'aroma-staging',
          vars: {
            APP_ENVIRONMENT: 'staging',
            CHECKOUT_SIMULATION_ORIGIN: origin,
            SUPABASE_URL: supabaseOrigin,
          },
        },
      },
    },
    publicEnv: {
      VITE_SUPABASE_URL: supabaseOrigin,
      VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    },
  }
}

function jwt(role) {
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256' })}.${encode({ role })}.synthetic`
}

function response(body, status = 200, headers = {}) {
  return new Response(body, { status, headers })
}

function htmlResponse(status = 200, body = html) {
  return response(body, status, {
    ...securityHeaders,
    'Content-Type': 'text/html; charset=utf-8',
  })
}

async function imageFixture() {
  const id = '50000000-0000-4000-8000-000000000001'
  const master = await sharp({
    create: { width: 960, height: 1200, channels: 3, background: '#e8dfd1' },
  })
    .webp()
    .toBuffer()
  const derivative = await sharp(master).resize(480, 600).webp().toBuffer()
  const hash = createHash('sha256').update(master).digest('hex')
  const prefix = `/media/public/dynamic/${id}/${hash}`
  const variants = [
    { src: `${prefix}/480.webp`, width: 480, height: 600 },
    { src: `${prefix}/960.webp`, width: 960, height: 1200 },
  ]
  return {
    asset: { id, ...variants[1], variants },
    objects: new Map([
      [variants[0].src, derivative],
      [variants[1].src, master],
    ]),
  }
}

function videoFixture() {
  const id = '50000000-0000-4000-8000-000000000002'
  const bytes = Buffer.alloc(2048)
  bytes.writeUInt32BE(24, 0)
  bytes.write('ftypisom', 4)
  const hash = createHash('sha256').update(bytes).digest('hex')
  const src = `/media/public/dynamic/${id}/${hash}/video.mp4`
  return {
    asset: {
      id,
      src,
      width: 480,
      height: 480,
      durationMs: 2000,
      byteSize: bytes.length,
      mimeType: 'video/mp4',
    },
    bytes,
  }
}

function harness({
  image,
  video,
  images = image ? [image] : [],
  videos = video ? [video] : [],
  override,
  catalogTotal = Math.max(1, images.length),
} = {}) {
  const calls = []
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(
      typeof input === 'string' || input instanceof URL ? input : input.url,
    )
    const method = init.method || 'GET'
    const headers = new Headers(init.headers)
    calls.push({ url, method, headers, init })
    const replacement = await override?.({ url, method, headers, init, calls })
    if (replacement) return replacement
    assert.ok(
      [origin, supabaseOrigin].includes(url.origin),
      'Untrusted origin must not be fetched',
    )
    if (url.origin === supabaseOrigin) {
      assert.equal(method, 'POST')
      assert.equal(headers.get('apikey'), publishableKey)
      assert.equal(headers.get('authorization'), null)
      assert.equal(headers.get('content-profile'), 'api')
      if (url.pathname === '/rest/v1/rpc/catalog_products') {
        assert.deepEqual(JSON.parse(init.body), { p_limit: 12, p_offset: 0 })
        return response(
          JSON.stringify({
            total: catalogTotal,
            items: images.length
              ? images.map((item, index) => ({
                  product: { slug: `fixture-perfume-${index + 1}` },
                  detail: {},
                  mediaAssets: [item.asset],
                }))
              : [
                  {
                    product: { slug: 'fixture-perfume' },
                    detail: {},
                    mediaAssets: [],
                  },
                ],
          }),
          200,
          { 'Content-Type': 'application/json' },
        )
      }
      assert.equal(url.pathname, '/rest/v1/rpc/home_document')
      assert.deepEqual(JSON.parse(init.body), {})
      return response(
        JSON.stringify({
          version: videos.length ? 1 : 0,
          content: videos.length ? {} : null,
          media: videos.length ? {} : null,
          mediaAssets: videos.map((item) => item.asset),
        }),
        200,
        { 'Content-Type': 'application/json' },
      )
    }
    assert.ok(
      ['GET', 'HEAD'].includes(method),
      'Worker checks must never mutate',
    )
    assert.equal(headers.get('apikey'), null)
    assert.equal(headers.get('authorization'), null)
    if (url.pathname === '/catalogo') {
      return response(null, 308, { Location: `${origin}/tienda${url.search}` })
    }
    if (url.pathname === '/robots.txt') {
      return response('User-agent: *\nAllow: /\n', 200, {
        ...securityHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
      })
    }
    if (url.pathname.startsWith('/assets/')) {
      return response(
        url.pathname.endsWith('.css') ? 'body{margin:0}' : 'export{}',
        200,
        {
          ...securityHeaders,
          'Content-Type': url.pathname.endsWith('.css')
            ? 'text/css'
            : 'text/javascript',
          'Cache-Control': immutable,
        },
      )
    }
    if (url.pathname === '/media/private/staging-operational-check') {
      return response('{"code":"missing"}', 404, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
    }
    if (url.pathname === '/api/checkout/simulate') {
      return response('{"code":"method"}', 405, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        Allow: 'POST, OPTIONS',
        'X-Robots-Tag': 'noindex, nofollow',
      })
    }
    const matchingImage = images.find((item) => item.objects.has(url.pathname))
    if (matchingImage) {
      const bytes = matchingImage.objects.get(url.pathname)
      const etag = `"${createHash('sha256').update(bytes).digest('hex')}"`
      const common = {
        'Content-Type': 'image/webp',
        'Content-Length': String(bytes.length),
        'Cache-Control': immutable,
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin': '*',
        ETag: etag,
      }
      if (headers.get('if-none-match') === etag)
        return response(null, 304, common)
      return response(method === 'HEAD' ? null : bytes, 200, common)
    }
    const matchingVideo = videos.find((item) => item.asset.src === url.pathname)
    if (matchingVideo) {
      const etag = '"fixture-video"'
      const common = {
        'Content-Type': 'video/mp4',
        'Content-Length': String(matchingVideo.bytes.length),
        'Accept-Ranges': 'bytes',
        'Cache-Control': immutable,
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin': '*',
        ETag: etag,
      }
      if (method === 'HEAD') return response(null, 200, common)
      assert.equal(headers.get('range'), 'bytes=0-1023')
      return response(matchingVideo.bytes.subarray(0, 1024), 206, {
        ...common,
        'Content-Length': '1024',
        'Content-Range': `bytes 0-1023/${matchingVideo.bytes.length}`,
      })
    }
    if (url.pathname === '/staging-operational-check-missing') {
      return htmlResponse(
        404,
        html.replace(
          '<div id="root"></div>',
          '<main><h1>No encontrado</h1></main>',
        ),
      )
    }
    return htmlResponse(
      url.pathname.includes('operational-check-missing') ? 404 : 200,
    )
  }
  return { calls, fetchImpl }
}

async function run(options) {
  const fixture = harness(options)
  return {
    fixture,
    result: await runStagingChecks({
      ...configuration(),
      fetchImpl: fixture.fetchImpl,
    }),
  }
}

test('staging configuration accepts only the explicitly declared public origins', () => {
  assert.deepEqual(validateStagingConfiguration(configuration()), {
    origin,
    supabaseOrigin,
    publishableKey,
  })
  const legacy = configuration()
  legacy.publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY = jwt('anon')
  assert.equal(validateStagingConfiguration(legacy).publishableKey, jwt('anon'))
})

test('invalid origins, mismatched projects and privileged credentials fail before any request', async () => {
  for (const mutate of [
    (value) => {
      value.config.env.staging.vars.CHECKOUT_SIMULATION_ORIGIN =
        'http://127.0.0.1:5173'
    },
    (value) => {
      value.config.env.staging.vars.CHECKOUT_SIMULATION_ORIGIN =
        'https://unrelated.example.com'
    },
    (value) => {
      value.config.env.staging.vars.CHECKOUT_SIMULATION_ORIGIN = `${origin}/private`
    },
    (value) => {
      value.config.env.staging.vars.CHECKOUT_SIMULATION_ORIGIN = `${origin}:8443`
    },
    (value) => {
      value.config.env.staging.vars.CHECKOUT_SIMULATION_ORIGIN = origin.replace(
        'https://',
        'https://user:password@',
      )
    },
    (value) => {
      value.config.env.staging.vars.APP_ENVIRONMENT = 'production'
    },
    (value) => {
      value.config.env.staging.name = 'different-worker'
    },
    (value) => {
      value.publicEnv.VITE_SUPABASE_URL =
        'https://tsrqponmlkjihgfedcba.supabase.co'
    },
    (value) => {
      value.publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_secret_neverexpose'
    },
    (value) => {
      value.publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY = jwt('service_role')
    },
  ]) {
    const input = configuration()
    mutate(input)
    let requests = 0
    await assert.rejects(
      runStagingChecks({
        ...input,
        fetchImpl: async () => {
          requests++
          throw new Error('unreachable')
        },
      }),
      {
        message: 'staging-configuration',
      },
    )
    assert.equal(requests, 0)
  }
})

test('read-only smoke checks accept a healthy shell without claiming commercial launch readiness', async () => {
  const { fixture, result } = await run()
  assert.equal(result.result, 'passed', JSON.stringify(result.checks))
  assert.equal(result.scope, 'hosted-staging-read-only')
  assert.equal(result.commercialReady, false)
  assert.equal(result.stats.catalogProducts, 1)
  assert.equal(result.stats.managedImagesChecked, 0)
  assert.equal(result.stats.managedVideosChecked, 0)
  assert.ok(fixture.calls.length > 10)
  for (const call of fixture.calls) {
    assert.equal(call.init.redirect, 'manual')
    assert.equal(call.init.credentials, 'omit')
    assert.ok(call.init.signal instanceof AbortSignal)
    if (call.method === 'POST') assert.equal(call.url.origin, supabaseOrigin)
  }
  const serialized = JSON.stringify(result)
  assert.ok(!serialized.includes(publishableKey))
  assert.ok(!serialized.includes('fixture-perfume'))
})

test('the master SHA256 is verified while legitimate resized derivative bytes remain valid', async () => {
  const image = await imageFixture()
  assert.notEqual(
    createHash('sha256')
      .update(image.objects.get(image.asset.src))
      .digest('hex'),
    createHash('sha256')
      .update(image.objects.get(image.asset.variants[0].src))
      .digest('hex'),
  )
  const { fixture, result } = await run({ image })
  assert.equal(result.result, 'passed', JSON.stringify(result.checks))
  assert.equal(result.stats.managedImagesDiscovered, 1)
  assert.equal(result.stats.managedImagesChecked, 1)
  for (const variant of image.asset.variants) {
    assert.ok(
      fixture.calls.some(
        (call) => call.url.pathname === variant.src && call.method === 'HEAD',
      ),
    )
    assert.ok(
      fixture.calls.some(
        (call) =>
          call.url.pathname === variant.src &&
          call.headers.has('if-none-match'),
      ),
    )
  }
})

test('corrupt image content fails even when MIME, dimensions and ETag appear consistent', async () => {
  const image = await imageFixture()
  const alternate = await sharp({
    create: { width: 960, height: 1200, channels: 3, background: '#003d34' },
  })
    .webp()
    .toBuffer()
  image.objects.set(image.asset.src, alternate)
  const { result } = await run({ image })
  assert.equal(result.result, 'failed')
  assert.ok(
    result.checks.some(
      (item) => item.code === 'managed-image-1' && item.status === 'failed',
    ),
  )
})

test('truncated WebP bytes are rejected by full decoding even with matching public hash', async () => {
  const image = await imageFixture()
  const bytes = image.objects.get(image.asset.src).subarray(0, 32)
  const hash = createHash('sha256').update(bytes).digest('hex')
  const previous = image.asset.src.split('/')[5]
  image.asset.src = image.asset.src.replace(previous, hash)
  image.asset.variants = image.asset.variants.map((item) => ({
    ...item,
    src: item.src.replace(previous, hash),
  }))
  image.objects = new Map(
    image.asset.variants.map((item) => [
      item.src,
      item.width === image.asset.width ? bytes : [...image.objects.values()][0],
    ]),
  )
  const { result } = await run({ image })
  assert.equal(result.result, 'failed')
  assert.ok(
    result.checks.some(
      (item) => item.code === 'managed-image-1' && item.status === 'failed',
    ),
  )
})

test('a HEAD length inconsistent with the downloaded image is reported as failure', async () => {
  const image = await imageFixture()
  const { result } = await run({
    image,
    override: ({ url, method }) => {
      if (method !== 'HEAD' || !image.objects.has(url.pathname)) return
      const bytes = image.objects.get(url.pathname)
      return response(null, 200, {
        'Content-Type': 'image/webp',
        'Content-Length': String(bytes.length + 1),
        'Cache-Control': immutable,
        'X-Content-Type-Options': 'nosniff',
        ETag: `"${createHash('sha256').update(bytes).digest('hex')}"`,
      })
    },
  })
  assert.equal(result.result, 'failed')
  assert.ok(
    result.checks.some(
      (item) => item.code === 'managed-image-1' && item.status === 'failed',
    ),
  )
})

test('video availability uses bounded range reads with the declared total size', async () => {
  const video = videoFixture()
  const { fixture, result } = await run({ video })
  assert.equal(result.result, 'passed', JSON.stringify(result.checks))
  assert.equal(result.stats.managedVideosDiscovered, 1)
  assert.equal(result.stats.managedVideosChecked, 1)
  const reads = fixture.calls.filter(
    (call) => call.url.pathname === video.asset.src && call.method === 'GET',
  )
  assert.equal(reads.length, 1)
  assert.equal(reads[0].headers.get('range'), 'bytes=0-1023')
})

test('sample limits report discovered media without downloading the entire catalog', async () => {
  const baseImage = await imageFixture()
  const images = Array.from({ length: 8 }, (_, index) => {
    const id = `50000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`
    return {
      asset: {
        ...baseImage.asset,
        id,
        src: baseImage.asset.src.replace(baseImage.asset.id, id),
        variants: baseImage.asset.variants.map((item) => ({
          ...item,
          src: item.src.replace(baseImage.asset.id, id),
        })),
      },
      objects: new Map(
        [...baseImage.objects].map(([path, bytes]) => [
          path.replace(baseImage.asset.id, id),
          bytes,
        ]),
      ),
    }
  })
  const baseVideo = videoFixture()
  const videos = Array.from({ length: 3 }, (_, index) => {
    const id = `50000000-0000-4000-8000-${String(index + 30).padStart(12, '0')}`
    return {
      ...baseVideo,
      asset: {
        ...baseVideo.asset,
        id,
        src: baseVideo.asset.src.replace(baseVideo.asset.id, id),
      },
    }
  })
  const { fixture, result } = await run({ images, videos, catalogTotal: 1000 })
  assert.equal(result.result, 'passed', JSON.stringify(result.checks))
  assert.equal(result.stats.catalogProducts, 8)
  assert.equal(result.stats.catalogTotal, 1000)
  assert.equal(result.stats.managedImagesDiscovered, 8)
  assert.equal(result.stats.managedImagesChecked, 6)
  assert.equal(result.stats.managedVideosDiscovered, 3)
  assert.equal(result.stats.managedVideosChecked, 2)
  assert.ok(result.stats.requests <= result.limits.requests)
  assert.ok(result.stats.downloadedBytes <= result.limits.downloadedBytes)
  assert.ok(
    !fixture.calls.some((call) => call.url.pathname === images[7].asset.src),
  )
  assert.ok(
    !fixture.calls.some((call) => call.url.pathname === videos[2].asset.src),
  )
})

test('missing noindex and security headers produce a failed operational check', async () => {
  const { result } = await run({
    override: ({ url }) => {
      if (url.origin === origin && url.pathname === '/') {
        return response(html.replace('noindex,nofollow', 'index,follow'), 200, {
          'Content-Type': 'text/html',
        })
      }
    },
  })
  assert.equal(result.result, 'failed')
})

test('offsite redirects are never followed or reported with their sensitive URL', async () => {
  const sensitiveUrl =
    'https://outside.example.invalid/?token=never-report-this-token'
  const { fixture, result } = await run({
    override: ({ url }) => {
      if (url.pathname === '/catalogo')
        return response(null, 308, { Location: sensitiveUrl })
    },
  })
  assert.equal(result.result, 'failed')
  assert.ok(
    fixture.calls.every(
      (call) => call.url.origin !== 'https://outside.example.invalid',
    ),
  )
  assert.ok(!JSON.stringify(result).includes('never-report-this-token'))
})

test('untrusted HTML asset references cannot direct probes to another server', async () => {
  const { fixture, result } = await run({
    override: ({ url }) => {
      if (url.pathname === '/')
        return htmlResponse(
          200,
          html.replace(
            '/assets/index-Abc123.js',
            '//outside.example.invalid/leak.js',
          ),
        )
    },
  })
  assert.equal(result.result, 'failed')
  assert.ok(
    fixture.calls.every((call) =>
      [origin, supabaseOrigin].includes(call.url.origin),
    ),
  )
})

test('oversized streamed responses are canceled without trusting a missing Content-Length', async () => {
  let canceled = false
  const { result } = await run({
    override: ({ url }) => {
      if (url.pathname !== '/') return
      return response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(new Uint8Array(1024 * 1024))
          },
          cancel() {
            canceled = true
          },
        }),
        200,
        { ...securityHeaders, 'Content-Type': 'text/html' },
      )
    },
  })
  assert.equal(result.result, 'failed')
  assert.equal(canceled, true)
})

test('network exceptions and server response bodies are redacted from the report', async () => {
  const marker = 'synthetic-private-key-please-do-not-report'
  const { result } = await run({
    override: ({ url }) => {
      if (url.pathname === '/')
        throw new Error(`https://user:${marker}@outside.invalid/private`)
      if (url.pathname === '/rest/v1/rpc/home_document')
        return response(marker, 503)
    },
  })
  assert.equal(result.result, 'failed')
  assert.ok(!JSON.stringify(result).includes(marker))
  assert.ok(!JSON.stringify(result).includes(publishableKey))
})

test('media manifests with offsite URLs are rejected before any outbound media request', async () => {
  const image = await imageFixture()
  image.asset.src = 'https://outside.example.invalid/leak.webp'
  const { fixture, result } = await run({ image })
  assert.equal(result.result, 'failed')
  assert.ok(
    fixture.calls.every((call) =>
      [origin, supabaseOrigin].includes(call.url.origin),
    ),
  )
})

test('published managed image references require a matching public manifest before any media read', async () => {
  const image = await imageFixture()
  const { fixture, result } = await run({
    override: ({ url }) => {
      if (url.pathname !== '/rest/v1/rpc/catalog_products') return
      return response(
        JSON.stringify({
          total: 1,
          items: [
            {
              product: { slug: 'fixture-perfume', image: image.asset.src },
              detail: {},
              mediaAssets: [],
            },
          ],
        }),
        200,
        { 'Content-Type': 'application/json' },
      )
    },
  })
  assert.equal(result.result, 'failed')
  assert.ok(
    result.checks.some(
      (item) =>
        item.code === 'public-catalog-and-product' && item.status === 'failed',
    ),
  )
  assert.ok(
    !fixture.calls.some((call) => call.url.pathname === image.asset.src),
  )
})
