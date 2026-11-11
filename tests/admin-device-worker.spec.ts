import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
import { convertV4MiniflareOptions, Miniflare } from 'miniflare'
import { expect, test } from '@playwright/test'
import { createAdminDeviceHandler } from '../worker/admin-device-handler'
import { createAdminPushHandler } from '../worker/admin-push-handler'
import { createMediaHandler } from '../worker/media-handler'
import {
  decodeFixture,
  mediaWorkerHarness,
  uploadRequest,
} from './r2-media-worker-fixture'

const origin = 'https://admin.fixture.workers.dev'
const prefix = '/api/admin/auth'
const owner = '10000000-0000-4000-8000-000000000001'
const device = '20000000-0000-4000-8000-000000000001'
const otherDevice = '20000000-0000-4000-8000-000000000002'
const token = `eyJ${'a'.repeat(32)}`
const secret = 'b'.repeat(64)
const cookieName = '__Host-aroma-admin-device'
const now = Date.parse('2026-11-11T12:00:00Z')
const expires = new Date(now + 60 * 86400000).toISOString()

function request(
  path: string,
  options: {
    method?: string
    headers?: Record<string, string | null>
    body?: unknown
    scheme?: string
  } = {},
) {
  const method =
    options.method ??
    (path === '/devices'
      ? 'GET'
      : path.startsWith('/devices/')
        ? 'DELETE'
        : 'POST')
  const headers = new Headers({
    Origin: origin,
    Authorization: `Bearer ${token}`,
    'X-Aroma-Admin-Device': '1',
    ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
  })
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    if (value === null) headers.delete(key)
    else headers.set(key, value)
  }
  return new Request(
    `${options.scheme ?? 'https'}://admin.fixture.workers.dev${prefix}${path}`,
    {
      method,
      headers,
      ...(method === 'POST'
        ? { body: JSON.stringify(options.body ?? {}) }
        : {}),
    },
  )
}

function fixture(
  options: {
    aal?: string
    trusted?: boolean
    requiresMfa?: boolean
    actorId?: string
    role?: string
    authStatus?: number
    actorStatus?: number
    rpcStatus?: number
    rpcData?: unknown
    rate?: boolean
  } = {},
) {
  const calls: Array<{
    path: string
    body: Record<string, unknown>
    headers: Headers
    redirect?: RequestRedirect
  }> = []
  const transport: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname
    calls.push({
      path,
      body: init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : {},
      headers: new Headers(init?.headers),
      redirect: init?.redirect,
    })
    if (path.endsWith('/user'))
      return Response.json({ id: owner }, { status: options.authStatus ?? 200 })
    if (path.endsWith('/current_actor'))
      return Response.json(
        {
          user_id: options.actorId ?? owner,
          role: options.role ?? 'admin',
          aal: options.aal ?? 'aal2',
          trusted_device: options.trusted ?? false,
          requires_mfa:
            options.requiresMfa ?? (options.aal === 'aal1' && !options.trusted),
        },
        { status: options.actorStatus ?? 200 },
      )
    let data: unknown = options.rpcData
    if (data === undefined) {
      if (path.endsWith('/admin_device_register'))
        data = {
          id: device,
          expires_at: expires,
          internal: 'PRIVATE_PROVIDER_DETAIL',
        }
      else if (path.endsWith('/admin_device_resume'))
        data = { trusted: true, expires_at: expires }
      else if (path.endsWith('/admin_device_list'))
        data = {
          items: [
            {
              id: device,
              label: 'Chrome · Windows',
              created_at: new Date(now).toISOString(),
              expires_at: expires,
              last_used_at: null,
              current: true,
              token_hash: 'PRIVATE_HASH',
            },
          ],
        }
      else if (path.endsWith('/admin_device_revoke'))
        data = { revoked: true, current: false }
      else throw new Error('Unexpected fixture RPC')
    }
    return Response.json(data, { status: options.rpcStatus ?? 200 })
  }
  const env = {
    APP_ENVIRONMENT: 'staging',
    SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_device_fixture',
    ADMIN_AUTH_RATE_LIMITER: {
      limit: async () => ({ success: options.rate !== false }),
    },
  }
  const handler = createAdminDeviceHandler({ fetch: transport, now: () => now })
  return {
    calls,
    env,
    transport,
    handler,
    handle: (input: Request) => handler(input, env),
  }
}

