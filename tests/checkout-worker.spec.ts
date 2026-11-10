import { expect, test } from '@playwright/test'
import { createCheckoutHandler } from '../worker/checkout-handler'

const endpoint =
  'https://aroma-infini-frontend-staging.fabricioseminarioo2004.workers.dev/api/checkout/simulate'
const body = {
  operationId: '50000000-0000-4000-8000-000000000001',
  trackingToken: 'a'.repeat(64),
  checkout: {
    lines: [{ variantId: '60000000-0000-4000-8000-000000000001', quantity: 1 }],
    expectedQuoteHash: 'b'.repeat(64),
  },
}
function fixture(
  options: {
    verified?: boolean
    status?: number
    code?: string
    rate?: boolean
  } = {},
) {
  const calls: Array<{ url: string; body: unknown; headers: Headers }> = []
  const handler = createCheckoutHandler(async (input, init) => {
    const url = String(input)
    calls.push({
      url,
      body: init?.body ? JSON.parse(String(init.body)) : null,
      headers: new Headers(init?.headers),
    })
    if (url.endsWith('/auth/v1/user'))
      return Response.json(
        options.verified === false
          ? { error: 'invalid' }
          : { id: '70000000-0000-4000-8000-000000000001' },
        { status: options.verified === false ? 401 : 200 },
      )
    return options.code
      ? Response.json(
          { code: options.code, message: 'PRIVATE PROVIDER DETAILS' },
          { status: options.status ?? 400 },
        )
      : Response.json({
          order: {
            simulation: true,
            paymentStatus: 'pending',
            reference: 'AI-TEST-1234567890123456',
          },
        })
  })
  const env = {
    SUPABASE_URL: 'https://tkxvexfapszilzhogvgu.supabase.co',
    APP_ENVIRONMENT: 'staging',
    CHECKOUT_SIMULATION_ORIGIN: new URL(endpoint).origin,
    SUPABASE_PUBLISHABLE_KEY: 'public-key',
    SUPABASE_COMMERCE_SECRET_KEY: 'server-secret-never-public',
    CHECKOUT_SIMULATION_ENABLED: 'true',
    MEDIA_ALLOWED_ORIGINS: 'http://127.0.0.1:5173',
    CHECKOUT_RATE_LIMITER: {
      limit: async () => ({ success: options.rate !== false }),
    },
  }
  const request = (
    value: unknown = body,
    headers: Record<string, string> = {},
  ) =>
    new Request(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://127.0.0.1:5173',
        ...headers,
      },
      body: JSON.stringify(value),
    })
  return { handler, env, calls, request }
}
test('guest checkout delegates no supplied identity and never exposes the server key', async () => {
  const f = fixture(),
    response = await f.handler(f.request(), f.env)
  expect(response?.status).toBe(200)
  expect(response?.headers.get('cache-control')).toBe('no-store')
  expect(response?.headers.get('access-control-allow-origin')).toBe(
    'http://127.0.0.1:5173',
  )
  expect(f.calls).toHaveLength(1)
  expect(f.calls[0].body).toEqual({
    p_operation_id: body.operationId,
    p_tracking_token: body.trackingToken,
    p_checkout: body.checkout,
    p_user_id: null,
  })
  expect(await response?.text()).not.toContain('server-secret')
})

test('checkout Auth and privileged RPC never follow upstream redirects', async () => {
  const f = fixture()
  const policies: Array<RequestRedirect | undefined> = []
  const handler = createCheckoutHandler(async (input, init) => {
    policies.push(init?.redirect)
    if (String(input).endsWith('/auth/v1/user'))
      return Response.json({ id: '70000000-0000-4000-8000-000000000001' })
    return Response.json({
      order: { simulation: true, paymentStatus: 'pending' },
    })
  })
  const response = await handler(
    f.request(body, { Authorization: `Bearer ${'x'.repeat(30)}` }),
    f.env,
  )
  expect(response?.status).toBe(200)
  expect(policies).toEqual(['manual', 'manual'])
})
test('Production and copied staging flags on another host never call Auth or SQL', async () => {
  for (const environment of ['production', undefined]) {
    const f = fixture()
    expect(
      (await f.handler(f.request(), { ...f.env, APP_ENVIRONMENT: environment }))
        ?.status,
    ).toBe(503)
    expect(f.calls).toHaveLength(0)
  }
  const f = fixture()
  const response = await f.handler(
    new Request('https://aromainfini.pe/api/checkout/simulate', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }),
    f.env,
  )
  expect(response?.status).toBe(503)
  expect(f.calls).toHaveLength(0)
})
test('authenticated ownership comes from Auth verification, never the submitted contact', async () => {
  const f = fixture()
  const response = await f.handler(
    f.request(
      {
        ...body,
        checkout: {
          ...body.checkout,
          contact: { email: 'someone-else@example.invalid' },
        },
      },
      { Authorization: `Bearer ${'x'.repeat(30)}` },
    ),
    f.env,
  )
  expect(response?.status).toBe(200)
  expect(f.calls).toHaveLength(2)
  expect(f.calls[1].body).toHaveProperty(
    'p_user_id',
    '70000000-0000-4000-8000-000000000001',
  )
  expect(f.calls[0].headers.get('apikey')).toBe('public-key')
  expect(f.calls[1].headers.get('apikey')).toBe('server-secret-never-public')
})
test('invalid JWT, forbidden origin and disabled simulation perform no order write', async () => {
  const auth = fixture({ verified: false })
  expect(
    (
      await auth.handler(
        auth.request(body, { Authorization: `Bearer ${'x'.repeat(30)}` }),
        auth.env,
      )
    )?.status,
  ).toBe(401)
  expect(auth.calls).toHaveLength(1)
  const origin = fixture()
  expect(
    (
      await origin.handler(
        origin.request(body, { Origin: 'https://evil.invalid' }),
        origin.env,
      )
    )?.status,
  ).toBe(403)
  expect(origin.calls).toHaveLength(0)
  const disabled = fixture()
  expect(
    (
      await disabled.handler(disabled.request(), {
        ...disabled.env,
        CHECKOUT_SIMULATION_ENABLED: 'false',
      })
    )?.status,
  ).toBe(503)
  expect(disabled.calls).toHaveLength(0)
})
test('rate limit, spoofed owner and oversized streamed body fail before any SQL request', async () => {
  const rate = fixture({ rate: false })
  expect((await rate.handler(rate.request(), rate.env))?.status).toBe(429)
  expect(rate.calls).toHaveLength(0)
  const identity = fixture()
  expect(
    (
      await identity.handler(
        identity.request({ ...body, userId: 'admin' }),
        identity.env,
      )
    )?.status,
  ).toBe(400)
  expect(identity.calls).toHaveLength(0)
  const size = fixture()
  expect(
    (
      await size.handler(
        size.request({ ...body, checkout: 'x'.repeat(33000) }),
        size.env,
      )
    )?.status,
  ).toBe(413)
  expect(size.calls).toHaveLength(0)
})

