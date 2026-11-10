import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { expect, test } from '@playwright/test'
import { createMediaHandler } from '../worker/media-handler'
import {
  mediaWorkerHarness,
  decodeFixture,
  mediaTestOrigin,
  mediaTestToken,
} from './r2-media-worker-fixture'
import {
  IMAGE_MEDIA_PROFILES,
  parseManagedMediaAsset,
  parseManagedVideoAsset,
  parseManagedMediaPath,
  validPreparedImageDimensions,
  imageMediaWidths,
  type ImageMediaPurpose,
} from '../src/domain/media'

function setup() {
  const fixture = mediaWorkerHarness()
  let decodes = 0
  const handle = createMediaHandler({
    fetch: fixture.upstream,
    decodeWebp: async (bytes) => {
      decodes++
      return decodeFixture(bytes)
    },
  })
  return {
    ...fixture,
    handle: (request: Request) => handle(request, fixture.environment),
    decodes: () => decodes,
  }
}
async function videoRequest(
  options: {
    operationId?: string
    bytes?: Uint8Array
    authorization?: string | null
    origin?: string
  } = {},
) {
  const form = new FormData()
  form.set('operationId', options.operationId ?? randomUUID())
  const bytes =
    options.bytes ??
    new Uint8Array(await readFile('public/videos/perfume-editorial-mobile.mp4'))
  form.set(
    'file',
    new File([new Uint8Array(bytes).buffer], 'film.mp4', { type: 'video/mp4' }),
  )
  return new Request(`${mediaTestOrigin}/api/admin/media/video-upload`, {
    method: 'POST',
    headers: {
      ...(options.authorization === null
        ? {}
        : {
            Authorization: options.authorization ?? `Bearer ${mediaTestToken}`,
          }),
      Origin: options.origin ?? mediaTestOrigin,
    },
    body: form,
  })
}

for (const [purpose, profile] of Object.entries(IMAGE_MEDIA_PROFILES)) {
  test(`Home/profile upload obeys its own dimensions: ${purpose}`, async () => {
    const fixture = setup(),
      form = new FormData()
    form.set('operationId', randomUUID())
    form.set('purpose', purpose)
    for (const width of imageMediaWidths(
      profile.maxWidth,
      purpose as ImageMediaPurpose,
    )) {
      const height = Math.round((width * profile.height) / profile.width)
      const bytes = await sharp({
        create: { width, height, channels: 3, background: '#ddd3c4' },
      })
        .webp()
        .toBuffer()
      form.append(
        'files',
        new File([new Uint8Array(bytes).buffer], `${width}.webp`, {
          type: 'image/webp',
        }),
      )
    }
    const response = await fixture.handle(
      new Request(`${mediaTestOrigin}/api/admin/media/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${mediaTestToken}` },
        body: form,
      }),
    )
    expect(response!.status).toBe(200)
    const asset = parseManagedMediaAsset((await response!.json()).asset)
    expect(asset.width).toBe(profile.maxWidth)
    expect(asset.variants.length).toBeLessThanOrEqual(3)
    expect(fixture.decodes()).toBe(asset.variants.length)
  })
}

test('Home profile allowances do not increase product caps or accept incorrect ratios', () => {
  expect(validPreparedImageDimensions(2304, 1296, 'hero-desktop')).toBe(true)
  expect(validPreparedImageDimensions(2304, 2880, 'product-gallery')).toBe(
    false,
  )
  expect(validPreparedImageDimensions(1560, 2340, 'hero-mobile')).toBe(true)
  expect(validPreparedImageDimensions(1561, 2342, 'hero-mobile')).toBe(false)
  expect(validPreparedImageDimensions(800, 1000, 'finder-option')).toBe(false)
  expect(validPreparedImageDimensions(960, 540, 'film-poster')).toBe(true)
})

