import { createHash } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { createAccountRecoveryHandler } from '../supabase/functions/_shared/account-recovery-handler'

// Pure handler tests, with all upstream Auth/RPC HTTP intercepted in memory.
// No SMTP, real account, live password, browser or external provider is used.
const userA = '50000000-0000-4000-8000-000000000001'
const userB = '50000000-0000-4000-8000-000000000002'
const email = 'customer@example.invalid'
const password = 'Current-password-123!'
const nextPassword = 'Next-password-456!'
const origin = 'https://aroma.example'
const code = `AI-${'A'.repeat(64)}`
const codeHash = createHash('sha256').update(code).digest('hex')
const config = {
  supabaseUrl: 'https://auth.example',
  publishableKey: 'public-test',
  serviceRoleKey: 'server-test',
  allowedOrigins: [origin],
  rateLimitSecret: 'a-server-only-high-entropy-secret-for-testing',
}
interface Call {
  path: string
  method: string
  body: Record<string, unknown>
  headers: Headers
  url: URL
}

function harness() {
  const calls: Call[] = []
  const state = {
    role: 'customer',
    session: true,
    owner: userA,
    proofOwner: userA,
    proofPassword: true,
    legacyErrors: false,
    limit: true,
    hasCode: true,
    hash: codeHash,
    consumed: false,
    claimId: '',
    currentEmail: email,
    updateMode: 'ok',
    saved: true,
    networkFailure: false,
    accountReadFailure: false,
    replaceCodeBeforeReadFailure: false,
    hasBecomeAdmin: false,
    statusCalls: 0,
    proofToken: 'proof-session',
    originalToken: 'original-session',
  }
  const handler = createAccountRecoveryHandler(config, {
    minimumFailureDelayMs: 0,
    async fetch(input, init = {}) {
      expect(init.redirect).toBe('manual')
      const url = new URL(String(input)),
        headers = new Headers(init.headers)
      const body =
        typeof init.body === 'string'
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : {}
      const method = init.method ?? 'GET'
      calls.push({ path: url.pathname, method, body, headers, url })
      if (state.networkFailure) throw Error('private-credential-response')
      if (url.pathname === '/auth/v1/user') {
        expect(headers.get('authorization')).toBe(
          `Bearer ${state.originalToken}`,
        )
        return state.session
          ? Response.json({ id: state.owner, email: state.currentEmail })
          : Response.json({ code: 'bad_jwt' }, { status: 401 })
      }
      if (url.pathname === '/rest/v1/rpc/current_actor') {
        expect(headers.get('authorization')).toBe(
          `Bearer ${state.originalToken}`,
        )
        return Response.json({
          user_id: state.owner,
          role: state.role,
          aal: 'aal1',
          requires_mfa: state.role === 'admin',
        })
      }
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        expect(headers.get('authorization')).toBe(
          `Bearer ${config.serviceRoleKey}`,
        )
        expect(headers.get('content-profile')).toBe('api')
        switch (url.pathname.split('/').at(-1)) {
          case 'account_recovery_limit':
            expect(body.p_bucket_hash).toMatch(/^[0-9a-f]{64}$/)
            expect(JSON.stringify(body)).not.toContain(email)
            return Response.json({
              allowed: state.limit,
              retry_after_seconds: state.limit ? 0 : 750,
            })
          case 'account_recovery_status':
            state.statusCalls++
            return Response.json(
              state.role === 'admin' || state.hasBecomeAdmin
                ? null
                : {
                    hasCode: state.hasCode && !state.consumed,
                    createdAt:
                      state.hasCode && !state.consumed
                        ? '2026-10-28T10:00:00Z'
                        : null,
                  },
            )
          case 'save_account_recovery_code':
            expect(body.p_user_id).toBe(userA)
            expect(body.p_code_hash).toMatch(/^[0-9a-f]{64}$/)
            expect(body).not.toHaveProperty('recoveryCode')
            if (!state.saved) return Response.json(null)
            if (body.p_claim_id !== null && body.p_claim_id !== state.claimId)
              return Response.json(null)
            state.hash = String(body.p_code_hash)
            state.consumed = false
            state.hasCode = true
            state.claimId = ''
            return Response.json({ createdAt: '2026-10-28T10:00:00Z' })
          case 'claim_account_recovery':
            if (
              state.role === 'admin' ||
              body.p_email !== email ||
              body.p_code_hash !== state.hash ||
              state.consumed ||
              !state.hasCode
            )
              return Response.json(null)
            state.consumed = true
            state.claimId = String(body.p_claim_id)
            return Response.json({ userId: userA })
          case 'release_account_recovery_claim':
            if (body.p_claim_id !== state.claimId) return Response.json(false)
            state.consumed = false
            state.claimId = ''
            return Response.json(true)
        }
      }
      if (url.pathname === '/auth/v1/token') {
        expect(headers.get('x-supabase-api-version')).toBe('2024-01-01')
        expect(url.searchParams.get('grant_type')).toBe('password')
        expect(body).toEqual({ email: state.currentEmail, password })
        if (!state.proofPassword)
          return Response.json(
            state.legacyErrors
              ? { code: 400, error_code: 'invalid_credentials' }
              : { code: 'invalid_credentials' },
            { status: 400 },
          )
        return Response.json({
          access_token: state.proofToken,
          user: { id: state.proofOwner, email: state.currentEmail },
        })
      }
      if (url.pathname === '/auth/v1/logout') {
        expect(url.searchParams.get('scope')).toBe('local')
        expect(headers.get('authorization')).toBe(`Bearer ${state.proofToken}`)
        return new Response(null, { status: 204 })
      }
      if (url.pathname === `/auth/v1/admin/users/${userA}`) {
        expect(headers.get('x-supabase-api-version')).toBe('2024-01-01')
        expect(headers.get('authorization')).toBe(
          `Bearer ${config.serviceRoleKey}`,
        )
        if (method === 'GET') {
          if (state.accountReadFailure) {
            if (state.replaceCodeBeforeReadFailure) {
              state.hash = createHash('sha256')
                .update(`AI-${'B'.repeat(64)}`)
                .digest('hex')
              state.claimId = ''
              state.consumed = false
            }
            throw Error('private temporary read failure')
          }
          return Response.json({ id: userA, email: state.currentEmail })
        }
        expect(body).toEqual({ password: nextPassword })
        if (state.updateMode === 'weak')
          return Response.json(
            state.legacyErrors
              ? {
                  code: 422,
                  error_code: 'weak_password',
                  private_message: 'credentials',
                }
              : { code: 'weak_password', private_message: 'credentials' },
            { status: 422 },
          )
        if (state.updateMode === 'timeout')
          throw Error('private timeout credentials')
        if (state.updateMode === 'server-error')
          return Response.json({ error: 'private details' }, { status: 500 })
        if (state.updateMode === 'malformed')
          return Response.json({ id: userB })
        return Response.json({ id: userA, email })
      }
      throw Error(`Unexpected test route ${url.pathname}`)
    },
  })
  const request = (body: unknown, signed = true, overrides: RequestInit = {}) =>
    new Request('https://edge.example/account-recovery', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        ...(signed ? { Authorization: `Bearer ${state.originalToken}` } : {}),
      },
      body: JSON.stringify(body),
      ...overrides,
    })
  const invoke = (body: unknown, signed = true) =>
    handler(request(body, signed))
  return { state, calls, handler, request, invoke }
}
const issue = { action: 'issue', currentPassword: password }
const recover = {
  action: 'recover',
  email,
  recoveryCode: code,
  newPassword: nextPassword,
}

