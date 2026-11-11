import { Buffer } from 'node:buffer'
import { test as base, type BrowserContext, type Page } from '@playwright/test'
import { defaultSiteSettings } from '../src/domain/site-settings'

export { expect } from '@playwright/test'

// These are isolated network-contract tests, not hosted Supabase/Auth tests.
// They execute the real SDK and application adapters. No source module is mocked.
export const fixtureProject = 'abcdefghijklmnopqrst'
export const fixtureStorageKey = `sb-${fixtureProject}-auth-token`
export const customerA = '00000000-0000-4000-8000-0000000000a1'
export const customerB = '00000000-0000-4000-8000-0000000000b2'
export const fixturePassword = 'Una-clave-Segura-123!'
export const fixtureEmail = 'ana@example.invalid'

interface NetworkRequest {
  method: string
  path: string
  grant: string | null
  scope: string | null
  redirectTo: string | null
  body: Record<string, unknown>
}

export interface SupabaseAuthNetwork {
  requests: NetworkRequest[]
  invalidPassword: boolean
  confirmed: boolean
  signupSessionMissing: boolean
  adminMembership: boolean
  maliciousMetadata: boolean
  mfaEnrolled: boolean
  actorOwnerMismatch: boolean
  profileOwnerMismatch: boolean
  signOutUnavailable: boolean
  passwordUpdated: boolean
  trustedSessions: Map<string, string>
  currentUserId: string
  currentEmail: string
  seedSession(
    page: Page,
    options?: { expired?: boolean; storedUserId?: string },
  ): Promise<void>
}