test('registration stores a hash and returns only a fixed-duration secure HttpOnly cookie', async () => {
  const f = fixture()
  const result = await f.handle(
    request('/device/register', {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0) Chrome/142.0.0.0 Safari/537.36 PRIVATE_UA_DETAILS',
      },
    }),
  )
  expect(result?.status).toBe(200)
  expect(await result?.json()).toEqual({ id: device, expires_at: expires })
  const setCookie = result!.headers.get('Set-Cookie')!
  const value = setCookie.split(';')[0].slice(cookieName.length + 1)
  expect(value).toMatch(/^[a-f0-9]{64}$/)
  for (const part of [
    'Max-Age=5184000',
    'Path=/',
    'Secure',
    'HttpOnly',
    'SameSite=Strict',
  ])
    expect(setCookie).toContain(part)
  expect(setCookie).not.toContain('Domain=')
  const stored = f.calls.find((call) =>
    call.path.endsWith('/admin_device_register'),
  )!
  const expectedHash = Buffer.from(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  ).toString('hex')
  expect(stored.body).toEqual({
    p_token_hash: expectedHash,
    p_label: 'Chrome · Windows',
  })
  expect(stored.body.p_token_hash).not.toBe(value)
  expect(result!.headers.get('Cache-Control')).toBe('no-store')
  expect(
    f.calls.every(
      (call) =>
        call.headers.get('apikey') === f.env.SUPABASE_PUBLISHABLE_KEY &&
        call.headers.get('Authorization') === `Bearer ${token}` &&
        call.redirect === 'manual',
    ),
  ).toBe(true)
  const next = await f.handle(request('/device/register'))
  expect(next!.headers.get('Set-Cookie')!.split(';')[0]).not.toBe(
    setCookie.split(';')[0],
  )
})

test('registration requires real AAL2 and matching active ownership, even for a trusted AAL1 session', async () => {
  for (const options of [
    { aal: 'aal1' },
    { aal: 'aal1', trusted: true },
    { actorId: device },
    { role: 'customer' },
    { authStatus: 401 },
    { actorStatus: 503 },
  ]) {
    const f = fixture(options)
    const result = await f.handle(request('/device/register'))
    expect(result?.status).toBe(
      options.authStatus ? 401 : options.actorStatus ? 503 : 403,
    )
    expect(result!.headers.has('Set-Cookie')).toBe(false)
    expect(
      f.calls.some((call) => call.path.endsWith('/admin_device_register')),
    ).toBe(false)
  }
})

test('failed registration and malformed provider contracts never set a cookie or leak backend details', async () => {
  for (const options of [
    {
      rpcStatus: 403,
      rpcData: { code: '42501', message: 'PRIVATE_PROVIDER_DETAIL' },
    },
    {
      rpcStatus: 429,
      rpcData: { code: 'PT429', message: 'PRIVATE_PROVIDER_DETAIL' },
    },
    { rpcStatus: 503, rpcData: { message: 'PRIVATE_PROVIDER_DETAIL' } },
    { rpcData: { id: device, expires_at: new Date(now - 1).toISOString() } },
    {
      rpcData: {
        id: device,
        expires_at: new Date(now + 61 * 86400000).toISOString(),
      },
    },
    { rpcData: { id: 'invalid', expires_at: expires } },
  ]) {
    const f = fixture(options)
    const result = await f.handle(request('/device/register'))
    expect(result?.status).toBe(options.rpcStatus ?? 503)
    expect(result!.headers.has('Set-Cookie')).toBe(false)
    expect(await result!.text()).not.toContain('PRIVATE_PROVIDER_DETAIL')
  }
})