test('status verifies the real owner and returns no plaintext recovery code', async () => {
  const h = harness(),
    response = await h.invoke({ action: 'status' })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    hasCode: true,
    createdAt: '2026-10-28T10:00:00Z',
  })
  expect(h.calls.some((call) => call.path === '/auth/v1/user')).toBe(true)
  expect(h.calls.some((call) => call.path.endsWith('/current_actor'))).toBe(
    true,
  )
})
test('issue proves the current password, stores only a hash, and closes its proof session locally', async () => {
  const h = harness(),
    response = await h.invoke(issue),
    body = await response.json()
  expect(response.status).toBe(200)
  expect(body.recoveryCode).toMatch(/^AI-[0-9A-F]{64}$/)
  expect(h.state.hash).toBe(
    createHash('sha256').update(body.recoveryCode).digest('hex'),
  )
  expect(JSON.stringify(h.calls)).not.toContain(body.recoveryCode)
  expect(h.calls.at(-1)?.url.searchParams.get('scope')).toBe('local')
})
test('wrong current password cannot rotate or reveal the saved code', async () => {
  const h = harness()
  h.state.proofPassword = false
  const response = await h.invoke(issue)
  expect(response.status).toBe(400)
  expect((await response.json()).code).toBe('invalid_current_password')
  expect(
    h.calls.some((call) => call.path.endsWith('/save_account_recovery_code')),
  ).toBe(false)
})