test('an oversized product image is refused before invoking the full decoder', async () => {
  const fixture = setup(),
    form = new FormData()
  form.set('operationId', randomUUID())
  form.set('purpose', 'product-gallery')
  const bytes = await sharp({
    create: { width: 1700, height: 2125, channels: 3, background: '#ddd3c4' },
  })
    .webp()
    .toBuffer()
  form.set(
    'files',
    new File([new Uint8Array(bytes).buffer], 'too-wide.webp', {
      type: 'image/webp',
    }),
  )
  const response = await fixture.handle(
    new Request(`${mediaTestOrigin}/api/admin/media/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${mediaTestToken}` },
      body: form,
    }),
  )
  expect(response!.status).toBe(422)
  expect(fixture.decodes()).toBe(0)
  expect(fixture.bucket.writes).toHaveLength(0)
})

test('video upload verifies real bytes and stores one immutable movie independently of WebP', async () => {
  const fixture = setup(),
    operationId = randomUUID()
  const response = await fixture.handle(await videoRequest({ operationId }))
  expect(response!.status).toBe(200)
  const asset = parseManagedVideoAsset((await response!.json()).asset)
  expect(parseManagedMediaPath(asset.src)).toBeNull()
  expect(fixture.bucket.objects.size).toBe(1)
  expect(fixture.decodes()).toBe(0)
  expect(
    fixture.calls.some((c) => c.name === 'media_upload_prepare_video'),
  ).toBe(true)
  expect(
    fixture.calls.some((c) => c.name === 'media_upload_complete_video'),
  ).toBe(true)
  expect(fixture.bucket.heads.length).toBeGreaterThanOrEqual(2)
  const repeated = await fixture.handle(await videoRequest({ operationId }))
  expect(repeated!.status).toBe(200)
  expect((await repeated!.json()).asset).toEqual(asset)
  expect(fixture.bucket.writes).toHaveLength(1)
})

for (const [label, role, aal, anonymous] of [
  ['anonymous', 'admin', 'aal2', true],
  ['customer', 'customer', 'aal2', false],
  ['AAL1', 'admin', 'aal1', false],
] as const) {
  test(`video upload rejects ${label} before storing files`, async () => {
    const fixture = setup()
    fixture.state.role = role
    fixture.state.aal = aal
    const response = await fixture.handle(
      await videoRequest({ ...(anonymous ? { authorization: null } : {}) }),
    )
    expect(response!.status).toBe(anonymous ? 401 : 403)
    expect(fixture.bucket.objects.size).toBe(0)
    expect(fixture.reservations.size).toBe(0)
  })
}

test('invalid, oversized and truncated movies cannot become ready', async () => {
  for (const bytes of [
    new Uint8Array([1, 2, 3]),
    new Uint8Array(10 * 1024 * 1024 + 1),
    new Uint8Array(
      (await readFile('public/videos/perfume-editorial-mobile.mp4')).subarray(
        0,
        500,
      ),
    ),
  ]) {
    const fixture = setup(),
      response = await fixture.handle(await videoRequest({ bytes }))
    expect([413, 422]).toContain(response!.status)
    expect(fixture.bucket.writes).toHaveLength(0)
    expect(
      fixture.calls.some((c) => c.name === 'media_upload_complete_video'),
    ).toBe(false)
  }
})

test('a failed movie write or membership revoked during upload never publishes the file', async () => {
  for (const mode of ['write', 'revoke', 'head', 'SQL'] as const) {
    const fixture = setup()
    fixture.bucket.failPut = mode === 'write'
    fixture.state.revokeAfterWrite = mode === 'revoke'
    fixture.bucket.incorrectHeadSize = mode === 'head'
    fixture.state.completeUnavailable = mode === 'SQL'
    const response = await fixture.handle(await videoRequest())
    expect(response!.status).toBeGreaterThanOrEqual(
      mode === 'revoke' ? 403 : 500,
    )
    expect(
      [...fixture.reservations.values()].every((r) => r.status === 'pending'),
    ).toBe(true)
  }
})