test('HTTPS exact-origin and custom-header rules reject cross-site requests before network access', async () => {
  const cases: NonNullable<Parameters<typeof request>[1]>[] = [
    { headers: { Origin: 'https://evil.invalid' } },
    { headers: { Origin: 'http://127.0.0.1:5173' } },
    { headers: { Origin: null } },
    { headers: { 'X-Aroma-Admin-Device': null } },
    { headers: { 'X-Aroma-Admin-Device': '0' } },
    { scheme: 'http', headers: { Origin: 'http://admin.fixture.workers.dev' } },
  ]
  for (const options of cases) {
    const f = fixture()
    const result = await f.handle(request('/device/register', options))
    expect(result?.status).toBe(403)
    expect(result!.headers.has('Access-Control-Allow-Origin')).toBe(false)
    expect(f.calls).toHaveLength(0)
  }
  const f = fixture()
  expect(
    (
      await f.handle(
        request('/device/resume', {
          headers: { Origin: null, 'Sec-Fetch-Site': 'same-origin' },
        }),
      )
    )?.status,
  ).toBe(403)
})

test('same-origin browser GET uses Fetch Metadata when the browser omits Origin', async () => {
  const f = fixture()
  expect(
    (
      await f.handle(
        request('/devices', {
          headers: { Origin: null, 'Sec-Fetch-Site': 'same-origin' },
        }),
      )
    )?.status,
  ).toBe(200)
  const cases: Record<string, string | null>[] = [
    { Origin: null },
    { Origin: null, 'Sec-Fetch-Site': 'same-site' },
    { Origin: null, 'Sec-Fetch-Site': 'cross-site' },
    { Origin: 'https://evil.invalid', 'Sec-Fetch-Site': 'same-origin' },
  ]
  for (const headers of cases)
    expect((await f.handle(request('/devices', { headers })))?.status).toBe(403)
})

test('a valid cookie resumes only through the verified caller JWT without rotating or extending the cookie', async () => {
  const f = fixture({ aal: 'aal1' })
  const result = await f.handle(
    request('/device/resume', {
      headers: { Cookie: `${cookieName}=${secret}` },
    }),
  )
  expect(result?.status).toBe(200)
  expect(await result?.json()).toEqual({ trusted: true, expires_at: expires })
  expect(result!.headers.has('Set-Cookie')).toBe(false)
  expect(
    f.calls.find((call) => call.path.endsWith('/admin_device_resume'))?.body,
  ).toEqual({ p_token: secret })
})

test('missing, malformed, duplicate, forged and expired cookies clear only the remembered credential', async () => {
  for (const cookie of [
    null,
    `${cookieName}=invalid`,
    `${cookieName}=${secret}; ${cookieName}=${secret}`,
    `${cookieName}=${secret}`,
  ]) {
    const f = fixture({
      aal: 'aal1',
      rpcData: { trusted: false, expires_at: null },
    })
    const result = await f.handle(
      request('/device/resume', { headers: { Cookie: cookie } }),
    )
    expect(result?.status).toBe(200)
    expect(await result?.json()).toEqual({ trusted: false, expires_at: null })
    expect(result!.headers.get('Set-Cookie')).toContain('Max-Age=0')
    expect(result!.headers.get('Set-Cookie')).not.toContain(secret)
    expect(
      f.calls.filter((call) => call.path.endsWith('/admin_device_resume')),
    ).toHaveLength(cookie === `${cookieName}=${secret}` ? 1 : 0)
  }
  const f = fixture({
    aal: 'aal1',
    rpcData: { trusted: true, expires_at: new Date(now).toISOString() },
  })
  expect(
    (
      await f.handle(
        request('/device/resume', {
          headers: { Cookie: `${cookieName}=${secret}` },
        }),
      )
    )?.status,
  ).toBe(503)
})

test('temporary failures preserve remembered credentials and never expose their token', async () => {
  for (const options of [
    { rpcStatus: 503 },
    { actorStatus: 503 },
    { authStatus: 401 },
  ]) {
    const f = fixture({ aal: 'aal1', ...options, rpcData: { message: secret } })
    const result = await f.handle(
      request('/device/resume', {
        headers: { Cookie: `${cookieName}=${secret}` },
      }),
    )
    expect([401, 503]).toContain(result?.status)
    expect(result!.headers.has('Set-Cookie')).toBe(false)
    expect(await result!.text()).not.toContain(secret)
  }
})