test('legacy numeric Auth code does not hide an invalid current password error', async () => {
  const h = harness()
  h.state.proofPassword = false
  h.state.legacyErrors = true
  const response = await h.invoke(issue)
  expect(response.status).toBe(400)
  expect((await response.json()).code).toBe('invalid_current_password')
  expect(
    h.calls.some((call) => call.path.endsWith('/save_account_recovery_code')),
  ).toBe(false)
})
for (const action of ['status', 'issue'])
  test(`anonymous ${action} is rejected`, async () => {
    const h = harness(),
      response = await h.invoke(action === 'issue' ? issue : { action }, false)
    expect(response.status).toBe(401)
    expect(h.calls).toHaveLength(0)
  })
for (const action of ['status', 'issue'])
  test(`administrators cannot use customer ${action}`, async () => {
    const h = harness()
    h.state.role = 'admin'
    const response = await h.invoke(action === 'issue' ? issue : { action })
    expect(response.status).toBe(403)
    expect((await response.json()).code).toBe('recovery_not_supported')
    expect(
      h.calls.some((call) => call.path.endsWith('/save_account_recovery_code')),
    ).toBe(false)
  })
test('another password-proof owner cannot rotate the original account code', async () => {
  const h = harness()
  h.state.proofOwner = userB
  expect((await h.invoke(issue)).status).toBe(401)
  expect(
    h.calls.some((call) => call.path.endsWith('/save_account_recovery_code')),
  ).toBe(false)
  expect(h.calls.at(-1)?.path).toBe('/auth/v1/logout')
})
test('a valid saved code changes only the claimed UUID and returns a replacement without logging in', async () => {
  const h = harness(),
    response = await h.invoke(recover, false),
    body = await response.json()
  expect(response.status).toBe(200)
  expect(body.success).toBe(true)
  expect(body.recoveryCode).toMatch(/^AI-[0-9A-F]{64}$/)
  expect(body.recoveryCode).not.toBe(code)
  expect(h.state.hash).toBe(
    createHash('sha256').update(body.recoveryCode).digest('hex'),
  )
  expect(
    h.calls.some(
      (call) =>
        call.path === '/auth/v1/token' || call.path === '/auth/v1/recover',
    ),
  ).toBe(false)
  expect(h.calls.filter((call) => call.method === 'PUT')).toHaveLength(1)
  expect(
    h.calls.findIndex((call) => call.path.endsWith('/claim_account_recovery')),
  ).toBeLessThan(h.calls.findIndex((call) => call.method === 'PUT'))
})
test('formatting and case do not change the canonical hash', async () => {
  const h = harness(),
    response = await h.invoke(
      { ...recover, recoveryCode: ` ai - ${'aaaa-'.repeat(15)}aaaa ` },
      false,
    )
  expect(response.status).toBe(200)
  expect(
    h.calls.find((call) => call.path.endsWith('/claim_account_recovery'))?.body
      .p_code_hash,
  ).toBe(codeHash)
})
test('unknown email, wrong code, already consumed code and administrator return identical errors', async () => {
  const results: { status: number; body: Record<string, unknown> }[] = []
  for (const mode of ['unknown', 'wrong', 'used', 'admin']) {
    const h = harness()
    if (mode === 'used') h.state.consumed = true
    if (mode === 'admin') h.state.role = 'admin'
    const response = await h.invoke(
      {
        ...recover,
        ...(mode === 'unknown' ? { email: 'unknown@example.invalid' } : {}),
        ...(mode === 'wrong' ? { recoveryCode: `AI-${'B'.repeat(64)}` } : {}),
      },
      false,
    )
    results.push({ status: response.status, body: await response.json() })
    expect(h.calls.some((call) => call.method === 'PUT')).toBe(false)
  }
  expect(
    results.every(
      (result) => JSON.stringify(result) === JSON.stringify(results[0]),
    ),
  ).toBe(true)
  expect(results[0].body.code).toBe('invalid_recovery')
})
test('two concurrent uses of a single code cannot both change the password', async () => {
  const h = harness(),
    responses = await Promise.all([
      h.invoke(recover, false),
      h.invoke(recover, false),
    ])
  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 400,
  ])
  expect(h.calls.filter((call) => call.method === 'PUT')).toHaveLength(1)
})
test('the old saved code stays invalid after a successful recovery', async () => {
  const h = harness()
  expect((await h.invoke(recover, false)).status).toBe(200)
  const response = await h.invoke(recover, false)
  expect(response.status).toBe(400)
  expect((await response.json()).code).toBe('invalid_recovery')
  expect(h.calls.filter((call) => call.method === 'PUT')).toHaveLength(1)
})
test('rate limit uses HMAC buckets before the Auth lookup or code claim', async () => {
  const h = harness()
  h.state.limit = false
  const response = await h.invoke(recover, false)
  expect(response.status).toBe(429)
  expect(response.headers.get('Retry-After')).toBe('750')
  expect(h.calls).toHaveLength(1)
  expect(h.calls[0].path).toBe('/rest/v1/rpc/account_recovery_limit')
})
test('an administrative promotion during a recovery blocks the Auth password mutation', async () => {
  const h = harness()
  h.state.hasBecomeAdmin = true
  const response = await h.invoke(recover, false)
  expect(response.status).toBe(400)
  expect((await response.json()).code).toBe('invalid_recovery')
  expect(h.calls.some((call) => call.method === 'PUT')).toBe(false)
})
test('a definite weak-password rejection restores only the matching code claim', async () => {
  const h = harness()
  h.state.updateMode = 'weak'
  const response = await h.invoke(recover, false)
  expect(response.status).toBe(400)
  expect((await response.json()).code).toBe('invalid_password')
  expect(h.state.consumed).toBe(false)
  expect(
    h.calls.some((call) =>
      call.path.endsWith('/release_account_recovery_claim'),
    ),
  ).toBe(true)
})

