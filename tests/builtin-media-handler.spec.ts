import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import inventory from '../src/content/media-default-inventory.json' with { type: 'json' }

// Bundle the real Worker code in memory without importing its global Env types
// into the application's DOM compilation. These are test boundary signatures.
type TestEnvironment = Record<string, string | undefined>
type HandlerFactory = (dependencies?: { fetch?: typeof fetch }) => (
  request: Request,
  environment: TestEnvironment,
) => Promise<Response | null>
type PublicReader = (
  environment: TestEnvironment,
  operation: string,
  body: Record<string, unknown>,
  transport?: typeof fetch,
  maximumBytes?: number,
  timeoutMs?: number,
  signal?: AbortSignal,
) => Promise<unknown>
let createBuiltinMediaHandler: HandlerFactory
let readPublicCatalog: PublicReader

test.beforeAll(async () => {
  const compiled = await build({
    stdin: {
      contents: `
        export { createBuiltinMediaHandler } from './worker/builtin-media-handler';
        export { readPublicCatalog } from './worker/public-catalog-http';
      `,
      resolveDir: process.cwd(),
      sourcefile: 'builtin-media-boundary-test.ts',
      loader: 'ts',
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
  })
  const source = Buffer.from(compiled.outputFiles[0].text).toString('base64')
  const boundary = await import(`data:text/javascript;base64,${source}`) as {
    createBuiltinMediaHandler: HandlerFactory
    readPublicCatalog: PublicReader
  }
  createBuiltinMediaHandler = boundary.createBuiltinMediaHandler
  readPublicCatalog = boundary.readPublicCatalog
})

const env = {
  APP_ENVIRONMENT: 'production',
  MEDIA_BUILTIN_STORAGE: 'r2',
  SUPABASE_URL: 'https://tkxvexfapszilzhogvgu.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test-only',
} as const
const id = '01234567-89ab-4cde-8fab-0123456789ab'
const hash = 'a'.repeat(64)
const imagePath = '/images/ambre-480.webp'

function request(path = imagePath, init?: RequestInit) {
  return new Request(`https://shop.example.test${path}`, init)
}

function manifest(original: (typeof inventory)[number]) {
  const common = { id, width: original.width, height: original.height }
  const prefix = `/media/public/dynamic/${id}/${hash}`
  if (original.kind === 'svg')
    return {
      ...common,
      src: `${prefix}/vector.svg`,
      mimeType: 'image/svg+xml',
      byteSize: 100,
    }
  if (original.kind === 'video')
    return {
      ...common,
      src: `${prefix}/video.mp4`,
      mimeType: 'video/mp4',
      durationMs: 5000,
      byteSize: 1000,
    }
  const variant = {
    src: `${prefix}/${original.width}.webp`,
    width: original.width,
    height: original.height,
  }
  return { id, ...variant, variants: [variant] }
}

function imageManifest() {
  const original = inventory.find((item) => item.path === imagePath)
  if (!original) throw new Error('Missing image fixture')
  return manifest(original)
}

test('static delivery remains untouched until the environment explicitly enables managed originals', async () => {
  let calls = 0
  const handler = createBuiltinMediaHandler({
    fetch: async () => {
      calls++
      throw new Error('No lookup is allowed')
    },
  })
  for (const mode of [undefined, '', 'static', 'R2'])
    expect(await handler(request(), { ...env, MEDIA_BUILTIN_STORAGE: mode })).toBeNull()
  for (const path of ['/images/not-in-the-inventory.webp', '/videos/other.mp4', '/brand/other.svg', '/assets/index.js', '/media/private/secret'])
    expect(await handler(request(path), env)).toBeNull()
  expect(calls).toBe(0)
})

test('every inventoried original redirects only to its kind and exact dimensions from the current manifest', async () => {
  let calls = 0
  const handler = createBuiltinMediaHandler({
    fetch: async (url, init) => {
      calls++
      expect(String(url)).toBe(`${env.SUPABASE_URL}/rest/v1/rpc/builtin_media_resolve`)
      expect(init?.method).toBe('POST')
      expect(init?.redirect).toBe('manual')
      const headers = new Headers(init?.headers)
      expect(headers.get('apikey')).toBe(env.SUPABASE_PUBLISHABLE_KEY)
      expect(headers.get('Authorization')).toBeNull()
      expect(headers.get('Content-Profile')).toBe('api')
      const body: { p_path: string } = JSON.parse(String(init?.body))
      const original = inventory.find((item) => item.path === body.p_path)
      if (!original) throw new Error('Unexpected original')
      return Response.json({ asset: manifest(original), retired: false })
    },
  })
  for (const original of inventory) {
    const response = await handler(request(original.path), env)
    expect(response?.status, original.path).toBe(302)
    expect(response?.headers.get('Location')).toBe(manifest(original).src)
    expect(response?.headers.get('Cache-Control')).toBe('no-store')
    expect(await response?.text()).toBe('')
  }
  expect(calls).toBe(162)
})

test('HEAD resolves the same alias without a body and unsupported methods do not query Supabase', async () => {
  let calls = 0
  const handler = createBuiltinMediaHandler({
    fetch: async () => {
      calls++
      return Response.json({ asset: imageManifest(), retired: false })
    },
  })
  const head = await handler(request(imagePath, { method: 'HEAD' }), env)
  expect(head?.status).toBe(302)
  expect(await head?.text()).toBe('')
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await handler(request(imagePath, { method }), env)
    expect(response?.status).toBe(405)
    expect(response?.headers.get('Allow')).toBe('GET, HEAD')
    expect(response?.headers.get('Cache-Control')).toBe('no-store')
  }
  expect(calls).toBe(1)
})

