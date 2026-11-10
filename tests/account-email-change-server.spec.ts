import { expect, test } from '@playwright/test'
import { createChangeEmailHandler } from '../supabase/functions/_shared/change-email-handler'

// Pure request/response tests of the real handler. All upstream HTTP is fake;
// no database, email delivery, browser credential or hosted user is involved.
const userA = '00000000-0000-4000-8000-000000000001'
const userB = '00000000-0000-4000-8000-000000000002'
const originalToken = 'original-user-session'
const passwordToken = 'temporary-password-session'
const origin = 'https://aroma.example'
const config = {
  supabaseUrl: 'https://auth.example',
  publishableKey: 'public-fixture-key',
  serviceRoleKey: 'server-only-fixture-key',
  allowedOrigins: [origin],
}

interface UpstreamCall {
  url: URL
  method: string
  headers: Headers
  body: Record<string, unknown>
}

function harness() {
  const calls: UpstreamCall[] = []
  const state = {
    role: 'customer',
    aal: 'aal1',
    requiresMfa: false,
    actorId: userA,
    userCalls: 0,
    identityChanged: false,
    emailChanged: false,
    actorChanged: false,
    sessionExpired: false,
    limitAllowed: true,
    rateMalformed: false,
    passwordCorrect: true,
    passwordUserId: userA,
    passwordToken,
    grantRateLimited: false,
    duplicateEmail: false,
    updateUnavailable: false,
    updateUncertain: false,
    updateMalformed: false,
    cleanupUnavailable: false,
    upstreamUnavailable: false,
  }
  const handler = createChangeEmailHandler(config, {
    async fetch(input, init = {}) {
      expect(init.redirect).toBe('manual')
      const url = new URL(String(input))
      const method = init.method ?? 'GET'
      const headers = new Headers(init.headers)
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : {}
      calls.push({ url, method, headers, body })
      expect(url.origin).toBe(config.supabaseUrl)
      if (state.upstreamUnavailable)
        throw new Error('private upstream response with credentials')
      if (url.pathname === '/auth/v1/user') {
        expect(headers.get('authorization')).toBe(`Bearer ${originalToken}`)
        expect(headers.get('apikey')).toBe(config.publishableKey)
        if (state.sessionExpired)
          return Response.json({ code: 'bad_jwt' }, { status: 401 })
        state.userCalls++
        return Response.json({
          id: state.identityChanged && state.userCalls > 1 ? userB : userA,
          email:
            state.emailChanged && state.userCalls > 1
              ? 'changed@example.invalid'
              : 'original@example.invalid',
          email_confirmed_at: null,
          user_metadata: { role: 'admin' },
        })
      }
      if (url.pathname === '/rest/v1/rpc/current_actor') {
        expect(headers.get('authorization')).toBe(`Bearer ${originalToken}`)
        expect(headers.get('content-profile')).toBe('api')
        return Response.json({
          user_id: state.actorId,
          role:
            state.actorChanged && state.userCalls > 1 ? 'admin' : state.role,
          aal: state.aal,
          requires_mfa: state.requiresMfa,
        })
      }
      if (url.pathname === '/rest/v1/rpc/consume_email_change_attempt') {
        expect(headers.get('authorization')).toBe(
          `Bearer ${config.serviceRoleKey}`,
        )
        expect(headers.get('apikey')).toBe(config.serviceRoleKey)
        expect(headers.get('content-profile')).toBe('api')
        expect(body).toEqual({ p_user_id: userA })
        return Response.json(
          state.rateMalformed
            ? {}
            : {
                allowed: state.limitAllowed,
                retry_after_seconds: state.limitAllowed ? 0 : 741,
              },
        )
      }
      if (url.pathname === '/auth/v1/token') {
        expect(url.searchParams.get('grant_type')).toBe('password')
        expect(headers.get('apikey')).toBe(config.publishableKey)
        expect(body).toEqual({
          email: 'original@example.invalid',
          password: 'Current-password-123!',
        })
        if (state.grantRateLimited)
          return Response.json(
            { code: 'over_request_rate_limit' },
            { status: 429 },
          )
        if (!state.passwordCorrect)
          return Response.json(
            {
              code: 'invalid_credentials',
              message: 'private password details',
            },
            { status: 400 },
          )
        return Response.json({
          access_token: state.passwordToken,
          refresh_token: 'discarded-refresh',
          user: { id: state.passwordUserId, email: 'original@example.invalid' },
        })
      }
      if (url.pathname.startsWith('/auth/v1/admin/users/')) {
        expect(url.pathname).toBe(`/auth/v1/admin/users/${userA}`)
        expect(headers.get('authorization')).toBe(
          `Bearer ${config.serviceRoleKey}`,
        )
        expect(body).toEqual({
          email: 'new@example.invalid',
          email_confirm: true,
        })
        if (state.updateUncertain)
          throw new Error(
            'private connection failure after commit may have occurred',
          )
        if (state.duplicateEmail)
          return Response.json(
            { code: 'email_exists', message: 'private existing user detail' },
            { status: 409 },
          )
        if (state.updateUnavailable)
          return Response.json(
            { code: 'unexpected_failure', message: 'private table constraint' },
            { status: 500 },
          )
        if (state.updateMalformed) return Response.json({ unexpected: true })
        return Response.json({
          id: userA,
          email: 'new@example.invalid',
          email_confirmed_at: '2026-10-28T00:00:00Z',
          app_metadata: { private: 'not returned' },
        })
      }
      if (url.pathname === '/auth/v1/logout') {
        expect(url.searchParams.get('scope')).toBe('local')
        expect(headers.get('authorization')).toBe(`Bearer ${passwordToken}`)
        if (state.cleanupUnavailable)
          throw new Error('temporary cleanup unavailable')
        return new Response(null, { status: 204 })
      }
      throw new Error('Unexpected upstream route')
    },
  })
  const submit = (
    body: unknown = {
      email: ' New@Example.invalid ',
      currentPassword: 'Current-password-123!',
    },
    headers: HeadersInit = {},
    method = 'POST',
  ) =>
    handler(
      new Request('https://functions.example/change-email', {
        method,
        headers: {
          Origin: origin,
          Authorization: `Bearer ${originalToken}`,
          'Content-Type': 'application/json',
          ...headers,
        },
        ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
      }),
    )
  return { calls, state, handler, submit }
}