test('legacy numeric Auth code preserves weak-password validation and safely restores the claim', async () => {
  const h = harness()
  h.state.updateMode = 'weak'
  h.state.legacyErrors = true
  const response = await h.invoke(recover, false)
  expect(response.status).toBe(400)
  expect((await response.json()).code).toBe('invalid_password')
  expect(h.state.consumed).toBe(false)
  expect(
    h.calls.some((call) =>
      call.path.endsWith('/release_account_recovery_claim'),
    ),
  ).toBe(true)
})

test('a read failure before issuing a password update restores the matching code for a safe retry', async () => {
  const h = harness()
  h.state.accountReadFailure = true
  const response = await h.invoke(recover, false)
  expect(response.status).toBe(503)
  expect((await response.json()).code).toBe('service_unavailable')
  expect(h.calls.some((call) => call.method === 'PUT')).toBe(false)
  expect(h.state.consumed).toBe(false)
  const claim = h.calls.find((call) =>
    call.path.endsWith('/claim_account_recovery'),
  )
  const release = h.calls.find((call) =>
    call.path.endsWith('/release_account_recovery_claim'),
  )
  expect(release?.body).toEqual({
    p_user_id: userA,
    p_claim_id: claim?.body.p_claim_id,
  })
  h.state.accountReadFailure = false
  expect((await h.invoke(recover, false)).status).toBe(200)
  expect(h.calls.filter((call) => call.method === 'PUT')).toHaveLength(1)
})