test('retirement is read anew for each request and never invalidates an active ready alias', async () => {
  let calls = 0
  const handler = createBuiltinMediaHandler({
    fetch: async () => Response.json(++calls === 1
      ? { asset: imageManifest(), retired: true }
      : { asset: null, retired: true }),
  })
  expect((await handler(request(), env))?.status).toBe(302)
  const retired = await handler(request(), env)
  expect(retired?.status).toBe(410)
  expect(retired?.headers.get('Cache-Control')).toBe('no-store')
  expect(retired?.headers.has('Location')).toBe(false)
  expect(calls).toBe(2)
})

test('a missing active alias fails closed without exposing bundled bytes', async () => {
  const handler = createBuiltinMediaHandler({
    fetch: async () => Response.json({ asset: null, retired: false }),
  })
  for (const method of ['GET', 'HEAD']) {
    const response = await handler(request(imagePath, { method }), env)
    expect(response?.status).toBe(503)
    expect(response?.headers.get('Cache-Control')).toBe('no-store')
    expect(response?.headers.has('Location')).toBe(false)
    if (method === 'HEAD') expect(await response?.text()).toBe('')
  }
})

test('malformed manifests, wrong dimensions, external targets and provider failures never redirect', async () => {
  const asset = imageManifest()
  const invalid: unknown[] = [
    null, [], {}, { asset }, { retired: 'true', asset: null },
    { retired: false },
    { retired: false, asset: { ...asset, width: 960 } },
    { retired: false, asset: { ...asset, height: 601 } },
    { retired: false, asset: { ...asset, id: 'another-id' } },
    { retired: false, asset: { ...asset, src: 'https://external.test/photo.webp' } },
    { retired: false, asset: { ...asset, src: '/media/private/secret.webp' } },
    { retired: false, asset: { ...asset, variants: [] } },
    { retired: false, asset: { ...asset, src: `/media/public/dynamic/${id}/${hash}/video.mp4` } },
  ]
  for (const value of invalid) {
    const handler = createBuiltinMediaHandler({ fetch: async () => Response.json(value) })
    const response = await handler(request(), env)
    expect(response?.status).toBe(503)
    expect(response?.headers.get('Cache-Control')).toBe('no-store')
    expect(response?.headers.has('Location')).toBe(false)
  }
  for (const status of [301, 400, 401, 403, 404, 429, 500, 503]) {
    let calls = 0
    const handler = createBuiltinMediaHandler({ fetch: async () => {
      calls++
      return Response.json({ asset, retired: false }, { status })
    } })
    expect((await handler(request(), env))?.status).toBe(503)
    expect(calls).toBe(1)
  }
})

test('invalid configuration and oversized or non-JSON resolution responses fail closed', async () => {
  let calls = 0
  const handler = createBuiltinMediaHandler({ fetch: async () => {
    calls++
    throw new Error('Must not query an invalid origin')
  } })
  expect((await handler(request(), { ...env, SUPABASE_URL: 'https://untrusted.test/' }))?.status).toBe(503)
  expect((await handler(request(), { ...env, SUPABASE_PUBLISHABLE_KEY: 'sb_secret_not-public' }))?.status).toBe(503)
  expect(calls).toBe(0)
  for (const response of [
    new Response('not JSON', { headers: { 'Content-Type': 'text/html' } }),
    new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    new Response('null', { headers: { 'Content-Type': 'application/json', 'Content-Length': '65537' } }),
    new Response(' '.repeat(65537), { headers: { 'Content-Type': 'application/json' } }),
  ]) {
    const bounded = createBuiltinMediaHandler({ fetch: async () => response })
    expect((await bounded(request(), env))?.status).toBe(503)
  }
})

test('an already disconnected original request does not start a provider lookup', async () => {
  const controller = new AbortController()
  controller.abort()
  let calls = 0
  const handler = createBuiltinMediaHandler({ fetch: async () => {
    calls++
    return Response.json({ asset: imageManifest(), retired: false })
  } })
  expect((await handler(request(imagePath, { signal: controller.signal }), env))?.status).toBe(503)
  expect(calls).toBe(0)
})

test('disconnect propagates to the in-flight public lookup without retrying', async () => {
  const controller = new AbortController()
  let started!: () => void
  const ready = new Promise<void>((resolve) => { started = resolve })
  let calls = 0
  let observed: AbortSignal | null | undefined
  const handler = createBuiltinMediaHandler({ fetch: async (_url, init) => {
    calls++
    observed = init?.signal
    started()
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal
      if (!signal) throw new Error('Missing cancellation signal')
      if (signal.aborted) reject(signal.reason)
      else signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  } })
  const pending = handler(request(imagePath, { signal: controller.signal }), env)
  await ready
  controller.abort()
  expect((await pending)?.status).toBe(503)
  expect(observed?.aborted).toBe(true)
  expect(calls).toBe(1)
})

test('the public read helper cancels a stalled response body after disconnect', async () => {
  const controller = new AbortController()
  let pulled!: () => void
  const reading = new Promise<void>((resolve) => { pulled = resolve })
  let canceled = false
  const transport: typeof fetch = async () => new Response(new ReadableStream<Uint8Array>({
    pull() { pulled() },
    cancel() { canceled = true },
  }), { headers: { 'Content-Type': 'application/json' } })
  const pending = readPublicCatalog(env, 'builtin_media_resolve', { p_path: imagePath }, transport, 65536, 10000, controller.signal)
  await reading
  controller.abort(new DOMException('Disconnected', 'AbortError'))
  await expect(pending).rejects.toThrow('Disconnected')
  expect(canceled).toBe(true)
})