function mutations(calls: UpstreamCall[]) {
  return calls.filter((call) =>
    call.url.pathname.startsWith('/auth/v1/admin/users/'),
  )
}

test('cambia únicamente el correo del propietario tras verificar sesión, actor y contraseña, sin pedir email', async () => {
  const { submit, calls } = harness()
  const response = await submit()
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    success: true,
    email: 'new@example.invalid',
  })
  expect(response.headers.get('access-control-allow-origin')).toBe(origin)
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(mutations(calls)).toHaveLength(1)
  expect(
    calls.filter((call) => call.url.pathname === '/auth/v1/user'),
  ).toHaveLength(2)
  expect(
    calls.filter((call) => call.url.pathname === '/rest/v1/rpc/current_actor'),
  ).toHaveLength(2)
  expect(calls.at(-1)?.url.pathname).toBe('/auth/v1/logout')
  expect(
    calls.some((call) =>
      /recover|invite|resend|verify/.test(call.url.pathname),
    ),
  ).toBe(false)
})

test('acepta OPTIONS solo para un origen exacto y rechaza métodos distintos a POST', async () => {
  const { submit, calls } = harness()
  expect((await submit(undefined, {}, 'OPTIONS')).status).toBe(204)
  const unknown = await submit(
    undefined,
    { Origin: `${origin}.attacker.invalid` },
    'OPTIONS',
  )
  expect(unknown.status).toBe(403)
  expect(unknown.headers.get('access-control-allow-origin')).toBeNull()
  const wrongMethod = await submit(undefined, {}, 'GET')
  expect(wrongMethod.status).toBe(405)
  expect(wrongMethod.headers.get('allow')).toBe('POST, OPTIONS')
  expect(calls).toHaveLength(0)
})

test('rechaza solicitudes sin JWT o con sesión vencida antes de mutar Auth', async () => {
  const testCase = harness()
  expect((await testCase.submit(undefined, { Authorization: '' })).status).toBe(
    401,
  )
  expect(testCase.calls).toHaveLength(0)
  testCase.state.sessionExpired = true
  expect((await testCase.submit()).status).toBe(401)
  expect(mutations(testCase.calls)).toHaveLength(0)
})

