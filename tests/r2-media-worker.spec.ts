import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { cleanupMedia, createMediaHandler } from '../worker/media-handler'
import { MEDIA_UPLOAD_MAX_BYTES } from '../src/domain/media'
import {
  decodeFixture,
  mediaTestOrigin,
  mediaTestActor,
  mediaWorkerHarness,
  uploadRequest,
  webpFixture,
  type ManagedMediaAsset,
} from './r2-media-worker-fixture'

function setup() {
  const fixture = mediaWorkerHarness()
  const handler = createMediaHandler({
    fetch: fixture.upstream,
    decodeWebp: decodeFixture,
  })
  return {
    ...fixture,
    handle: (request: Request) => handler(request, fixture.environment),
  }
}

async function readAsset(
  response: Response | null,
): Promise<ManagedMediaAsset> {
  expect(response).not.toBeNull()
  expect([200, 201]).toContain(response!.status)
  const result = await response!.json()
  return result.asset ?? result
}

test('unrelated routes stay with the application router', async () => {
  const fixture = setup()
  expect(
    await fixture.handle(new Request(`${mediaTestOrigin}/tienda`)),
  ).toBeNull()
  expect(fixture.calls).toHaveLength(0)
  expect(fixture.bucket.writes).toHaveLength(0)
})

test('upload refuses anonymous or invalid sessions without writing any object', async () => {
  const fixture = setup()
  const anonymous = await fixture.handle(
    await uploadRequest({ authorization: null }),
  )
  expect(anonymous?.status).toBe(401)
  fixture.state.authValid = false
  const invalid = await fixture.handle(await uploadRequest())
  expect(invalid?.status).toBe(401)
  expect(fixture.bucket.objects.size).toBe(0)
  expect(
    fixture.calls.some((call) => call.name === 'media_upload_complete'),
  ).toBe(false)
})

for (const [description, role, aal] of [
  ['customer', 'customer', 'aal2'],
  ['administrator without MFA', 'admin', 'aal1'],
] as const) {
  test(`${description} cannot upload through a crafted HTTP request`, async () => {
    const fixture = setup()
    fixture.state.role = role
    fixture.state.aal = aal
    const response = await fixture.handle(await uploadRequest())
    expect(response?.status).toBe(403)
    expect(fixture.bucket.objects.size).toBe(0)
    expect(fixture.reservations.size).toBe(0)
  })
}

test('an actor response for another user cannot authorize an upload', async () => {
  const fixture = setup()
  fixture.state.actorId = randomUUID()
  expect((await fixture.handle(await uploadRequest()))?.status).toBe(403)
  expect(fixture.bucket.objects.size).toBe(0)
})

for (const declared of [false, true])
  test(`an oversized media Auth response is rejected before R2 (declared=${declared})`, async () => {
    const fixture = mediaWorkerHarness()
    let cancelled = false
    const body = new TextEncoder().encode(
      JSON.stringify({
        id: mediaTestActor,
        private: 'PRIVATE_PROVIDER_DETAILS',
        padding: 'x'.repeat(512 * 1024),
      }),
    )
    const handler = createMediaHandler({
      fetch: async (input, init) => {
        if (String(input).endsWith('/auth/v1/user'))
          return new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(body)
              },
              cancel() {
                cancelled = true
                return new Promise<void>(() => {})
              },
            }),
            {
              headers: declared
                ? { 'Content-Length': String(body.length) }
                : {},
            },
          )
        return fixture.upstream(input, init)
      },
      decodeWebp: decodeFixture,
    })
    const response = await handler(await uploadRequest(), fixture.environment)
    expect(response?.status).toBe(503)
    expect(response?.headers.get('Cache-Control')).toBe('no-store')
    expect(await response?.text()).not.toContain('PRIVATE_PROVIDER_DETAILS')
    expect(cancelled).toBe(true)
    expect(fixture.calls).toHaveLength(0)
    expect(fixture.bucket.writes).toHaveLength(0)
  })

test('media Auth, RPC and garbage collection never follow upstream redirects', async () => {
  const fixture = mediaWorkerHarness()
  const policies: Array<RequestRedirect | undefined> = []
  const upstream: typeof fetch = (input, init) => {
    policies.push(init?.redirect)
    return fixture.upstream(input, init)
  }
  const handler = createMediaHandler({
    fetch: upstream,
    decodeWebp: decodeFixture,
  })
  expect(
    (await handler(await uploadRequest(), fixture.environment))?.status,
  ).toBe(200)
  await cleanupMedia(fixture.environment, upstream)
  expect(policies.length).toBeGreaterThan(3)
  expect(policies.every((policy) => policy === 'manual')).toBe(true)
})

