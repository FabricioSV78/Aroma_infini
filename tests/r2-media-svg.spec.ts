import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { inspectStaticSvg } from '../worker/media-svg'
import { createMediaHandler } from '../worker/media-handler'
import {
  parseManagedSvgAsset,
  MEDIA_SVG_MAX_BYTES,
  type ManagedSvgAsset,
} from '../src/domain/media'
import {
  mediaWorkerHarness,
  mediaTestOrigin,
  mediaTestToken,
} from './r2-media-worker-fixture'

function bytes(text: string) {
  return new TextEncoder().encode(text).buffer
}
const minimal =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80"><path d="M0 0h100v80H0z" fill="#003d37"/></svg>'

test('original identity SVG passes without changing bytes or dimensions', async () => {
  const original = await readFile('public/brand/logo-on-light.svg')
  expect(inspectStaticSvg(new Uint8Array(original).buffer)).toEqual({
    width: 774,
    height: 374,
  })
})
for (const [label, value] of [
  ['script', minimal.replace('<path', '<script>alert(1)</script><path')],
  ['event', minimal.replace('<path ', '<path onload="alert(1)" ')],
  [
    'external image',
    minimal.replace('<path', '<image href="https://example.com/a"/><path'),
  ],
  ['CSS', minimal.replace('<path ', '<path style="fill:red" ')],
  ['entity', '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///secret">]>' + minimal],
  [
    'namespace',
    minimal.replace('http://www.w3.org/2000/svg', 'https://evil.example'),
  ],
  [
    'reference',
    minimal.replace('fill="#003d37"', 'fill="url(https://example.com/a)"'),
  ],
  ['foreignObject', minimal.replace('<path', '<foreignObject/><path')],
  [
    'animation',
    minimal.replace('<path', '<animate attributeName="width"/><path'),
  ],
  ['nested svg', minimal.replace('<path', '<svg viewBox="0 0 1 1"/><path')],
  ['duplicate attributes', minimal.replace('<path ', '<path fill="red" ')],
  ['encoding', minimal.replace('100 80', 'NaN 80')],
  ['truncated', minimal.slice(0, -6)],
  ['extra root', minimal + minimal],
] as const)
  test(`static SVG rejects ${label}`, () =>
    expect(() => inspectStaticSvg(bytes(value))).toThrow())
test('SVG bounds reject oversized, excessively nested and invalid UTF8 input', () => {
  expect(() =>
    inspectStaticSvg(new ArrayBuffer(MEDIA_SVG_MAX_BYTES + 1)),
  ).toThrow()
  expect(() =>
    inspectStaticSvg(
      bytes(
        minimal
          .replace('<path', '<g>'.repeat(25) + '<path')
          .replace('</svg>', '</g>'.repeat(25) + '</svg>'),
      ),
    ),
  ).toThrow()
  expect(() => inspectStaticSvg(new Uint8Array([0xc0, 0x80]).buffer)).toThrow()
})