test('movie GET/HEAD/Range/ETag and If-Range use the verified public manifest', async () => {
  const fixture = setup(),
    source = new Uint8Array(
      await readFile('public/videos/perfume-editorial-mobile.mp4'),
    )
  const response = await fixture.handle(await videoRequest({ bytes: source }))
  expect(response!.status).toBe(200)
  const asset = parseManagedVideoAsset((await response!.json()).asset),
    url = `${mediaTestOrigin}${asset.src}`
  fixture.bucket.heads.length = 0
  fixture.bucket.reads.length = 0
  const full = await fixture.handle(new Request(url))
  expect(full!.status).toBe(200)
  expect(new Uint8Array(await full!.arrayBuffer())).toEqual(source)
  expect(fixture.bucket.heads).toHaveLength(0)
  expect(fixture.bucket.reads).toHaveLength(1)
  const etag = full!.headers.get('etag')!
  const head = await fixture.handle(new Request(url, { method: 'HEAD' }))
  expect(head!.status).toBe(200)
  expect(await head!.text()).toBe('')
  expect(head!.headers.get('accept-ranges')).toBe('bytes')
  for (const [range, start, length] of [
    ['bytes=0-99', 0, 100],
    ['bytes=200-', 200, source.length - 200],
    ['bytes=-100', source.length - 100, 100],
  ] as const) {
    const partial = await fixture.handle(
      new Request(url, { headers: { Range: range, 'If-Range': etag } }),
    )
    expect(partial!.status).toBe(206)
    expect(partial!.headers.get('content-range')).toBe(
      `bytes ${start}-${start + length - 1}/${source.length}`,
    )
    expect(partial!.headers.get('content-length')).toBe(String(length))
    expect(new Uint8Array(await partial!.arrayBuffer())).toEqual(
      source.slice(start, start + length),
    )
  }
  const stale = await fixture.handle(
    new Request(url, { headers: { Range: 'bytes=0-99', 'If-Range': '"old"' } }),
  )
  expect(stale!.status).toBe(200)
  expect((await stale!.arrayBuffer()).byteLength).toBe(source.length)
  const cached = await fixture.handle(
    new Request(url, { headers: { 'If-None-Match': etag } }),
  )
  expect(cached!.status).toBe(304)
  expect(await cached!.text()).toBe('')
  for (const range of [
    'bytes=999999999999-',
    'bytes=9-1',
    'bytes=-0',
    'bytes=0-1,3-5',
  ]) {
    const invalid = await fixture.handle(
      new Request(url, { headers: { Range: range } }),
    )
    expect(invalid!.status).toBe(416)
    expect(invalid!.headers.get('content-range')).toBe(
      `bytes */${source.length}`,
    )
  }
  const unknownUnit = await fixture.handle(
    new Request(url, { headers: { Range: 'items=0-1' } }),
  )
  expect(unknownUnit!.status).toBe(200)
  expect(unknownUnit!.headers.get('content-range')).toBeNull()
  expect(new Uint8Array(await unknownUnit!.arrayBuffer())).toEqual(source)
  fixture.state.privateResponse = true
  const withdrawn = await fixture.handle(
    new Request(url, {
      headers: { Range: 'bytes=0-99', 'If-None-Match': etag },
    }),
  )
  expect(withdrawn!.status).toBe(404)
})

test('video operation retries cannot change the movie or produce a second hash directory', async () => {
  const fixture = setup(),
    operationId = randomUUID()
  fixture.state.completeUnavailable = true
  const first = await fixture.handle(await videoRequest({ operationId }))
  expect(first!.status).toBe(503)
  const keys = [...fixture.bucket.objects.keys()]
  const second = await fixture.handle(
    await videoRequest({
      operationId,
      bytes: new Uint8Array(
        await readFile('public/videos/perfume-editorial-wide.mp4'),
      ),
    }),
  )
  expect(second!.status).toBe(409)
  expect([...fixture.bucket.objects.keys()]).toEqual(keys)
})