test('origin is an additional restriction and never replaces the JWT', async () => {
  const fixture = setup()
  expect(
    (
      await fixture.handle(
        await uploadRequest({ origin: 'https://untrusted.example' }),
      )
    )?.status,
  ).toBe(403)
  expect(fixture.bucket.objects.size).toBe(0)
})

test('persistent SQL and edge rate limits reject before uploading', async () => {
  const fixture = setup()
  fixture.state.bindingRateAllowed = false
  expect((await fixture.handle(await uploadRequest()))?.status).toBe(429)
  fixture.state.bindingRateAllowed = true
  fixture.state.sqlRateLimited = true
  expect((await fixture.handle(await uploadRequest()))?.status).toBe(429)
  expect(fixture.bucket.objects.size).toBe(0)
})

for (const endpoint of ['upload', 'video-upload'])
  test(`an unfinished ${endpoint} body stops on deadline without writing or blocking on cancellation`, async () => {
    const fixture = mediaWorkerHarness()
    const deadline = new AbortController()
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]))
      },
      cancel() {
        cancelled = true
        return new Promise<void>(() => {})
      },
    })
    const original = await uploadRequest()
    const options: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: original.headers,
      body: stream,
      duplex: 'half',
    }
    const handler = createMediaHandler({
      fetch: fixture.upstream,
      decodeWebp: decodeFixture,
      requestSignal: () => deadline.signal,
    })
    const pending = handler(
      new Request(`${mediaTestOrigin}/api/admin/media/${endpoint}`, options),
      fixture.environment,
    )
    await expect.poll(() => stream.locked).toBe(true)
    deadline.abort()
    const response = await pending
    expect(response?.status).toBe(408)
    expect(cancelled).toBe(true)
    expect(fixture.reservations.size).toBe(0)
    expect(fixture.bucket.writes).toHaveLength(0)
  })

test('an oversized media stream is rejected without awaiting a stalled cancel callback', async () => {
  const fixture = mediaWorkerHarness()
  const original = await uploadRequest()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(MEDIA_UPLOAD_MAX_BYTES + 65537))
    },
    cancel: () => new Promise<void>(() => {}),
  })
  const options: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    headers: original.headers,
    body: stream,
    duplex: 'half',
  }
  const handler = createMediaHandler({
    fetch: fixture.upstream,
    decodeWebp: decodeFixture,
  })
  expect(
    (await handler(new Request(original.url, options), fixture.environment))
      ?.status,
  ).toBe(413)
  expect(fixture.reservations.size).toBe(0)
  expect(fixture.bucket.writes).toHaveLength(0)
})

test('a valid upload writes immutable verified variants and registers only references', async () => {
  const fixture = setup()
  const operationId = randomUUID()
  const asset = await readAsset(
    await fixture.handle(await uploadRequest({ operationId })),
  )
  expect(asset.id).toMatch(/^[0-9a-f-]{36}$/)
  expect(asset.width).toBe(1600)
  expect(asset.height).toBe(2000)
  expect(
    asset.variants.map((variant) => variant.width).sort((a, b) => a - b),
  ).toEqual([480, 960, 1600])
  expect(fixture.bucket.objects.size).toBe(3)
  expect(fixture.bucket.heads.length).toBeGreaterThanOrEqual(3)
  for (const [key, stored] of fixture.bucket.objects) {
    expect(key).toMatch(
      new RegExp(
        `^public/dynamic/${asset.id}/[a-f0-9]{64}/(?:480|960|1600)\\.webp$`,
      ),
    )
    expect(stored.httpMetadata?.contentType).toBe('image/webp')
    expect(stored.httpMetadata?.cacheControl).toContain('immutable')
    expect(stored.size).toBe(stored.bytes.byteLength)
  }
  const completed = fixture.calls.find(
    (call) => call.name === 'media_upload_complete',
  )!
  expect(completed.body.p_asset_id).toBe(asset.id)
  expect(completed.body.p_metadata).not.toHaveProperty('data')
  expect(JSON.stringify(completed.body)).not.toMatch(/base64|data:image|blob:/)
  expect(fixture.reservations.get(operationId)?.status).toBe('ready')
})