function setup() {
  const fixture = mediaWorkerHarness()
  const prepared = new Map<
    string,
    { width: number; height: number; byteSize: number; sha256: string }
  >()
  const completed = new Map<string, ManagedSvgAsset>()
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init),
      name = new URL(request.url).pathname.split('/').at(-1)
    if (
      name === 'media_upload_prepare_svg' ||
      name === 'media_upload_complete_svg'
    ) {
      expect(request.headers.get('apikey')).toBe(
        fixture.environment.SUPABASE_MEDIA_SECRET_KEY,
      )
      const body = (await request.json()) as {
        p_asset_id: string
        p_manifest: {
          width: number
          height: number
          byteSize: number
          sha256: string
        }
      }
      const previous = prepared.get(body.p_asset_id)
      if (
        previous &&
        JSON.stringify(previous) !== JSON.stringify(body.p_manifest)
      )
        return Response.json({ code: 'PT409' }, { status: 409 })
      if (name === 'media_upload_prepare_svg') {
        prepared.set(body.p_asset_id, body.p_manifest)
        return Response.json({ id: body.p_asset_id, status: 'pending' })
      }
      if (!previous || fixture.state.completeUnavailable)
        return Response.json({ code: 'upstream' }, { status: 503 })
      const { sha256, ...metadata } = body.p_manifest
      const asset: ManagedSvgAsset = {
        ...metadata,
        id: body.p_asset_id,
        src: `/media/public/dynamic/${body.p_asset_id}/${sha256}/vector.svg`,
        mimeType: 'image/svg+xml',
      }
      completed.set(asset.id, asset)
      return Response.json(asset)
    }
    if (name === 'media_public_asset') {
      const body = (await request.json()) as { p_asset_id: string }
      return Response.json(
        fixture.state.privateResponse
          ? null
          : (completed.get(body.p_asset_id) ?? null),
      )
    }
    return fixture.upstream(input, init)
  }
  const handler = createMediaHandler({
    fetch: transport,
    decodeWebp: async () => {
      throw new Error('SVG must not enter WebP decoder')
    },
  })
  return {
    ...fixture,
    prepared,
    completed,
    handle: (request: Request) => handler(request, fixture.environment),
  }
}
function request(
  source = minimal,
  operation = randomUUID(),
  anonymous = false,
) {
  const form = new FormData()
  form.set('operationId', operation)
  form.set('file', new File([source], 'logo.svg', { type: 'image/svg+xml' }))
  return new Request(`${mediaTestOrigin}/api/admin/media/svg-upload`, {
    method: 'POST',
    headers: {
      Origin: mediaTestOrigin,
      ...(anonymous ? {} : { Authorization: `Bearer ${mediaTestToken}` }),
    },
    body: form,
  })
}
test('Worker stores and serves a static vector with immutable receipt, CSP and conditional GET/HEAD', async () => {
  const f = setup(),
    operation = randomUUID()
  const response = await f.handle(request(minimal, operation))
  expect(response!.status).toBe(200)
  const asset = parseManagedSvgAsset((await response!.json()).asset)
  expect(f.bucket.writes).toHaveLength(1)
  const retry = await f.handle(request(minimal, operation))
  expect(parseManagedSvgAsset((await retry!.json()).asset)).toEqual(asset)
  expect(f.bucket.writes).toHaveLength(1)
  const full = await f.handle(new Request(`${mediaTestOrigin}${asset.src}`))
  expect(full!.status).toBe(200)
  expect(full!.headers.get('Content-Security-Policy')).toContain(
    "default-src 'none'",
  )
  expect(full!.headers.get('X-Content-Type-Options')).toBe('nosniff')
  expect(await full!.text()).toBe(minimal)
  const etag = full!.headers.get('etag')!
  expect(
    (await f.handle(
      new Request(`${mediaTestOrigin}${asset.src}`, { method: 'HEAD' }),
    ))!.headers.get('content-type'),
  ).toBe('image/svg+xml')
  expect(
    (await f.handle(
      new Request(`${mediaTestOrigin}${asset.src}`, {
        headers: { 'If-None-Match': etag },
      }),
    ))!.status,
  ).toBe(304)
  f.state.privateResponse = true
  expect(
    (await f.handle(new Request(`${mediaTestOrigin}${asset.src}`)))!.status,
  ).toBe(404)
})
test('Worker rejects invalid vectors, foreign origins and anonymous requests before any write', async () => {
  for (const mode of [
    'invalid',
    'origin',
    'anonymous',
    'customer',
    'rate',
  ] as const) {
    const f = setup(),
      req = request(
        mode === 'invalid'
          ? minimal.replace('<path', '<script/><path')
          : minimal,
        randomUUID(),
        mode === 'anonymous',
      )
    if (mode === 'origin') req.headers.set('Origin', 'https://evil.example')
    if (mode === 'customer') f.state.role = 'customer'
    if (mode === 'rate') f.state.bindingRateAllowed = false
    const result = await f.handle(req)
    expect(result!.status).toBeGreaterThanOrEqual(400)
    expect(f.bucket.writes).toHaveLength(0)
    expect(f.completed.size).toBe(0)
  }
})
test('SVG storage failure or administrator revocation never confirms publication', async () => {
  for (const mode of ['storage', 'receipt', 'revoked', 'sql'] as const) {
    const f = setup()
    f.bucket.failPut = mode === 'storage'
    f.bucket.incorrectHeadSize = mode === 'receipt'
    f.state.revokeAfterWrite = mode === 'revoked'
    f.state.completeUnavailable = mode === 'sql'
    expect((await f.handle(request()))!.status).toBeGreaterThanOrEqual(400)
    expect(f.completed.size).toBe(0)
  }
})