test('list and revoke need an authorized admin and return only reviewed fields', async () => {
  const f = fixture({ aal: 'aal1', trusted: true })
  const result = await f.handle(request('/devices'))
  expect(result?.status).toBe(200)
  expect(await result?.json()).toEqual({
    items: [
      {
        id: device,
        label: 'Chrome · Windows',
        created_at: new Date(now).toISOString(),
        expires_at: expires,
        last_used_at: null,
        current: true,
      },
    ],
  })
  const revoked = await f.handle(request(`/devices/${otherDevice}`))
  expect(await revoked?.json()).toEqual({ revoked: true })
  expect(revoked!.headers.has('Set-Cookie')).toBe(false)
  expect(
    f.calls.find((call) => call.path.endsWith('/admin_device_revoke'))?.body,
  ).toEqual({ p_device_id: otherDevice })
  const current = fixture({ rpcData: { revoked: true, current: true } })
  expect(
    (await current.handle(request(`/devices/${device}`)))!.headers.get(
      'Set-Cookie',
    ),
  ).toContain('Max-Age=0')
  for (const options of [
    { aal: 'aal1' },
    { aal: 'aal1', trusted: true, requiresMfa: true },
    { aal: 'aal1', trusted: false, requiresMfa: false },
  ]) {
    const denied = fixture(options)
    expect((await denied.handle(request('/devices')))?.status).toBe(403)
    expect((await denied.handle(request(`/devices/${device}`)))?.status).toBe(
      403,
    )
    expect(
      denied.calls.some(
        (call) =>
          call.path.endsWith('/admin_device_list') ||
          call.path.endsWith('/admin_device_revoke'),
      ),
    ).toBe(false)
  }
})

test('rate limits, invalid client fields and unsupported routes are bounded before mutation', async () => {
  const rate = fixture({ rate: false })
  expect((await rate.handle(request('/device/register')))?.status).toBe(429)
  expect(rate.calls).toHaveLength(0)
  for (const body of [
    { p_token: secret },
    { label: 'user-controlled' },
    [],
    'x',
    { padding: 'x'.repeat(512) },
  ]) {
    const f = fixture()
    expect(
      (await f.handle(request('/device/register', { body })))?.status,
    ).toBe(400)
    expect(f.calls).toHaveLength(0)
  }
  const f = fixture()
  expect(
    (
      await f.handle(
        request('/devices?token=must-not-be-accepted', { method: 'GET' }),
      )
    )?.status,
  ).toBe(400)
  expect((await f.handle(request('/device/unknown')))?.status).toBe(404)
  expect(
    (await f.handle(request('/device/register', { method: 'GET' })))?.status,
  ).toBe(405)
  expect(await f.handler(new Request(`${origin}/tienda`), f.env)).toBeNull()
})

test('both read-only authorization checks settle before a failed actor can return', async () => {
  const f = fixture({ authStatus: 401 })
  let release: () => void = () => {}
  const barrier = new Promise<void>((resolve) => {
    release = resolve
  })
  let actorStarted = false
  const handler = createAdminDeviceHandler({
    fetch: async (input, init) => {
      if (String(input).endsWith('/current_actor')) {
        actorStarted = true
        await barrier
      }
      return f.transport(input, init)
    },
    now: () => now,
  })
  let finished = false
  const pending = handler(request('/device/register'), f.env).then((value) => {
    finished = true
    return value
  })
  await expect.poll(() => actorStarted).toBe(true)
  expect(finished).toBe(false)
  release()
  expect((await pending)?.status).toBe(401)
  expect(
    f.calls.some((call) => call.path.endsWith('/admin_device_register')),
  ).toBe(false)
})