test('retrying the same operation does not duplicate files or database records', async () => {
  const fixture = setup()
  const operationId = randomUUID()
  const first = await readAsset(
    await fixture.handle(await uploadRequest({ operationId })),
  )
  const writeCount = fixture.bucket.writes.length
  const second = await readAsset(
    await fixture.handle(await uploadRequest({ operationId })),
  )
  expect(second).toEqual(first)
  expect(fixture.reservations.size).toBe(1)
  expect(fixture.bucket.writes).toHaveLength(writeCount)
})

for (const [description, files] of [
  [
    'MIME spoofing',
    async () => [
      new File([await webpFixture(480)], 'photo.jpg', { type: 'image/jpeg' }),
    ],
  ],
  [
    'non-image content',
    async () => [
      new File(['<script>alert(1)</script>'], 'photo.webp', {
        type: 'image/webp',
      }),
    ],
  ],
  [
    'truncated WebP',
    async () => [
      new File([(await webpFixture(480)).slice(0, 30)], 'photo.webp', {
        type: 'image/webp',
      }),
    ],
  ],
  [
    'empty image',
    async () => [new File([], 'photo.webp', { type: 'image/webp' })],
  ],
  [
    'oversized file',
    async () => [
      new File([new Uint8Array(4 * 1024 * 1024 + 1)], 'photo.webp', {
        type: 'image/webp',
      }),
    ],
  ],
] as const) {
  test(`${description} is rejected and never marked ready`, async () => {
    const fixture = setup()
    const response = await fixture.handle(
      await uploadRequest({ files: await files() }),
    )
    expect(response).not.toBeNull()
    expect([400, 413, 415, 422]).toContain(response!.status)
    expect(fixture.bucket.objects.size).toBe(0)
    expect(
      fixture.calls.some((call) => call.name === 'media_upload_complete'),
    ).toBe(false)
  })
}

test('the complete image decoder remains mandatory after passing magic-byte checks', async () => {
  const fixture = mediaWorkerHarness()
  const handler = createMediaHandler({
    fetch: fixture.upstream,
    decodeWebp: async () => {
      throw new Error('Frame decoding failed')
    },
  })
  const response = await handler(await uploadRequest(), fixture.environment)
  expect(response).not.toBeNull()
  expect([400, 415, 422]).toContain(response!.status)
  expect(fixture.bucket.objects.size).toBe(0)
})

test('duplicate variant sizes and unsupported purposes are rejected', async () => {
  const fixture = setup()
  const duplicate = await fixture.handle(
    await uploadRequest({ widths: [480, 480] }),
  )
  expect([400, 415, 422]).toContain(duplicate!.status)
  const purpose = await fixture.handle(
    await uploadRequest({ purpose: 'private-customer-document' }),
  )
  expect([400, 415, 422]).toContain(purpose!.status)
  expect(fixture.bucket.objects.size).toBe(0)
})

test('contradictory or misplaced WebP dimensions are rejected before pixel decoding', async () => {
  const original = new Uint8Array(await webpFixture(800))
  const extension = new Uint8Array(18)
  extension.set([0x56, 0x50, 0x38, 0x58]) // VP8X chunk
  new DataView(extension.buffer).setUint32(4, 10, true)
  // False small canvas dimensions concealing the real 800 x 1000 frame.
  extension[12] = 479 & 255
  extension[13] = 479 >> 8
  extension[15] = 599 & 255
  extension[16] = 599 >> 8
  for (const misplaced of [false, true]) {
    const bytes = new Uint8Array(original.length + extension.length)
    bytes.set(original.subarray(0, 12))
    if (misplaced) {
      bytes.set(original.subarray(12), 12)
      bytes.set(extension, original.length)
    } else {
      bytes.set(extension, 12)
      bytes.set(original.subarray(12), 30)
    }
    new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true)
    const fixture = mediaWorkerHarness()
    let decodes = 0
    const handler = createMediaHandler({
      fetch: fixture.upstream,
      async decodeWebp() {
        decodes++
        return { width: 800, height: 1000 }
      },
    })
    const response = await handler(
      await uploadRequest({
        files: [new File([bytes], 'manipulated.webp', { type: 'image/webp' })],
      }),
      fixture.environment,
    )
    expect([400, 415, 422]).toContain(response!.status)
    expect(decodes).toBe(0)
    expect(fixture.bucket.objects.size).toBe(0)
  }
})