test('no acepta UUID de destino, roles ni metadata proporcionados por el cliente', async () => {
  for (const extra of [
    { userId: userB },
    { role: 'admin' },
    { user_metadata: {} },
  ]) {
    const { submit, calls } = harness()
    const response = await submit({
      email: 'new@example.invalid',
      currentPassword: 'Current-password-123!',
      ...extra,
    })
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('invalid_request')
    expect(calls).toHaveLength(0)
  }
})

test('valida formato, tamaño y credenciales sin exponer los datos recibidos', async () => {
  const { submit, calls } = harness()
  expect(
    (
      await submit({
        email: 'invalid',
        currentPassword: 'Current-password-123!',
      })
    ).status,
  ).toBe(400)
  expect(
    (await submit({ email: 'new@example.invalid', currentPassword: '' }))
      .status,
  ).toBe(400)
  expect(
    (
      await submit({
        email: 'x'.repeat(9000),
        currentPassword: 'Current-password-123!',
      })
    ).status,
  ).toBe(413)
  expect(
    (await submit(undefined, { 'Content-Type': 'text/plain' })).status,
  ).toBe(415)
  expect(calls).toHaveLength(0)
})

test('una contraseña incorrecta conserva la sesión original y no actualiza el correo', async () => {
  const { state, submit, calls } = harness()
  state.passwordCorrect = false
  const response = await submit()
  expect(response.status).toBe(400)
  expect((await response.json()).code).toBe('invalid_current_password')
  expect(mutations(calls)).toHaveLength(0)
  expect(calls.some((call) => call.url.pathname === '/auth/v1/logout')).toBe(
    false,
  )
})

test('un actor RPC de otro UUID no puede utilizar la API privilegiada', async () => {
  const { state, submit, calls } = harness()
  state.actorId = userB
  expect((await submit()).status).toBe(403)
  expect(mutations(calls)).toHaveLength(0)
  expect(calls.some((call) => call.url.pathname === '/auth/v1/token')).toBe(
    false,
  )
})

test('un administrador debe mantener AAL2; metadata editable no sustituye al actor', async () => {
  for (const assurance of ['aal1', 'aal2']) {
    const { state, submit, calls } = harness()
    state.role = 'admin'
    state.aal = assurance
    const response = await submit()
    expect(response.status).toBe(assurance === 'aal2' ? 200 : 403)
    expect(mutations(calls)).toHaveLength(assurance === 'aal2' ? 1 : 0)
  }
  const pendingMfa = harness()
  pendingMfa.state.role = 'admin'
  pendingMfa.state.aal = 'aal2'
  pendingMfa.state.requiresMfa = true
  expect((await pendingMfa.submit()).status).toBe(403)
})

test('el límite por UUID devuelve Retry-After y bloquea la prueba de contraseñas', async () => {
  const { state, submit, calls } = harness()
  state.limitAllowed = false
  const response = await submit()
  expect(response.status).toBe(429)
  expect(response.headers.get('retry-after')).toBe('741')
  expect((await response.json()).retryAfterSeconds).toBe(741)
  expect(calls.some((call) => call.url.pathname === '/auth/v1/token')).toBe(
    false,
  )
  expect(mutations(calls)).toHaveLength(0)
})

test('un limitador con respuesta inválida falla cerrado y no omite la protección', async () => {
  const { state, submit, calls } = harness()
  state.rateMalformed = true
  expect((await submit()).status).toBe(503)
  expect(calls.some((call) => call.url.pathname === '/auth/v1/token')).toBe(
    false,
  )
})

test('un login de contraseña que responde con otro usuario no cambia la cuenta solicitada', async () => {
  const { state, submit, calls } = harness()
  state.passwordUserId = userB
  expect((await submit()).status).toBe(403)
  expect(mutations(calls)).toHaveLength(0)
  expect(calls.at(-1)?.url.searchParams.get('scope')).toBe('local')
})

test('revalida identidad y correo antes de escribir y descarta solicitudes que quedaron obsoletas', async () => {
  for (const changed of ['identityChanged', 'emailChanged'] as const) {
    const { state, submit, calls } = harness()
    state[changed] = true
    const response = await submit()
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('account_changed')
    expect(mutations(calls)).toHaveLength(0)
    expect(calls.at(-1)?.url.pathname).toBe('/auth/v1/logout')
  }
})