function jwt(
  userId: string,
  assurance: 'aal1' | 'aal2',
  expired = false,
  sessionId = '00000000-0000-4000-8000-000000000001',
) {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    iss: `https://${fixtureProject}.supabase.co/auth/v1`,
    sub: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email: fixtureEmail,
    aal: assurance,
    iat: Math.floor(Date.now() / 1000) - 10,
    exp: Math.floor(Date.now() / 1000) + (expired ? -60 : 3600),
    session_id: sessionId,
  })}.c2RrLW5ldHdvcmstZml4dHVyZS1zaWduYXR1cmU`
}

export async function installNetwork(
  context: BrowserContext,
): Promise<SupabaseAuthNetwork> {
  let assurance: 'aal1' | 'aal2' = 'aal1'
  let enrollmentStarted = false
  let sessionNumber = 0
  const profiles = new Map([
    [customerA, { first_name: 'Ana', last_name: 'Torres', phone: '912345678' }],
    [
      customerB,
      { first_name: 'Beatriz', last_name: 'Rojas', phone: '923456789' },
    ],
  ])
  const network: SupabaseAuthNetwork = {
    requests: [],
    invalidPassword: false,
    confirmed: true,
    signupSessionMissing: false,
    adminMembership: false,
    maliciousMetadata: false,
    mfaEnrolled: true,
    actorOwnerMismatch: false,
    profileOwnerMismatch: false,
    signOutUnavailable: false,
    passwordUpdated: false,
    trustedSessions: new Map(),
    currentUserId: customerA,
    currentEmail: fixtureEmail,
    async seedSession(page, options = {}) {
      const session = makeSession(options.expired)
      session.user.id = options.storedUserId ?? network.currentUserId
      await page.addInitScript(
        ({ key, value }) => localStorage.setItem(key, value),
        {
          key: fixtureStorageKey,
          value: JSON.stringify(session),
        },
      )
    },
  }
  function makeUser(userId = network.currentUserId) {
    const profile = profiles.get(userId) ?? profiles.get(customerA)!
    return {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email: network.currentEmail,
      email_confirmed_at: network.confirmed ? '2026-01-01T00:00:00.000Z' : null,
      confirmed_at: network.confirmed ? '2026-01-01T00:00:00.000Z' : null,
      phone: '',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {
        firstName: profile.first_name,
        lastName: profile.last_name,
        phone: profile.phone,
        ...(network.maliciousMetadata ? { role: 'admin', is_admin: true } : {}),
      },
      identities: [
        {
          id: userId,
          user_id: userId,
          identity_id: userId,
          provider: 'email',
          identity_data: { email: network.currentEmail, sub: userId },
        },
      ],
      factors:
        network.adminMembership && (network.mfaEnrolled || enrollmentStarted)
          ? [
              {
                id: 'factor-test',
                friendly_name: 'Authenticator',
                factor_type: 'totp',
                status: network.mfaEnrolled ? 'verified' : 'unverified',
                created_at: '2026-01-01T00:00:00.000Z',
                updated_at: '2026-01-01T00:00:00.000Z',
              },
            ]
          : [],
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }
  }
  function makeSession(expired = false) {
    return {
      access_token: jwt(
        network.currentUserId,
        assurance,
        expired,
        `fixture-session-${sessionNumber}`,
      ),
      refresh_token: 'fixture-refresh-token',
      token_type: 'bearer',
      expires_in: expired ? -60 : 3600,
      expires_at: Math.floor(Date.now() / 1000) + (expired ? -60 : 3600),
      user: makeUser(),
    }
  }
  await context.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.hostname !== `${fixtureProject}.supabase.co`) {
      // A wrong server config must never leak dummy credentials into dev.
      await route.abort('blockedbyclient')
      throw new Error(
        'The isolated auth test server must use the fixture project URL.',
      )
    }
    const headers = {
      'x-supabase-api-version': '2024-01-01',
      'access-control-expose-headers': 'x-supabase-api-version',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    }
    const fulfill = (json: unknown, status = 200) =>
      route.fulfill({ status, headers, json })
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers })
      return
    }
    const body = request.postData()
      ? (request.postDataJSON() as Record<string, unknown>)
      : {}
    network.requests.push({
      method: request.method(),
      path: url.pathname,
      grant: url.searchParams.get('grant_type'),
      scope: url.searchParams.get('scope'),
      redirectTo: url.searchParams.get('redirect_to'),
      body,
    })
    if (
      url.pathname.startsWith('/rest/v1/rpc/') ||
      url.pathname === '/auth/v1/user' ||
      url.pathname === '/auth/v1/factors' ||
      url.pathname.startsWith('/auth/v1/factors/')
    ) {
      const bearer = request.headers().authorization?.replace(/^Bearer /i, '')
      if (!bearer?.endsWith('.c2RrLW5ldHdvcmstZml4dHVyZS1zaWduYXR1cmU')) {
        await fulfill(
          { code: '42501', message: 'A fixture user bearer is required' },
          401,
        )
        return
      }
    }
    if (
      url.pathname === '/functions/v1/account-recovery' &&
      body.action === 'status'
    ) {
      await fulfill({ hasCode: false, createdAt: null })
      return
    }
    if (url.pathname === '/auth/v1/token') {
      const grant = url.searchParams.get('grant_type')
      if (grant === 'password' && network.invalidPassword) {
        await fulfill(
          { code: 'invalid_credentials', msg: 'Invalid login credentials' },
          400,
        )
      } else if (grant === 'refresh_token') {
        await fulfill(
          { code: 'refresh_token_not_found', msg: 'Refresh token not found' },
          400,
        )
      } else {
        if (grant === 'password') {
          assurance = 'aal1'
          sessionNumber++
        }
        await fulfill(makeSession())
      }
      return
    }
    if (url.pathname === '/auth/v1/user') {
      if (request.method() === 'PUT') network.passwordUpdated = true
      await fulfill(makeUser())
      return
    }
    if (url.pathname === '/auth/v1/signup') {
      network.confirmed = true
      await fulfill(network.signupSessionMissing ? makeUser() : makeSession())
      return
    }
    if (url.pathname === '/auth/v1/recover') {
      await fulfill({})
      return
    }
    if (url.pathname === '/auth/v1/logout') {
      if (network.signOutUnavailable) await fulfill({ msg: 'Unavailable' }, 503)
      else await route.fulfill({ status: 204, headers })
      return
    }
    if (url.pathname === '/auth/v1/factors' && request.method() === 'POST') {
      enrollmentStarted = true
      await fulfill({
        id: 'factor-test',
        type: 'totp',
        friendly_name: 'Aroma Infini',
        totp: {
          qr_code:
            '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path d="M0 0h100v100H0z" fill="white"/><path d="M10 10h30v30H10z" fill="black"/></svg>',
          secret: 'JBSWY3DPEHPK3PXP',
          uri: 'otpauth://totp/Aroma%20Infini:test?secret=JBSWY3DPEHPK3PXP',
        },
      })
      return
    }
    if (url.pathname === '/auth/v1/factors/factor-test/challenge') {
      await fulfill({
        id: 'challenge-test',
        type: 'totp',
        expires_at: Math.floor(Date.now() / 1000) + 300,
      })
      return
    }
    if (url.pathname === '/auth/v1/factors/factor-test/verify') {
      if (body.code !== '123456')
        await fulfill(
          { code: 'mfa_verification_failed', msg: 'Invalid TOTP code' },
          422,
        )
      else {
        assurance = 'aal2'
        network.mfaEnrolled = true
        await fulfill(makeSession())
      }
      return
    }
    if (url.pathname === '/rest/v1/rpc/current_actor') {
      const token =
        request.headers().authorization?.replace(/^Bearer /i, '') ?? ''
      const claims = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString(),
      )
      const trustedUntil = network.trustedSessions.get(token)
      const trusted = Boolean(
        trustedUntil && Date.parse(trustedUntil) > Date.now(),
      )
      await fulfill({
        user_id: network.actorOwnerMismatch ? customerB : network.currentUserId,
        role: network.adminMembership ? 'admin' : 'customer',
        aal: claims.aal,
        requires_mfa:
          network.adminMembership && claims.aal !== 'aal2' && !trusted,
        trusted_device: trusted,
        trusted_until: trusted ? trustedUntil : null,
      })
      return
    }
    if (
      url.pathname === '/rest/v1/rpc/get_profile' ||
      url.pathname === '/rest/v1/rpc/update_profile'
    ) {
      if (url.pathname.endsWith('update_profile')) {
        profiles.set(network.currentUserId, {
          first_name: String(body.p_first_name),
          last_name: String(body.p_last_name),
          phone: String(body.p_phone),
        })
      }
      const owner = network.profileOwnerMismatch
        ? customerB
        : network.currentUserId
      await fulfill({
        user_id: owner,
        ...profiles.get(owner),
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      })
      return
    }
    if (url.pathname === '/rest/v1/rpc/get_address') {
      await fulfill(null)
      return
    }
    if (url.pathname === '/rest/v1/rpc/customer_orders') {
      await fulfill([])
      return
    }
    if (url.pathname === '/rest/v1/rpc/customer_favorites') {
      await fulfill({ productIds: [], version: 0 })
      return
    }
    if (url.pathname === '/rest/v1/rpc/site_settings') {
      await fulfill({ version: 1, data: defaultSiteSettings() })
      return
    }
    if (
      [
        '/rest/v1/rpc/site_media_document',
        '/rest/v1/rpc/public_media_aliases',
      ].includes(url.pathname)
    ) {
      await fulfill({ items: [] })
      return
    }
    // Product detail reads these public/account documents even when the suite
    // is exercising another feature. Dedicated review fixtures override them.
    if (url.pathname === '/rest/v1/rpc/product_reviews') {
      await fulfill({
        items: [],
        total: 0,
        page: Number(body.p_page ?? 1),
        pageSize: 3,
        count: 0,
        average: null,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      })
      return
    }
    if (url.pathname === '/rest/v1/rpc/customer_product_review') {
      await fulfill(null)
      return
    }
    await fulfill(
      {
        code: 'fixture_unhandled_route',
        message: 'Unhandled isolated test request',
      },
      500,
    )
    throw new Error(
      `Unhandled SDK network contract: ${request.method()} ${url.pathname}`,
    )
  })
  return network
}

export const test = base.extend<{ supabaseNetwork: SupabaseAuthNetwork }>({
  supabaseNetwork: async ({ context }, runFixture) => {
    const network = await installNetwork(context)
    await runFixture(network)
  },
})

export async function signIn(
  page: Page,
  audience: 'customer' | 'admin' = 'customer',
) {
  await page.goto(audience === 'admin' ? '/admin/login' : '/iniciar-sesion')
  await page
    .getByLabel('Correo electrónico', { exact: true })
    .fill(fixtureEmail)
  await page.getByLabel('Contraseña', { exact: true }).fill(fixturePassword)
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click()
}