test('a failed R2 write cannot produce a ready SQL reference', async () => {
  const fixture = setup()
  fixture.bucket.failPut = true
  const response = await fixture.handle(await uploadRequest())
  expect(response!.status).toBeGreaterThanOrEqual(500)
  expect(
    fixture.calls.some((call) => call.name === 'media_upload_complete'),
  ).toBe(false)
  expect(
    [...fixture.reservations.values()].every(
      (item) => item.status === 'pending',
    ),
  ).toBe(true)
})

test('R2 HEAD must confirm the uploaded content before SQL can mark it available', async () => {
  const fixture = setup()
  fixture.bucket.missingHead = true
  const response = await fixture.handle(await uploadRequest())
  expect(response!.status).toBeGreaterThanOrEqual(500)
  expect(
    fixture.calls.some((call) => call.name === 'media_upload_complete'),
  ).toBe(false)
})

test('a database outage leaves an identifiable pending upload and a safe retry', async () => {
  const fixture = setup()
  const operationId = randomUUID()
  fixture.state.completeUnavailable = true
  const failed = await fixture.handle(await uploadRequest({ operationId }))
  expect(failed!.status).toBeGreaterThanOrEqual(500)
  expect(fixture.reservations.get(operationId)?.status).toBe('pending')
  fixture.state.completeUnavailable = false
  const asset = await readAsset(
    await fixture.handle(await uploadRequest({ operationId })),
  )
  expect(fixture.reservations.size).toBe(1)
  expect(fixture.reservations.get(operationId)?.asset?.id).toBe(asset.id)
  expect(fixture.bucket.objects.size).toBe(3)
})

test('retrying an operation with different prepared content cannot create a second directory', async () => {
  const fixture = setup()
  const operationId = randomUUID()
  fixture.state.completeUnavailable = true
  await fixture.handle(await uploadRequest({ operationId, widths: [960] }))
  const originalKeys = [...fixture.bucket.objects.keys()]
  const rejected = await fixture.handle(
    await uploadRequest({ operationId, widths: [1600] }),
  )
  expect(rejected!.status).toBe(409)
  expect([...fixture.bucket.objects.keys()]).toEqual(originalKeys)
  expect(fixture.reservations.size).toBe(1)
})

test('revoking membership during storage prevents the upload from becoming ready', async () => {
  const fixture = setup()
  fixture.state.revokeAfterWrite = true
  const response = await fixture.handle(await uploadRequest())
  expect(response!.status).toBe(403)
  expect(
    [...fixture.reservations.values()].every(
      (asset) => asset.status === 'pending',
    ),
  ).toBe(true)
  expect(
    fixture.calls.some((call) => call.name === 'media_upload_complete'),
  ).toBe(false)
  expect(fixture.bucket.removed).toHaveLength(0)
})

test('missing or mismatched post-upload metadata cannot be registered as ready', async () => {
  const fixture = setup()
  fixture.bucket.incorrectHeadSize = true
  const response = await fixture.handle(await uploadRequest())
  expect([409, 503]).toContain(response!.status)
  expect(
    fixture.calls.some((call) => call.name === 'media_upload_complete'),
  ).toBe(false)
})

test('connection loss after SQL commit is recoverable without erasing completed files', async () => {
  const fixture = setup()
  const operationId = randomUUID()
  fixture.state.completionUncertain = true
  const first = await fixture.handle(await uploadRequest({ operationId }))
  expect(first!.status).toBeGreaterThanOrEqual(500)
  expect(fixture.reservations.get(operationId)?.status).toBe('ready')
  expect(fixture.bucket.removed).toHaveLength(0)
  fixture.state.completionUncertain = false
  const asset = await readAsset(
    await fixture.handle(await uploadRequest({ operationId })),
  )
  expect(asset.id).toBe(fixture.reservations.get(operationId)?.id)
  expect(fixture.bucket.objects.size).toBe(3)
})