test('an incomplete checkout upload times out without making an order request', async () => {
  const f = fixture()
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"checkout":'))
    },
    cancel() {
      cancelled = true
      return new Promise(() => {})
    },
  })
  const request = new Request(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
  const response = await f.handler(request, f.env)
  expect(response?.status).toBe(408)
  expect(cancelled).toBe(true)
  expect(f.calls).toHaveLength(0)
})

test('an oversized upload is rejected even if cancelling its stream never settles', async () => {
  const f = fixture()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(33000))
    },
    cancel() {
      return new Promise(() => {})
    },
  })
  const request = new Request(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
  const response = await f.handler(request, f.env)
  expect(response?.status).toBe(413)
  expect(f.calls).toHaveLength(0)
})

test('a disconnected checkout client cancels a pending body before any order write', async () => {
  const f = fixture()
  const controller = new AbortController()
  const request = new Request(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: controller.signal,
    body: new ReadableStream<Uint8Array>(),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
  const pending = f.handler(request, f.env)
  controller.abort()
  const response = await pending
  expect(response?.status).toBe(408)
  expect(f.calls).toHaveLength(0)
})

for (const provider of ['auth', 'confirmation'] as const) {
  test(`an oversized ${provider} response is bounded and never leaks provider data`, async () => {
    const f = fixture()
    const calls: string[] = []
    const handler = createCheckoutHandler(async (input) => {
      calls.push(String(input))
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(600 * 1024))
          },
          cancel() {
            return new Promise(() => {})
          },
        }),
      )
    })
    const response = await handler(
      f.request(
        body,
        provider === 'auth'
          ? { Authorization: `Bearer ${'x'.repeat(30)}` }
          : {},
      ),
      f.env,
    )
    expect(response?.status).toBe(503)
    expect(await response?.json()).toHaveProperty('code', 'service')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toContain(
      provider === 'auth' ? '/auth/v1/user' : '/rpc/create_simulated_order',
    )
  })
}

test('a disconnected client also stops an incomplete provider response', async () => {
  const f = fixture()
  const controller = new AbortController()
  let cancelled = false
  const handler = createCheckoutHandler(async () => {
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(stream) {
          stream.enqueue(new TextEncoder().encode('{"order":'))
        },
        cancel() {
          cancelled = true
          return new Promise(() => {})
        },
      }),
    )
    setTimeout(() => controller.abort(), 0)
    return response
  })
  const response = await handler(
    new Request(f.request(), { signal: controller.signal }),
    f.env,
  )
  expect(response?.status).toBe(503)
  expect(cancelled).toBe(true)
})

test('a bounded 300 KiB provider response is not truncated', async () => {
  const f = fixture()
  const handler = createCheckoutHandler(async () =>
    Response.json({ order: { detail: 'x'.repeat(300 * 1024) } }),
  )
  const response = await handler(f.request(), f.env)
  expect(response?.status).toBe(200)
  expect((await response!.json()).order.detail).toHaveLength(300 * 1024)
})
for (const [code, status, expected] of [
  ['PT409', 409, 409],
  ['PT429', 429, 429],
  ['22023', 400, 400],
  ['XX000', 500, 503],
] as const) {
  test(`SQL error ${code} is translated without leaking provider details`, async () => {
    const f = fixture({ code, status }),
      response = await f.handler(f.request(), f.env)
    expect(response?.status).toBe(expected)
    expect(await response?.text()).not.toContain('PRIVATE PROVIDER')
  })
}
test('preflight permits only declared origins and the checkout route has a bounded method surface', async () => {
  const f = fixture(),
    preflight = await f.handler(
      new Request(endpoint, {
        method: 'OPTIONS',
        headers: { Origin: 'http://127.0.0.1:5173' },
      }),
      f.env,
    )
  expect(preflight?.status).toBe(200)
  expect(preflight?.headers.get('access-control-allow-methods')).toBe(
    'POST, OPTIONS',
  )
  expect((await f.handler(new Request(endpoint), f.env))?.status).toBe(405)
  expect(
    await f.handler(new Request('https://store.example.invalid/tienda'), f.env),
  ).toBeNull()
})
