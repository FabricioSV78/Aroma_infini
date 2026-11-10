import { expect, test } from '@playwright/test'
import {
  allowedPushEndpoint,
  createAdminPushHandler,
  dispatchAdminPush,
} from '../worker/admin-push-handler'

const origin = 'https://admin.fixture.workers.dev'
const userId = '10000000-0000-4000-8000-000000000001'
const deviceId = '20000000-0000-4000-8000-000000000001'
const deliveryId = '30000000-0000-4000-8000-000000000001'
const leaseId = '40000000-0000-4000-8000-000000000001'
const eventId = '50000000-0000-4000-8000-000000000001'
const token = `eyJ${'a'.repeat(32)}`
const encode = (value: Uint8Array) => Buffer.from(value).toString('base64url')
const keyPair = await crypto.subtle.generateKey(
  { name: 'ECDH', namedCurve: 'P-256' },
  true,
  ['deriveBits'],
)
const p256dh = encode(
  new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey)),
)
const auth = encode(new Uint8Array(16).fill(1))
const validSubscription = {
  endpoint: 'https://fcm.googleapis.com/wp/opaque-device-token',
  keys: { p256dh, auth },
}

function claim(overrides: Record<string, unknown> = {}) {
  return {
    deliveryId,
    leaseId,
    eventId,
    kind: 'new_order',
    orderReference: 'AI-2026-000001',
    endpoint: validSubscription.endpoint,
    p256dh,
    auth,
    ...overrides,
  }
}
function fixture(
  options: {
    verified?: boolean
    role?: string
    aal?: string
    actorId?: string
    rate?: boolean
    claims?: unknown[]
    eligible?: boolean
    provider?: number
    senderThrows?: boolean
    code?: string
    sqlStatus?: number
    rpcName?: string
    duplicate?: boolean
  } = {},
) {
  const calls: Array<{
    url: string
    body: Record<string, unknown>
    headers: Headers
    redirect?: RequestRedirect
  }> = []
  const sends: Array<{
    subscription: unknown
    vapid: unknown
    payload: unknown
  }> = []
  const transport: typeof fetch = async (input, init) => {
    const url = String(input),
      body = init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : {}
    calls.push({
      url,
      body,
      headers: new Headers(init?.headers),
      redirect: init?.redirect,
    })
    if (url.endsWith('/auth/v1/user'))
      return Response.json(options.verified === false ? {} : { id: userId }, {
        status: options.verified === false ? 401 : 200,
      })
    const name = url.split('/').at(-1)
    if (options.code && name === (options.rpcName ?? 'admin_push_subscribe'))
      return Response.json(
        {
          code: options.code,
          message: 'PRIVATE_PROVIDER_MESSAGE_AND_ENDPOINT',
        },
        { status: options.sqlStatus ?? 400 },
      )
    if (name === 'current_actor')
      return Response.json({
        user_id: options.actorId ?? userId,
        role: options.role ?? 'admin',
        aal: options.aal ?? 'aal2',
      })
    if (name === 'admin_push_device' || name === 'admin_push_subscribe')
      return Response.json({
        device: { enabled: true, label: 'Mi laptop' },
        internalSecret: 'never-expose',
      })
    if (name === 'admin_push_unsubscribe')
      return Response.json({ device: null })
    if (name === 'admin_push_test')
      return Response.json({ queued: true, deliveryId })
    if (name === 'admin_notifications')
      return Response.json({
        items: [
          {
            id: eventId,
            kind: 'new_order',
            orderReference: 'AI-2026-000001',
            createdAt: '2026-11-04T15:00:00Z',
            read: false,
            customer: 'PRIVATE_CUSTOMER',
          },
        ],
        unreadCount: 1,
      })
    if (name === 'admin_read_notifications')
      return Response.json({ updated: 1, unreadCount: 0 })
    if (name === 'claim_admin_push')
      return Response.json({
        deliveries: options.claims ?? [
          claim({ kind: 'test', orderReference: null, eventId: deliveryId }),
        ],
      })
    if (name === 'check_admin_push_delivery')
      return Response.json({ allowed: options.eligible !== false })
    if (name === 'finish_admin_push') return Response.json({ updated: true })
    throw new Error(`Unexpected fixture route: ${name}`)
  }
  const send = async (
    subscription: unknown,
    vapid: unknown,
    payload: unknown,
  ) => {
    sends.push({ subscription, vapid, payload })
    if (options.senderThrows)
      throw new Error('PRIVATE_PROVIDER_MESSAGE_AND_ENDPOINT')
    return { status: options.provider ?? 201 }
  }
  const dependencies = { fetch: transport, send }
  const env = {
    APP_ENVIRONMENT: 'staging',
    PUSH_ENVIRONMENT: 'staging',
    ADMIN_PUSH_ENABLED: 'true',
    SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
    SUPABASE_PUSH_SECRET_KEY: 'sb_secret_server-only-fixture',
    MEDIA_ALLOWED_ORIGINS: 'http://127.0.0.1:5173',
    VAPID_PUBLIC_KEY: p256dh,
    VAPID_PRIVATE_KEY: encode(new Uint8Array(32).fill(2)),
    VAPID_SUBJECT: 'mailto:admin@example.invalid',
    ADMIN_PUSH_RATE_LIMITER: {
      limit: async () => ({ success: options.rate !== false }),
    },
  }
  const handler = createAdminPushHandler(dependencies)
  const request = (
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    new Request(`${origin}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: origin,
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  return { env, calls, sends, dependencies, handler, request }
}

test('only an authenticated active admin at AAL2 can inspect settings', async () => {
  for (const options of [
    { verified: false },
    { role: 'customer' },
    { aal: 'aal1' },
    { actorId: deviceId },
  ]) {
    const f = fixture(options)
    const result = await f.handler(
      f.request(`/api/admin/push/status?deviceId=${deviceId}`),
      f.env,
    )
    expect(result?.status).toBe(options.verified === false ? 401 : 403)
    expect(
      f.calls.some((item) => item.url.endsWith('/admin_push_device')),
    ).toBe(false)
  }
  const f = fixture()
  const result = await f.handler(
    f.request(`/api/admin/push/status?deviceId=${deviceId}`, undefined, {
      Authorization: '',
    }),
    f.env,
  )
  expect(result?.status).toBe(401)
  expect(f.calls).toHaveLength(0)
})

for (const first of ['identity', 'permissions'] as const)
  test(`push authorization overlaps independent reads and waits for both when ${first} finishes first`, async () => {
    const f = fixture()
    let releaseIdentity!: () => void
    let releasePermissions!: () => void
    const identity = new Promise<void>((resolve) => {
      releaseIdentity = resolve
    })
    const permissions = new Promise<void>((resolve) => {
      releasePermissions = resolve
    })
    let identityStarted = false
    let permissionsStarted = false
    let settled = false
    const transport: typeof fetch = async (input, init) => {
      const url = String(input)
      if (url.endsWith('/auth/v1/user')) {
        identityStarted = true
        await identity
      } else if (url.endsWith('/current_actor')) {
        permissionsStarted = true
        await permissions
      }
      return f.dependencies.fetch(input, init)
    }
    const handler = createAdminPushHandler({
      ...f.dependencies,
      fetch: transport,
    })
    const pending = handler(
      f.request(`/api/admin/push/status?deviceId=${deviceId}`),
      f.env,
    ).then((result) => {
      settled = true
      return result
    })
    try {
      // Each request must start without waiting for the other's response.
      await expect
        .poll(() => identityStarted && permissionsStarted, { timeout: 1000 })
        .toBe(true)
      if (first === 'identity') releaseIdentity()
      else releasePermissions()
      // Drain work caused by the first response, leaving the other gate held.
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      expect(settled).toBe(false)
      expect(
        f.calls.some((call) => call.url.endsWith('/admin_push_device')),
      ).toBe(false)
      releaseIdentity()
      releasePermissions()
      expect((await pending)?.status).toBe(200)
      expect(
        f.calls.filter((call) => call.url.endsWith('/admin_push_device')),
      ).toHaveLength(1)
    } finally {
      releaseIdentity()
      releasePermissions()
      await pending
    }
  })

test('a failed identity check takes precedence over a parallel actor failure and never reaches privileged RPC', async () => {
  const f = fixture({ verified: false })
  const transport: typeof fetch = async (input, init) =>
    String(input).endsWith('/current_actor')
      ? Response.json({ code: 'fixture_outage' }, { status: 503 })
      : f.dependencies.fetch(input, init)
  const handler = createAdminPushHandler({
    ...f.dependencies,
    fetch: transport,
  })
  const result = await handler(
    f.request(`/api/admin/push/status?deviceId=${deviceId}`),
    f.env,
  )
  expect(result?.status).toBe(401)
  expect(f.calls.some((call) => call.url.endsWith('/admin_push_device'))).toBe(
    false,
  )
})

for (const reason of ['deadline', 'disconnect'])
  test(`a push request interrupted by ${reason} cannot remain blocked on its body or cancellation`, async () => {
    const f = fixture()
    const abort = new AbortController()
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{'))
      },
      cancel() {
        cancelled = true
        return new Promise<void>(() => {})
      },
    })
    const options: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: origin,
        'Content-Type': 'application/json',
      },
      body: stream,
      duplex: 'half',
      ...(reason === 'disconnect' ? { signal: abort.signal } : {}),
    }
    const handler = createAdminPushHandler({
      ...f.dependencies,
      ...(reason === 'deadline' ? { requestSignal: () => abort.signal } : {}),
    })
    const pending = handler(
      new Request(`${origin}/api/admin/push/subscriptions`, options),
      f.env,
    )
    await expect.poll(() => stream.locked).toBe(true)
    abort.abort()
    expect((await pending)?.status).toBe(408)
    expect(cancelled).toBe(true)
    expect(
      f.calls.some((call) => call.url.endsWith('/admin_push_subscribe')),
    ).toBe(false)
  })

test('an oversized push request cannot stall the handler in a cancellation callback', async () => {
  const f = fixture()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(16385))
    },
    cancel: () => new Promise<void>(() => {}),
  })
  const options: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: stream,
    duplex: 'half',
  }
  expect(
    (
      await f.handler(
        new Request(`${origin}/api/admin/push/subscriptions`, options),
        f.env,
      )
    )?.status,
  ).toBe(413)
  expect(
    f.calls.some((call) => call.url.endsWith('/admin_push_subscribe')),
  ).toBe(false)
})
test('status returns the public key and sanitized owned device only; secrets never leave server', async () => {
  const f = fixture()
  const result = await f.handler(
    f.request(`/api/admin/push/status?deviceId=${deviceId}`),
    f.env,
  )
  expect(result?.status).toBe(200)
  expect(result?.headers.get('Cache-Control')).toBe('no-store')
  expect(await result?.json()).toEqual({
    configured: true,
    publicKey: p256dh,
    currentDevice: { enabled: true, label: 'Mi laptop' },
  })
  const command = f.calls.at(-1)!
  expect(command.body).toEqual({
    p_environment: 'staging',
    p_device_id: deviceId,
  })
  expect(command.headers.get('apikey')).toBe('sb_publishable_fixture')
  expect(command.headers.get('authorization')).toBe(`Bearer ${token}`)
  expect(f.calls.every((item) => item.redirect === 'manual')).toBe(true)
})
test('disabled or incomplete push keeps inbox available and exposes no key', async () => {
  const f = fixture(),
    env = { ...f.env, ADMIN_PUSH_ENABLED: 'false' }
  const result = await f.handler(
    f.request(`/api/admin/push/status?deviceId=${deviceId}`),
    env,
  )
  expect(await result?.json()).toMatchObject({
    configured: false,
    publicKey: null,
  })
  expect(
    (await f.handler(f.request('/api/admin/notifications'), env))?.status,
  ).toBe(200)
  expect(
    (await f.handler(f.request('/api/admin/push/test', { deviceId }), env))
      ?.status,
  ).toBe(503)
  expect(await dispatchAdminPush(env, f.dependencies)).toEqual({
    claimed: 0,
    accepted: 0,
  })
  expect(f.sends).toHaveLength(0)
})
test('environment mismatch fails closed before querying any identity or subscription', async () => {
  const f = fixture()
  expect(
    (
      await f.handler(
        f.request(`/api/admin/push/status?deviceId=${deviceId}`),
        { ...f.env, PUSH_ENVIRONMENT: 'production' },
      )
    )?.status,
  ).toBe(503)
  expect(f.calls).toHaveLength(0)
  await expect(
    dispatchAdminPush({ ...f.env, PUSH_ENVIRONMENT: '' }, f.dependencies),
  ).rejects.toThrow()
  expect(f.sends).toHaveLength(0)
})
test('foreign origin cannot query Auth or mutate data; preflight is explicit and no-store', async () => {
  const f = fixture()
  expect(
    (
      await f.handler(
        f.request(
          '/api/admin/push/test',
          { deviceId },
          { Origin: 'https://evil.invalid' },
        ),
        f.env,
      )
    )?.status,
  ).toBe(403)
  expect(f.calls).toHaveLength(0)
  const result = await f.handler(
    new Request(`${origin}/api/admin/push/test`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://127.0.0.1:5173' },
    }),
    f.env,
  )
  expect(result?.status).toBe(204)
  expect(result?.headers.get('Access-Control-Allow-Origin')).toBe(
    'http://127.0.0.1:5173',
  )
  expect(result?.headers.get('Access-Control-Allow-Methods')).toBe(
    'POST, OPTIONS',
  )
  expect(f.calls).toHaveLength(0)
})
test('subscribe validates a real P256 public point and pins ownership through the JWT RPC', async () => {
  const f = fixture()
  const result = await f.handler(
    f.request('/api/admin/push/subscriptions', {
      deviceId,
      deviceLabel: '  Mi laptop  ',
      subscription: validSubscription,
    }),
    f.env,
  )
  expect(result?.status).toBe(201)
  expect(f.calls.at(-1)?.body).toEqual({
    p_environment: 'staging',
    p_device_id: deviceId,
    p_device_label: 'Mi laptop',
    p_subscription: validSubscription,
  })
  expect(f.calls.at(-1)?.body).not.toHaveProperty('p_user_id')
  const invalidPoint = {
    ...validSubscription,
    keys: {
      ...validSubscription.keys,
      p256dh: encode(new Uint8Array(65).fill(4)),
    },
  }
  expect(
    (
      await f.handler(
        f.request('/api/admin/push/subscriptions', {
          deviceId,
          deviceLabel: 'Laptop',
          subscription: invalidPoint,
        }),
        f.env,
      )
    )?.status,
  ).toBe(400)
})
test('SSRF provider whitelist accepts actual opaque URLs and rejects private, confusable and redirected destinations', async () => {
  for (const url of [
    'https://fcm.googleapis.com/wp/token',
    'https://fcm.googleapis.com/fcm/send/token',
    'https://updates.push.services.mozilla.com/wpush/v2/token',
    'https://web.push.apple.com/QDevice',
    'https://wns2-sg2p.notify.windows.com/w/?token=opaque',
  ])
    expect(allowedPushEndpoint(url)).toBe(true)
  for (const url of [
    'http://fcm.googleapis.com/wp/token',
    'https://127.0.0.1/token',
    'https://169.254.169.254/token',
    'https://fcm.googleapis.com.evil.invalid/token',
    'https://evilpush.apple.com/token',
    'https://fcm.googleapis.com:444/token',
    'https://user:pass@fcm.googleapis.com/token',
    'https://fcm.googleapis.com/token#private',
    'https://fcm.googleapis.com/token\n',
  ])
    expect(allowedPushEndpoint(url)).toBe(false)
  const f = fixture()
  expect(
    (
      await f.handler(
        f.request('/api/admin/push/subscriptions', {
          deviceId,
          deviceLabel: 'Laptop',
          subscription: {
            ...validSubscription,
            endpoint: 'https://localhost/private',
          },
        }),
        f.env,
      )
    )?.status,
  ).toBe(400)
  expect(
    f.calls.some((item) => item.url.endsWith('/admin_push_subscribe')),
  ).toBe(false)
})
test('strict fields prevent owner, arbitrary message and endpoint injection', async () => {
  for (const [path, body] of [
    [
      '/api/admin/push/test',
      { deviceId, endpoint: validSubscription.endpoint, message: 'Anything' },
    ],
    ['/api/admin/push/unsubscribe', { deviceId, userId }],
    [
      '/api/admin/push/subscriptions',
      {
        deviceId,
        deviceLabel: 'Laptop',
        subscription: validSubscription,
        userId,
      },
    ],
    ['/api/admin/notifications/read', { all: true, ids: [eventId] }],
  ] as const) {
    const f = fixture()
    expect((await f.handler(f.request(path, body), f.env))?.status).toBe(400)
    expect(f.calls).toHaveLength(2)
  }
})
test('streamed oversized bodies and invalid JSON preserve a bounded request surface', async () => {
  const f = fixture()
  expect(
    (
      await f.handler(
        f.request('/api/admin/push/test', {
          deviceId,
          data: 'x'.repeat(17000),
        }),
        f.env,
      )
    )?.status,
  ).toBe(413)
  expect(
    (
      await f.handler(
        new Request(`${origin}/api/admin/push/test`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: '{',
        }),
        f.env,
      )
    )?.status,
  ).toBe(400)
  expect(f.calls.some((item) => item.url.endsWith('/admin_push_test'))).toBe(
    false,
  )
})
test('unsubscribe is an owned idempotent command even while sending is disabled', async () => {
  const f = fixture()
  for (let index = 0; index < 2; index++) {
    const result = await f.handler(
      f.request('/api/admin/push/unsubscribe', { deviceId }),
      { ...f.env, ADMIN_PUSH_ENABLED: 'false' },
    )
    expect(result?.status).toBe(200)
    expect(await result?.json()).toEqual({ currentDevice: null })
  }
  expect(
    f.calls.filter((item) => item.url.endsWith('/admin_push_unsubscribe')),
  ).toHaveLength(2)
})
test('inbox excludes any extra commercial/customer fields and read commands deduplicate IDs', async () => {
  const f = fixture()
  const result = await f.handler(
    f.request('/api/admin/notifications?limit=20'),
    f.env,
  )
  expect(await result?.json()).toEqual({
    items: [
      {
        id: eventId,
        kind: 'new_order',
        orderReference: 'AI-2026-000001',
        createdAt: '2026-11-04T15:00:00Z',
        read: false,
      },
    ],
    unreadCount: 1,
  })
  expect(
    (
      await f.handler(
        f.request('/api/admin/notifications/read', { ids: [eventId, eventId] }),
        f.env,
      )
    )?.status,
  ).toBe(200)
  expect(f.calls.at(-1)?.body).toEqual({ p_ids: [eventId], p_all: false })
  expect(
    (await f.handler(f.request('/api/admin/notifications?limit=51'), f.env))
      ?.status,
  ).toBe(400)
  expect(
    (
      await f.handler(
        f.request('/api/admin/notifications?limit=20&limit=1'),
        f.env,
      )
    )?.status,
  ).toBe(400)
})
test('test queues a fixed payload and only claims that device delivery; never manufactures a sale', async () => {
  const f = fixture()
  const result = await f.handler(
    f.request('/api/admin/push/test', { deviceId }),
    f.env,
  )
  expect(result?.status).toBe(202)
  expect(await result?.json()).toEqual({ queued: true, accepted: true })
  expect(
    f.calls.find((item) => item.url.endsWith('/claim_admin_push'))?.body,
  ).toEqual({ p_environment: 'staging', p_limit: 1, p_delivery_id: deliveryId })
  expect(f.sends).toHaveLength(1)
  expect(f.sends[0].payload).toMatchObject({
    kind: 'test',
    title: 'Prueba de notificaciones',
    url: '/admin/notificaciones',
  })
  const serialized = JSON.stringify(f.sends[0].payload)
  expect(serialized).not.toContain('PRIVATE')
  expect(serialized).not.toContain('AI-2026-000001')
  expect(
    f.calls
      .filter(
        (item) =>
          item.url.endsWith('/claim_admin_push') ||
          item.url.endsWith('/finish_admin_push'),
      )
      .every(
        (item) => item.headers.get('apikey') === f.env.SUPABASE_PUSH_SECRET_KEY,
      ),
  ).toBe(true)
})
test('provider acceptance is separately reported; failed immediate attempt stays queued for cron', async () => {
  const f = fixture({ senderThrows: true })
  const result = await f.handler(
    f.request('/api/admin/push/test', { deviceId }),
    f.env,
  )
  expect(result?.status).toBe(202)
  expect(await result?.json()).toEqual({ queued: true, accepted: false })
  expect(f.calls.at(-1)?.body).toMatchObject({
    p_result: 'retry',
    p_error_code: 'transport',
  })
})
for (const [status, expected] of [
  [201, 'accepted'],
  [202, 'accepted'],
  [404, 'expired'],
  [410, 'expired'],
  [429, 'retry'],
  [500, 'retry'],
  [401, 'failed'],
  [403, 'failed'],
  [400, 'failed'],
  [302, 'failed'],
] as const) {
  test(`provider HTTP ${status} records ${expected} without leaking provider content`, async () => {
    const f = fixture({ provider: status, claims: [claim()] })
    const result = await dispatchAdminPush(f.env, f.dependencies)
    expect(result).toEqual({
      claimed: 1,
      accepted: expected === 'accepted' ? 1 : 0,
    })
    expect(f.calls.at(-1)?.body).toMatchObject({
      p_result: expected,
      p_http_status: status,
    })
    expect(JSON.stringify(f.calls.at(-1)?.body)).not.toContain(
      'opaque-device-token',
    )
    expect(f.sends[0].payload).toMatchObject({
      kind: 'new_order',
      url: '/admin/pedidos/AI-2026-000001',
    })
  })
}
test('revoked administrator or disabled subscription is rechecked immediately before every send', async () => {
  const f = fixture({ eligible: false, claims: [claim()] })
  const result = await dispatchAdminPush(f.env, f.dependencies)
  expect(result.accepted).toBe(0)
  expect(f.sends).toHaveLength(0)
  expect(f.calls.at(-1)?.body).toMatchObject({
    p_result: 'failed',
    p_error_code: 'not-eligible',
  })
})
test('unsafe stored endpoint cannot cause any external send', async () => {
  const f = fixture({
    claims: [claim({ endpoint: 'https://169.254.169.254/latest/meta-data' })],
  })
  await dispatchAdminPush(f.env, f.dependencies)
  expect(f.sends).toHaveLength(0)
  expect(f.calls.at(-1)?.body).toMatchObject({
    p_result: 'failed',
    p_error_code: 'invalid-subscription',
  })
})
test('claims cap and duplicate IDs never cause unbounded or duplicate provider requests', async () => {
  const tooMany = fixture({ claims: Array.from({ length: 11 }, () => claim()) })
  await expect(
    dispatchAdminPush(tooMany.env, tooMany.dependencies),
  ).rejects.toThrow('Invalid push claims')
  expect(tooMany.sends).toHaveLength(0)
  const duplicate = fixture({ claims: [claim(), claim()] })
  await dispatchAdminPush(duplicate.env, duplicate.dependencies)
  expect(duplicate.sends).toHaveLength(1)
})
test('rate limits and SQL errors are mapped safely without leaking provider diagnostics', async () => {
  const rate = fixture({ rate: false })
  expect(
    (
      await rate.handler(
        rate.request('/api/admin/push/test', { deviceId }),
        rate.env,
      )
    )?.status,
  ).toBe(429)
  for (const [code, status, expected] of [
    ['PT429', 429, 429],
    ['42501', 403, 403],
    ['PT409', 409, 409],
    ['XX000', 500, 503],
  ] as const) {
    const f = fixture({ code, sqlStatus: status })
    const result = await f.handler(
      f.request('/api/admin/push/subscriptions', {
        deviceId,
        deviceLabel: 'Laptop',
        subscription: validSubscription,
      }),
      f.env,
    )
    expect(result?.status).toBe(expected)
    expect(await result?.text()).not.toContain('PRIVATE_PROVIDER')
  }
})
test('unknown routes and methods do not query Auth and storefront requests pass through', async () => {
  const f = fixture()
  expect(await f.handler(new Request(`${origin}/tienda`), f.env)).toBeNull()
  expect(
    (await f.handler(f.request('/api/admin/push/send', {}), f.env))?.status,
  ).toBe(404)
  expect(
    (await f.handler(f.request('/api/admin/push/test'), f.env))?.status,
  ).toBe(405)
  expect(f.calls).toHaveLength(0)
})