test('oversized provider streams fail closed without reflecting or persisting private data', async () => {
  const f = fixture()
  const handler = createAdminDeviceHandler({
    fetch: async (input, init) =>
      String(input).endsWith('/auth/v1/user')
        ? new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    'PRIVATE_PROVIDER_DETAIL' + 'x'.repeat(70000),
                  ),
                )
              },
            }),
          )
        : f.transport(input, init),
    now: () => now,
  })
  const result = await handler(request('/device/register'), f.env)
  expect(result?.status).toBe(503)
  expect(result!.headers.has('Set-Cookie')).toBe(false)
  expect(await result!.text()).not.toContain('PRIVATE_PROVIDER_DETAIL')
})

test('media and push preserve real AAL1 while accepting only explicit server trusted authorization', async () => {
  for (const [trusted, requiresMfa, expected] of [
    [true, false, 200],
    [false, false, 403],
    [true, true, 403],
  ] as const) {
    const media = mediaWorkerHarness()
    media.state.aal = 'aal1'
    const handler = createMediaHandler({
      decodeWebp: decodeFixture,
      fetch: async (input, init) => {
        const result = await media.upstream(input, init)
        if (!String(input).endsWith('/current_actor')) return result
        return Response.json({
          ...(await result.json()),
          trusted_device: trusted,
          requires_mfa: requiresMfa,
        })
      },
    })
    expect(
      (await handler(await uploadRequest(), media.environment))?.status,
    ).toBe(expected)
    if (expected === 200) expect(media.state.actorCalls).toBe(2)
    else expect(media.bucket.writes).toHaveLength(0)
    const push = createAdminPushHandler({
      fetch: async (input) =>
        Response.json(
          String(input).endsWith('/user')
            ? { id: owner }
            : String(input).endsWith('/current_actor')
              ? {
                  user_id: owner,
                  role: 'admin',
                  aal: 'aal1',
                  trusted_device: trusted,
                  requires_mfa: requiresMfa,
                }
              : { device: null },
        ),
    })
    const f = fixture()
    expect(
      (
        await push(
          new Request(`${origin}/api/admin/push/status?deviceId=${device}`, {
            headers: { Authorization: `Bearer ${token}`, Origin: origin },
          }),
          { ...f.env, PUSH_ENVIRONMENT: 'staging' },
        )
      )?.status,
    ).toBe(expected)
  }
})

test('native workerd generates and hashes the cookie using WebCrypto and user JWT RPCs', async () => {
  const compiled = await transform(
    await readFile(
      new URL('../worker/admin-device-handler.ts', import.meta.url),
      'utf8',
    ),
    { loader: 'ts', format: 'esm', target: 'es2022' },
  )
  let storedHash = ''
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: `${compiled.code}\nconst handle=createAdminDeviceHandler();export default {fetch(request,env){return handle(request,env)}};`,
      compatibilityDate: '2026-10-08',
      bindings: {
        APP_ENVIRONMENT: 'staging',
        SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
      },
      outboundService: async (input: Request) => {
        expect(input.headers.get('Authorization')).toBe(`Bearer ${token}`)
        const path = new URL(input.url).pathname
        if (path.endsWith('/user')) return Response.json({ id: owner })
        if (path.endsWith('/current_actor'))
          return Response.json({
            user_id: owner,
            role: 'admin',
            aal: 'aal2',
            requires_mfa: false,
          })
        const body = (await input.json()) as { p_token_hash: string }
        storedHash = body.p_token_hash
        return Response.json({
          id: device,
          expires_at: new Date(Date.now() + 60 * 86400000).toISOString(),
        })
      },
    }),
  )
  try {
    const result = await runtime.dispatchFetch(
      `${origin}${prefix}/device/register`,
      {
        method: 'POST',
        headers: {
          Origin: origin,
          Authorization: `Bearer ${token}`,
          'X-Aroma-Admin-Device': '1',
          'Content-Type': 'application/json',
        },
        body: '{}',
      },
    )
    expect(result.status).toBe(200)
    const cookie = result.headers.get('Set-Cookie')!
    expect(cookie).toContain('HttpOnly; SameSite=Strict')
    const raw = cookie.split(';')[0].slice(cookieName.length + 1)
    expect(storedHash).toBe(
      Buffer.from(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)),
      ).toString('hex'),
    )
    expect(await result.text()).not.toContain(raw)
  } finally {
    await runtime.dispose()
  }
})