test('public GET and HEAD serve only the exact verified reference with cache and ETag', async () => {
  const fixture = setup()
  const asset = await readAsset(await fixture.handle(await uploadRequest()))
  const get = await fixture.handle(
    new Request(`${mediaTestOrigin}${asset.src}`),
  )
  expect(get!.status).toBe(200)
  expect(get!.headers.get('content-type')).toBe('image/webp')
  expect(get!.headers.get('cache-control')).toContain('immutable')
  expect(get!.headers.get('x-content-type-options')).toBe('nosniff')
  expect((await get!.arrayBuffer()).byteLength).toBeGreaterThan(0)
  const head = await fixture.handle(
    new Request(`${mediaTestOrigin}${asset.src}`, { method: 'HEAD' }),
  )
  expect(head!.status).toBe(200)
  expect(await head!.text()).toBe('')
  expect(head!.headers.get('etag')).toBe(get!.headers.get('etag'))
  const unchanged = await fixture.handle(
    new Request(`${mediaTestOrigin}${asset.src}`, {
      headers: { 'If-None-Match': get!.headers.get('etag')! },
    }),
  )
  expect(unchanged!.status).toBe(304)
  expect(await unchanged!.text()).toBe('')
})

test('public GET uses one R2 read with metadata while HEAD never fetches a body', async () => {
  const fixture = setup()
  const asset = await readAsset(await fixture.handle(await uploadRequest()))
  fixture.bucket.heads.length = 0
  fixture.bucket.reads.length = 0
  fixture.bucket.bodyReads.length = 0
  fixture.calls.length = 0
  const response = await fixture.handle(
    new Request(`${mediaTestOrigin}${asset.src}`),
  )
  expect(response!.status).toBe(200)
  expect(fixture.bucket.heads).toHaveLength(0)
  expect(fixture.bucket.reads).toHaveLength(1)
  expect(fixture.bucket.bodyReads).toHaveLength(1)
  expect(fixture.calls.map((call) => call.name)).toEqual(['media_public_asset'])
  const bytes = await response!.arrayBuffer()
  expect(response!.headers.get('content-length')).toBe(String(bytes.byteLength))

  fixture.bucket.reads.length = 0
  fixture.bucket.bodyReads.length = 0
  const head = await fixture.handle(
    new Request(`${mediaTestOrigin}${asset.src}`, { method: 'HEAD' }),
  )
  expect(head!.status).toBe(200)
  expect(fixture.bucket.heads).toHaveLength(1)
  expect(fixture.bucket.reads).toHaveLength(0)
  expect(fixture.bucket.bodyReads).toHaveLength(0)
  expect(head!.headers.get('content-length')).toBe(String(bytes.byteLength))
  expect(await head!.text()).toBe('')
})

test('conditional GET verifies readiness and uses one metadata-only R2 get', async () => {
  const fixture = setup()
  const asset = await readAsset(await fixture.handle(await uploadRequest()))
  const etag = fixture.bucket.objects.get(
    asset.src.slice('/media/'.length),
  )!.httpEtag
  for (const condition of [
    etag,
    `W/${etag}`,
    `"another-image", ${etag}`,
    '*',
  ]) {
    fixture.bucket.heads.length = 0
    fixture.bucket.reads.length = 0
    fixture.bucket.bodyReads.length = 0
    fixture.calls.length = 0
    const unchanged = await fixture.handle(
      new Request(`${mediaTestOrigin}${asset.src}`, {
        headers: { 'If-None-Match': condition },
      }),
    )
    expect(unchanged!.status).toBe(304)
    expect(await unchanged!.text()).toBe('')
    expect(unchanged!.headers.get('etag')).toBe(etag)
    expect(fixture.calls.map((call) => call.name)).toEqual([
      'media_public_asset',
    ])
    expect(fixture.bucket.heads).toHaveLength(0)
    expect(fixture.bucket.reads).toHaveLength(1)
    expect(fixture.bucket.bodyReads).toHaveLength(0)
  }
  const changed = await fixture.handle(
    new Request(`${mediaTestOrigin}${asset.src}`, {
      headers: { 'If-None-Match': '"another-image"' },
    }),
  )
  expect(changed!.status).toBe(200)
  expect((await changed!.arrayBuffer()).byteLength).toBeGreaterThan(0)
})