test('pre-update cleanup cannot restore a code that was replaced after its claim', async () => {
  const h = harness()
  h.state.accountReadFailure = true
  h.state.replaceCodeBeforeReadFailure = true
  const response = await h.invoke(recover, false)
  expect(response.status).toBe(503)
  expect(h.calls.some((call) => call.method === 'PUT')).toBe(false)
  expect(h.state.hash).toBe(
    createHash('sha256')
      .update(`AI-${'B'.repeat(64)}`)
      .digest('hex'),
  )
  expect(h.state.claimId).toBe('')
  expect(h.state.consumed).toBe(false)
  expect(
    h.calls.filter((call) =>
      call.path.endsWith('/release_account_recovery_claim'),
    ),
  ).toHaveLength(1)
})
for (const mode of ['timeout', 'server-error', 'malformed'])
  test(`ambiguous ${mode} never restores a consumed code or reports success`, async () => {
    const h = harness()
    h.state.updateMode = mode
    const response = await h.invoke(recover, false)
    expect(response.status).toBe(503)
    expect((await response.json()).code).toBe('recovery_status_unknown')
    expect(h.state.consumed).toBe(true)
    expect(
      h.calls.some((call) =>
        call.path.endsWith('/release_account_recovery_claim'),
      ),
    ).toBe(false)
  })
test('failure to store a replacement after reset is reported as an unknown outcome', async () => {
  const h = harness()
  h.state.saved = false
  const response = await h.invoke(recover, false)
  expect(response.status).toBe(503)
  expect((await response.json()).code).toBe('recovery_status_unknown')
  expect(h.state.consumed).toBe(true)
})
test('weak new password is rejected before any account lookup or code consumption', async () => {
  const h = harness(),
    response = await h.invoke({ ...recover, newPassword: 'short' }, false)
  expect(response.status).toBe(400)
  expect((await response.json()).code).toBe('invalid_password')
  expect(h.calls).toHaveLength(0)
})
test('requests cannot supply target UUID, metadata or privileged attributes', async () => {
  const h = harness()
  for (const extra of [
    { userId: userB },
    { role: 'admin' },
    { email_confirm: true },
    { user_metadata: { role: 'admin' } },
  ]) {
    const response = await h.invoke({ ...recover, ...extra }, false)
    expect(response.status).toBe(400)
    expect((await response.json()).code).toBe('invalid_request')
  }
  expect(h.calls).toHaveLength(0)
})
test('untrusted origin and non-POST requests cannot reach Auth', async () => {
  const h = harness()
  const denied = await h.handler(
    h.request(recover, false, {
      headers: {
        Origin: 'https://untrusted.example',
        'Content-Type': 'application/json',
      },
    }),
  )
  expect(denied.status).toBe(403)
  expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull()
  const get = await h.handler(
    new Request('https://edge.example/account-recovery', {
      headers: { Origin: origin },
    }),
  )
  expect(get.status).toBe(405)
  expect(h.calls).toHaveLength(0)
})
test('missing server-only secret fails closed without Auth traffic', async () => {
  let calls = 0
  const handler = createAccountRecoveryHandler(
    { ...config, rateLimitSecret: '' },
    {
      async fetch() {
        calls++
        throw Error('must not call')
      },
    },
  )
  const response = await handler(harness().request(recover, false))
  expect(response.status).toBe(503)
  expect(calls).toBe(0)
})
test('a response never serializes upstream errors, passwords or raw recovery codes on failure', async () => {
  const h = harness()
  h.state.networkFailure = true
  const response = await h.invoke(recover, false),
    text = await response.text()
  expect(response.status).toBe(503)
  for (const secret of [
    'private-credential-response',
    password,
    nextPassword,
    code,
    config.serviceRoleKey,
  ])
    expect(text).not.toContain(secret)
})
test('request bodies are limited before parsing credentials', async () => {
  const h = harness(),
    response = await h.invoke(
      { ...recover, newPassword: 'a'.repeat(9000) },
      false,
    )
  expect(response.status).toBe(413)
  expect(h.calls).toHaveLength(0)
})