test('un correo ocupado produce un error comprensible sin revelar usuarios ni respuestas internas', async () => {
  const { state, submit } = harness()
  state.duplicateEmail = true
  const response = await submit()
  expect(response.status).toBe(409)
  expect(await response.json()).toEqual({
    code: 'email_unavailable',
    message: 'No se puede utilizar ese correo. Prueba con otro.',
  })
})

test('una respuesta fallida de Auth no filtra secretos ni solicita un correo de confirmación', async () => {
  const { state, submit } = harness()
  state.updateUnavailable = true
  const response = await submit()
  expect(response.status).toBe(503)
  const text = await response.text()
  expect(text).not.toContain('private')
  expect(text).not.toContain(config.serviceRoleKey)
  expect(text).not.toContain(originalToken)
  expect(text).not.toContain('Current-password')
})

test('si se pierde la respuesta tras iniciar el cambio no afirma que no se haya guardado', async () => {
  for (const uncertain of ['updateUncertain', 'updateMalformed'] as const) {
    const { state, submit, calls } = harness()
    state[uncertain] = true
    const response = await submit()
    expect(response.status).toBe(503)
    expect((await response.json()).code).toBe('change_status_unknown')
    expect(mutations(calls)).toHaveLength(1)
    expect(calls.at(-1)?.url.pathname).toBe('/auth/v1/logout')
  }
})

test('un fallo de red previo al cambio no hace ninguna escritura', async () => {
  const { state, submit, calls } = harness()
  state.upstreamUnavailable = true
  const response = await submit()
  expect(response.status).toBe(503)
  expect((await response.json()).code).toBe('service_unavailable')
  expect(mutations(calls)).toHaveLength(0)
})

test('el cleanup utiliza exclusivamente la sesión temporal, incluso cuando falla', async () => {
  const { state, submit, calls } = harness()
  state.cleanupUnavailable = true
  expect((await submit()).status).toBe(200)
  const logout = calls.filter((call) => call.url.pathname === '/auth/v1/logout')
  expect(logout).toHaveLength(1)
  expect(logout[0].headers.get('authorization')).toBe(`Bearer ${passwordToken}`)
  expect(logout[0].url.searchParams.get('scope')).toBe('local')
})

test('jamás cierra la sesión original si el proveedor devolviera el mismo token', async () => {
  const { state, submit, calls } = harness()
  state.passwordToken = originalToken
  expect((await submit()).status).toBe(200)
  expect(calls.some((call) => call.url.pathname === '/auth/v1/logout')).toBe(
    false,
  )
})

test('interrumpe la lectura del body cuando vence el plazo, incluso si el stream nunca termina', async () => {
  const deadline = new AbortController()
  let cancelled = false
  let upstreamCalls = 0
  const handler = createChangeEmailHandler(config, {
    requestSignal: () => deadline.signal,
    fetch: async () => {
      upstreamCalls++
      throw new Error('No upstream request should be made')
    },
  })
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"email":'))
    },
    cancel() {
      cancelled = true
    },
  })
  const options: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    headers: {
      Origin: origin,
      Authorization: `Bearer ${originalToken}`,
      'Content-Type': 'application/json',
    },
    body,
    duplex: 'half',
  }
  const pending = handler(
    new Request('https://functions.example/change-email', options),
  )
  deadline.abort()
  const response = await pending
  expect(response.status).toBe(408)
  expect((await response.json()).code).toBe('request_timeout')
  expect(cancelled).toBe(true)
  expect(upstreamCalls).toBe(0)
})

test('rechaza upstream HTTP no local y admite HTTP únicamente en loopback para pruebas locales', async () => {
  let calls = 0
  for (const url of ['http://auth.example', 'http://localhost:54321']) {
    const handler = createChangeEmailHandler(
      { ...config, supabaseUrl: url },
      {
        fetch: async () => {
          calls++
          return Response.json({ code: 'bad_jwt' }, { status: 401 })
        },
      },
    )
    const response = await handler(
      new Request('https://functions.example/change-email', {
        method: 'POST',
        headers: {
          Origin: origin,
          Authorization: `Bearer ${originalToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'new@example.invalid',
          currentPassword: 'Current-password-123!',
        }),
      }),
    )
    expect(response.status).toBe(url.includes('localhost') ? 401 : 503)
  }
  expect(calls).toBe(1)
})