test('a formerly public image cannot bypass a withdrawn manifest with its old ETag', async () => {
  const fixture = setup()
  const asset = await readAsset(await fixture.handle(await uploadRequest()))
  const etag = fixture.bucket.objects.get(
    asset.src.slice('/media/'.length),
  )!.httpEtag
  fixture.state.privateResponse = true
  fixture.bucket.heads.length = 0
  fixture.bucket.reads.length = 0
  const hidden = await fixture.handle(
    new Request(`${mediaTestOrigin}${asset.src}`, {
      headers: { 'If-None-Match': etag },
    }),
  )
  expect(hidden!.status).toBe(404)
  expect(hidden!.headers.get('cache-control')).toBe('no-store')
  expect(fixture.bucket.heads).toHaveLength(0)
  expect(fixture.bucket.reads).toHaveLength(0)
})

test('a missing or wrongly typed public object fails closed without an extra HEAD', async () => {
  const fixture = setup()
  const asset = await readAsset(await fixture.handle(await uploadRequest()))
  const key = asset.src.slice('/media/'.length)
  fixture.bucket.objects.get(key)!.httpMetadata!.contentType = 'text/html'
  fixture.bucket.heads.length = 0
  const wrongType = await fixture.handle(
    new Request(`${mediaTestOrigin}${asset.src}`),
  )
  expect(wrongType!.status).toBe(404)
  expect(wrongType!.headers.get('cache-control')).toBe('no-store')
  fixture.bucket.objects.delete(key)
  const missing = await fixture.handle(
    new Request(`${mediaTestOrigin}${asset.src}`),
  )
  expect(missing!.status).toBe(404)
  expect(fixture.bucket.heads).toHaveLength(0)
})

test('public R2 read errors keep their no-store error response', async () => {
  const fixture = setup()
  const asset = await readAsset(await fixture.handle(await uploadRequest()))
  fixture.bucket.failGet = true
  const response = await fixture.handle(
    new Request(`${mediaTestOrigin}${asset.src}`),
  )
  expect(response!.status).toBe(503)
  expect(response!.headers.get('cache-control')).toBe('no-store')
  expect(response!.headers.get('content-type')).toContain('application/json')
})

test('pending or unregistered image objects cannot be read through the public route', async () => {
  const fixture = setup()
  const operationId = randomUUID()
  fixture.state.completeUnavailable = true
  await fixture.handle(await uploadRequest({ operationId }))
  const key = [...fixture.bucket.objects.keys()][0]
  expect(key).toBeTruthy()
  const response = await fixture.handle(
    new Request(`${mediaTestOrigin}/media/${key}`),
  )
  expect(response!.status).toBe(404)
  expect(fixture.bucket.reads).toHaveLength(0)
})

test('private namespaces and fabricated sizes never reach the R2 reader', async () => {
  const fixture = setup()
  const asset = await readAsset(await fixture.handle(await uploadRequest()))
  const fabricated = await fixture.handle(
    new Request(
      `${mediaTestOrigin}${asset.src.replace('/1600.webp', '/800.webp')}`,
    ),
  )
  expect(fabricated!.status).toBe(404)
  const privateFile = await fixture.handle(
    new Request(
      `${mediaTestOrigin}/media/private/orders/${randomUUID()}/receipt.webp`,
    ),
  )
  expect(privateFile!.status).toBe(404)
  expect(fixture.bucket.reads).toHaveLength(0)
})

test('public metadata outages fail closed without exposing unregistered R2 objects', async () => {
  const fixture = setup()
  const asset = await readAsset(await fixture.handle(await uploadRequest()))
  fixture.state.publicUnavailable = true
  const response = await fixture.handle(
    new Request(`${mediaTestOrigin}${asset.src}`),
  )
  expect(response!.status).toBe(503)
  expect(fixture.bucket.reads).toHaveLength(0)
  expect(response!.headers.get('cache-control')).toBe('no-store')
})

test('preflight permits only configured origins and request headers', async () => {
  const fixture = setup()
  const allowed = await fixture.handle(
    new Request(`${mediaTestOrigin}/api/admin/media/upload`, {
      method: 'OPTIONS',
      headers: { Origin: mediaTestOrigin },
    }),
  )
  expect(allowed!.status).toBe(204)
  expect(allowed!.headers.get('access-control-allow-origin')).toBe(
    mediaTestOrigin,
  )
  expect(allowed!.headers.get('access-control-allow-headers')).toContain(
    'Authorization',
  )
  const rejected = await fixture.handle(
    new Request(`${mediaTestOrigin}/api/admin/media/upload`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://untrusted.example' },
    }),
  )
  expect(rejected!.status).toBe(403)
  expect(rejected!.headers.get('access-control-allow-origin')).toBeNull()
})

test('an oversized declared body is rejected before the multipart buffer is read', async () => {
  const fixture = setup()
  const valid = await uploadRequest()
  const headers = new Headers(valid.headers)
  headers.set('content-length', String(13 * 1024 * 1024))
  const response = await fixture.handle(new Request(valid, { headers }))
  expect(response!.status).toBe(413)
  expect(fixture.reservations.size).toBe(0)
  expect(fixture.bucket.objects.size).toBe(0)
})

test('garbage collection deletes only a claimed asset prefix and finalizes that exact claim', async () => {
  const fixture = setup()
  const deleted = await readAsset(await fixture.handle(await uploadRequest()))
  const retained = await readAsset(await fixture.handle(await uploadRequest()))
  const claimId = randomUUID()
  fixture.state.gcClaims = [
    { id: deleted.id, claimId, prefix: `public/dynamic/${deleted.id}/` },
  ]
  await cleanupMedia(fixture.environment, fixture.upstream)
  expect(
    [...fixture.bucket.objects.keys()].every((key) =>
      key.includes(retained.id),
    ),
  ).toBe(true)
  expect(fixture.bucket.objects.size).toBe(3)
  expect(fixture.bucket.removed).toHaveLength(3)
  expect(fixture.state.gcFinalizations).toEqual([
    { p_asset_id: deleted.id, p_claim_id: claimId },
  ])
})

test('an unsafe garbage-collection prefix cannot erase another namespace', async () => {
  const fixture = setup()
  await readAsset(await fixture.handle(await uploadRequest()))
  fixture.state.gcClaims = [
    { id: randomUUID(), claimId: randomUUID(), prefix: 'public/dynamic/' },
  ]
  await expect(
    cleanupMedia(fixture.environment, fixture.upstream),
  ).rejects.toThrow('Unsafe media cleanup scope')
  expect(fixture.bucket.removed).toHaveLength(0)
  expect(fixture.bucket.objects.size).toBe(3)
  expect(fixture.state.gcFinalizations).toHaveLength(0)
})

test('a void finalization response does not stop the remaining cleanup claims', async () => {
  const fixture = setup()
  const assets = [
    await readAsset(await fixture.handle(await uploadRequest())),
    await readAsset(await fixture.handle(await uploadRequest())),
  ]
  fixture.state.gcClaims = assets.map((asset) => ({
    id: asset.id,
    claimId: randomUUID(),
    prefix: `public/dynamic/${asset.id}/`,
  }))
  await cleanupMedia(fixture.environment, fixture.upstream)
  expect(fixture.state.gcFinalizations).toHaveLength(2)
  expect(fixture.bucket.objects.size).toBe(0)
  expect(fixture.bucket.removed).toHaveLength(6)
})

test('unclaimed image objects are never garbage-collected from a deployment manifest', async () => {
  const fixture = setup()
  await readAsset(await fixture.handle(await uploadRequest()))
  await cleanupMedia(fixture.environment, fixture.upstream)
  expect(fixture.bucket.objects.size).toBe(3)
  expect(fixture.bucket.removed).toHaveLength(0)
  expect(fixture.state.gcFinalizations).toHaveLength(0)
})

for (const count of [10, 50]) {
  test(`${count} products keep their four commercial photos and independent olfactory image distinct`, async () => {
    const fixture = setup()
    const products = new Map<string, string[]>()
    for (let index = 0; index < count; index++) {
      const ids: string[] = []
      for (let position = 0; position < 5; position++) {
        const asset = await readAsset(
          await fixture.handle(
            await uploadRequest({
              purpose: position === 4 ? 'product-olfactory' : 'product-gallery',
              widths: [960],
            }),
          ),
        )
        ids.push(asset.id)
      }
      products.set(randomUUID(), ids)
    }
    expect(products.size).toBe(count)
    const allIds = [...products.values()].flat()
    expect(new Set(allIds).size).toBe(count * 5)
    expect(fixture.reservations.size).toBe(count * 5)
    expect(fixture.bucket.objects.size).toBe(count * 5)
    expect(
      [...fixture.reservations.values()].filter(
        (asset) => asset.purpose === 'product-olfactory',
      ),
    ).toHaveLength(count)
    expect(
      [...fixture.reservations.values()].every(
        (asset) => asset.status === 'ready',
      ),
    ).toBe(true)
  })
}
