import { Buffer } from 'node:buffer'
import type { Page } from '@playwright/test'
import {
  customerA,
  customerB,
  expect,
  fixtureProject,
  fixtureStorageKey,
  signIn,
  test,
} from './supabase-auth-fixture'

// Real SDK + isolated HTTP fixture. These checks exercise delayed responses and
// the SDK's one existing persistence key, never hosted users or signed tokens.
function gate() {
  let resolve!: () => void
  const wait = new Promise<void>((done) => {
    resolve = done
  })
  return { wait, resolve }
}

async function snapshot(page: Page) {
  const raw = await page.evaluate(
    (key) => localStorage.getItem(key),
    fixtureStorageKey,
  )
  if (!raw) throw new Error('Expected an SDK fixture session')
  return JSON.parse(raw) as {
    access_token: string
    refresh_token: string
    user: { id: string; email: string; [key: string]: unknown }
    [key: string]: unknown
  }
}

function changedToken(token: string, changes: Record<string, unknown>) {
  const [header, body, signature] = token.split('.')
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString())
  return `${header}.${Buffer.from(JSON.stringify({ ...payload, ...changes })).toString('base64url')}.${signature}`
}

async function invoke(page: Page, action: 'enroll' | 'verified') {
  return page.evaluate(async (which) => {
    const source = '/src/services/auth-adapter.ts'
    const { authAdapter } = await import(source)
    try {
      const result =
        which === 'enroll'
          ? await authAdapter.enrollMfa()
          : await authAdapter.getVerifiedSession()
      return { succeeded: true, empty: result === null }
    } catch (error) {
      return {
        succeeded: false,
        code:
          error && typeof error === 'object' && 'code' in error
            ? error.code
            : 'unknown',
      }
    }
  }, action)
}

async function readyVerifiedCustomer(page: Page) {
  await signIn(page)
  await expect(page).toHaveURL('/cuenta')
  await page.evaluate(async () => {
    const source = '/src/services/auth-service.ts'
    const { authService } = await import(source)
    await authService.initialize()
  })
}

for (const first of ['user', 'actor'] as const) {
  test(`Auth y actor arrancan en paralelo y esperan ambas respuestas: primero ${first}`, async ({
    page,
    supabaseNetwork,
  }) => {
    void supabaseNetwork
    await readyVerifiedCustomer(page)
    const { access_token: token } = await snapshot(page)
    const release = { user: gate(), actor: gate() }
    const requests: Array<{ kind: 'user' | 'actor'; bearer: string }> = []
    const origin = `https://${fixtureProject}.supabase.co`
    await page.route(`${origin}/auth/v1/user`, async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      requests.push({
        kind: 'user',
        bearer: route.request().headers().authorization ?? '',
      })
      await release.user.wait
      await route.fallback()
    })
    await page.route(`${origin}/rest/v1/rpc/current_actor`, async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fallback()
      requests.push({
        kind: 'actor',
        bearer: route.request().headers().authorization ?? '',
      })
      await release.actor.wait
      await route.fallback()
    })
    let returned = false
    const reading = invoke(page, 'verified').then((value) => {
      returned = true
      return value
    })
    try {
      await expect
        .poll(() => requests.filter(({ kind }) => kind === 'user').length)
        .toBe(1)
      // In the old sequential implementation this actor request cannot start
      // until the held getUser response finishes; this is the positive oracle.
      await expect
        .poll(() => requests.filter(({ kind }) => kind === 'actor').length)
        .toBe(1)
      expect(requests.every(({ bearer }) => bearer === `Bearer ${token}`)).toBe(
        true,
      )
      expect(returned).toBe(false)
      const url =
        first === 'user'
          ? `${origin}/auth/v1/user`
          : `${origin}/rest/v1/rpc/current_actor`
      const finished = page.waitForResponse(
        (response) =>
          response.url() === url && response.request().method() !== 'OPTIONS',
      )
      release[first].resolve()
      await (await finished).finished()
      await page.evaluate(() => Promise.resolve())
      expect(returned).toBe(false)
      release[first === 'user' ? 'actor' : 'user'].resolve()
      expect(await reading).toEqual({ succeeded: true, empty: false })
      expect(requests).toHaveLength(2)
    } finally {
      release.user.resolve()
      release.actor.resolve()
      await reading
    }
  })
}

test('Auth rechazada prevalece sobre un actor válido y espera terminar la lectura paralela', async ({
  page,
  supabaseNetwork,
}) => {
  void supabaseNetwork
  await readyVerifiedCustomer(page)
  const release = gate()
  let actorArrived = false
  const origin = `https://${fixtureProject}.supabase.co`
  const headers = {
    'x-supabase-api-version': '2024-01-01',
    'access-control-expose-headers': 'x-supabase-api-version',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
  }
  await page.route(`${origin}/auth/v1/user`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    await route.fulfill({
      status: 401,
      headers,
      json: { code: 'bad_jwt', message: 'Isolated revoked Auth user' },
    })
  })
  await page.route(`${origin}/rest/v1/rpc/current_actor`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fallback()
    actorArrived = true
    await release.wait
    await route.fulfill({
      headers,
      json: {
        user_id: customerA,
        role: 'admin',
        aal: 'aal2',
        requires_mfa: false,
      },
    })
  })
  let returned = false
  const reading = invoke(page, 'verified').then((value) => {
    returned = true
    return value
  })
  try {
    await expect.poll(() => actorArrived).toBe(true)
    expect(returned).toBe(false)
    release.resolve()
    expect(await reading).toEqual({ succeeded: true, empty: true })
  } finally {
    release.resolve()
    await reading
  }
})

test('Cerrar sesión descarta Auth y actor que ya estaban pendientes en paralelo', async ({
  page,
  supabaseNetwork,
}) => {
  void supabaseNetwork
  await readyVerifiedCustomer(page)
  const release = gate()
  const arrived = { user: false, actor: false }
  const origin = `https://${fixtureProject}.supabase.co`
  await page.route(`${origin}/auth/v1/user`, async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    arrived.user = true
    await release.wait
    await route.fallback()
  })
  await page.route(`${origin}/rest/v1/rpc/current_actor`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fallback()
    arrived.actor = true
    await release.wait
    await route.fallback()
  })
  const reading = invoke(page, 'verified')
  try {
    await expect.poll(() => arrived).toEqual({ user: true, actor: true })
    await page.evaluate(async () => {
      const source = '/src/services/auth-service.ts'
      const { authService } = await import(source)
      await authService.signOut()
    })
    release.resolve()
    expect(await reading).toEqual({ succeeded: true, empty: true })
    expect(
      await page.evaluate(async () => {
        const source = '/src/services/auth-service.ts'
        const { authService } = await import(source)
        return authService.getSnapshot().session
      }),
    ).toBeNull()
  } finally {
    release.resolve()
    await reading
  }
})

test('las verificaciones simultáneas comparten solo el mismo token en vuelo y vuelven a consultar después', async ({
  page,
  supabaseNetwork,
}) => {
  void supabaseNetwork
  await signIn(page)
  await expect(page).toHaveURL('/cuenta')
  // Finish initial Auth verification before measuring explicit helper calls.
  await page.evaluate(async () => {
    const source = '/src/services/auth-service.ts'
    const { authService } = await import(source)
    await authService.initialize()
  })
  const { access_token: token } = await snapshot(page)
  const different = changedToken(token, { session_id: 'separate-verification' })
  const arrived = gate()
  const release = gate()
  const requested: string[] = []
  await page.route(
    `https://${fixtureProject}.supabase.co/auth/v1/user`,
    async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      requested.push(route.request().headers().authorization ?? '')
      if (requested.length === 1) {
        arrived.resolve()
        await release.wait
      }
      await route.fallback()
    },
  )
  const concurrent = page.evaluate(async (credential) => {
    const source = '/src/services/verified-auth-user.ts'
    const { verifySupabaseUser } = await import(source)
    const first = verifySupabaseUser(credential)
    const second = verifySupabaseUser(credential)
    const shared = first === second
    const results = await Promise.all([first, second])
    return { shared, userIds: results.map((result) => result.data.user?.id) }
  }, token)
  try {
    await arrived.wait
    expect(requested).toEqual([`Bearer ${token}`])
    // A different token must complete independently while the first is held.
    const other = await page.evaluate(async (credential) => {
      const source = '/src/services/verified-auth-user.ts'
      const { verifySupabaseUser } = await import(source)
      const result = await verifySupabaseUser(credential)
      return { userId: result.data.user?.id, error: result.error?.code }
    }, different)
    expect(other).toEqual({ userId: customerA, error: undefined })
    expect(requested).toEqual([`Bearer ${token}`, `Bearer ${different}`])
  } finally {
    release.resolve()
  }
  expect(await concurrent).toEqual({
    shared: true,
    userIds: [customerA, customerA],
  })
  await page.evaluate(async (credential) => {
    const source = '/src/services/verified-auth-user.ts'
    const { verifySupabaseUser } = await import(source)
    await verifySupabaseUser(credential)
  }, token)
  expect(requested).toEqual([
    `Bearer ${token}`,
    `Bearer ${different}`,
    `Bearer ${token}`,
  ])
})

test('un rechazo de verificación no queda almacenado para el siguiente intento', async ({
  page,
  supabaseNetwork,
}) => {
  void supabaseNetwork
  await signIn(page)
  await expect(page).toHaveURL('/cuenta')
  await page.evaluate(async () => {
    const source = '/src/services/auth-service.ts'
    const { authService } = await import(source)
    await authService.initialize()
  })
  const { access_token: token } = await snapshot(page)
  let requests = 0
  await page.route(
    `https://${fixtureProject}.supabase.co/auth/v1/user`,
    async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      requests++
      if (requests === 1) {
        await route.fulfill({
          status: 401,
          json: { code: 'bad_jwt', message: 'Isolated verification rejection' },
        })
        return
      }
      await route.fallback()
    },
  )
  const result = await page.evaluate(async (credential) => {
    const source = '/src/services/verified-auth-user.ts'
    const { verifySupabaseUser } = await import(source)
    const rejected = await verifySupabaseUser(credential)
    const retried = await verifySupabaseUser(credential)
    return {
      rejectedStatus: rejected.error?.status,
      retriedUserId: retried.data.user?.id,
      retriedError: retried.error?.code,
    }
  }, token)
  expect(result).toEqual({
    rejectedStatus: 401,
    retriedUserId: customerA,
    retriedError: undefined,
  })
  expect(requests).toBe(2)
})

test('una respuesta de actor anterior no publica AAL de un token reemplazado del mismo usuario', async ({
  page,
  supabaseNetwork,
}) => {
  supabaseNetwork.adminMembership = true
  await signIn(page, 'admin')
  await expect(
    page.getByRole('heading', { name: 'Verificación en dos pasos' }),
  ).toBeVisible()
  const old = await snapshot(page)
  const arrived = gate()
  const release = gate()
  await page.route(
    `https://${fixtureProject}.supabase.co/rest/v1/rpc/current_actor`,
    async (route) => {
      arrived.resolve()
      await release.wait
      await route.fulfill({
        json: {
          user_id: customerA,
          role: 'admin',
          aal: 'aal1',
          requires_mfa: true,
        },
      })
    },
  )
  const pending = invoke(page, 'verified')
  await arrived.wait
  const rotated = {
    ...old,
    access_token: changedToken(old.access_token, {
      iat: Math.floor(Date.now() / 1000),
      session_id: 'changed-session',
    }),
  }
  await page.evaluate(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    { key: fixtureStorageKey, session: rotated },
  )
  release.resolve()
  expect(await pending).toEqual({ succeeded: true, empty: true })
  expect((await snapshot(page)).access_token).toBe(rotated.access_token)
})

test('una inscripción TOTP pendiente queda fijada al administrador original y descarta su secreto al cambiar de cuenta', async ({
  page,
  context,
  supabaseNetwork,
}) => {
  supabaseNetwork.adminMembership = true
  supabaseNetwork.mfaEnrolled = false
  await signIn(page, 'admin')
  await expect(
    page.getByRole('heading', { name: 'Verificación en dos pasos' }),
  ).toBeVisible()
  const old = await snapshot(page)
  const arrived = gate()
  const release = gate()
  let sentBearer = ''
  await page.route(
    `https://${fixtureProject}.supabase.co/auth/v1/factors`,
    async (route) => {
      sentBearer = route.request().headers().authorization ?? ''
      arrived.resolve()
      await release.wait
      await route.fulfill({
        json: {
          id: 'factor-race',
          type: 'totp',
          totp: { qr_code: '<svg/>', secret: 'SECRET-MUST-NOT-BE-RETURNED' },
        },
      })
    },
  )
  const pending = invoke(page, 'enroll')
  await arrived.wait
  const other = await context.newPage()
  await other.goto('/contacto')
  supabaseNetwork.currentUserId = customerB
  const replacement = {
    ...old,
    access_token: changedToken(old.access_token, { sub: customerB }),
    user: { ...old.user, id: customerB },
  }
  await other.evaluate(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    { key: fixtureStorageKey, session: replacement },
  )
  release.resolve()
  const result = await pending
  expect(result).toEqual({ succeeded: false, code: 'session' })
  expect(sentBearer).toBe(`Bearer ${old.access_token}`)
  expect((await snapshot(page)).user.id).toBe(customerB)
  expect(
    await page.evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
      }),
    ),
  ).not.toContain('SECRET-MUST-NOT-BE-RETURNED')
})

for (const change of ['logout', 'other-account'] as const) {
  test(`el commit oficial del SDK de MFA no restaura una sesión anterior después de ${change}`, async ({
    page,
    context,
    supabaseNetwork,
  }) => {
    supabaseNetwork.adminMembership = true
    await signIn(page, 'admin')
    await expect(
      page.getByRole('heading', { name: 'Verificación en dos pasos' }),
    ).toBeVisible()
    const old = await snapshot(page)
    const upgraded = changedToken(old.access_token, { aal: 'aal2' })
    const arrived = gate()
    const release = gate()
    await page.route(
      `https://${fixtureProject}.supabase.co/auth/v1/user`,
      async (route) => {
        if (route.request().headers().authorization !== `Bearer ${upgraded}`) {
          await route.fallback()
          return
        }
        arrived.resolve()
        await release.wait
        await route.fulfill({ json: old.user })
      },
    )
    const pending = page.evaluate(
      async ({ previousToken, nextToken, userId, refreshToken }) => {
        const source = '/src/services/supabase-client.ts'
        const { commitSupabaseMfaSession, requireSupabaseClient } =
          await import(source)
        try {
          const result = await commitSupabaseMfaSession(
            { userId, previousToken, nextToken },
            () =>
              requireSupabaseClient().auth.setSession({
                access_token: nextToken,
                refresh_token: refreshToken,
              }),
          )
          return {
            succeeded: !result.error,
            ...(result.error
              ? { code: result.error.code ?? result.error.name }
              : {}),
          }
        } catch (error) {
          return {
            succeeded: false,
            code:
              error && typeof error === 'object' && 'code' in error
                ? error.code
                : 'unknown',
          }
        }
      },
      {
        previousToken: old.access_token,
        nextToken: upgraded,
        userId: customerA,
        refreshToken: old.refresh_token,
      },
    )
    await Promise.race([
      arrived.wait,
      pending.then((result) => {
        throw new Error(
          `The SDK commit finished before the delayed request: ${JSON.stringify(result)}`,
        )
      }),
    ])
    const other = await context.newPage()
    // A same-origin empty page avoids mounting a second SPA during the race.
    await other.route('**/__auth_race', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Isolated storage actor</title>',
      }),
    )
    await other.goto('/__auth_race')
    if (change === 'logout') {
      await other.evaluate(
        (key) => localStorage.removeItem(key),
        fixtureStorageKey,
      )
    } else {
      const replacement = {
        ...old,
        access_token: changedToken(old.access_token, { sub: customerB }),
        user: { ...old.user, id: customerB },
      }
      await other.evaluate(
        ({ key, session }) =>
          localStorage.setItem(key, JSON.stringify(session)),
        { key: fixtureStorageKey, session: replacement },
      )
    }
    release.resolve()
    expect(await pending).toEqual({ succeeded: false, code: 'session' })
    if (change === 'logout') {
      expect(
        await page.evaluate(
          (key) => localStorage.getItem(key),
          fixtureStorageKey,
        ),
      ).toBeNull()
    } else {
      const final = await snapshot(page)
      expect(final.user.id).toBe(customerB)
      expect(final.access_token).not.toBe(upgraded)
    }
  })
}

for (const event of ['same-owner-sign-in', 'token-refresh'] as const) {
  test(`los borradores del perfil conservan su formulario durante ${event}`, async ({
    page,
    supabaseNetwork,
  }) => {
    supabaseNetwork.confirmed = true
    await signIn(page)
    await expect(page).toHaveURL('/cuenta')
    await page.goto('/cuenta/datos')
    const name = page.getByLabel('Nombre', { exact: true })
    await name.fill('Borrador sin guardar')
    await name.evaluate((element) =>
      element.setAttribute('data-draft-instance', 'original'),
    )
    const previous = await snapshot(page)
    const arrived = gate()
    const release = gate()
    await page.route(
      `https://${fixtureProject}.supabase.co/rest/v1/rpc/current_actor`,
      async (route) => {
        if (route.request().method() === 'OPTIONS') {
          await route.fallback()
          return
        }
        arrived.resolve()
        await release.wait
        await route.fulfill({
          json: {
            user_id: customerA,
            role: 'customer',
            aal: 'aal1',
            requires_mfa: false,
          },
        })
      },
    )
    const next = {
      ...previous,
      access_token: changedToken(previous.access_token, {
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        session_id: 'refreshed-same-owner',
      }),
    }
    if (event === 'token-refresh') {
      await page.route(
        `https://${fixtureProject}.supabase.co/auth/v1/token?grant_type=refresh_token`,
        (route) =>
          route.fulfill({
            headers: {
              'access-control-allow-origin': '*',
              'x-supabase-api-version': '2024-01-01',
            },
            json: next,
          }),
      )
    }
    const refreshed = await page.evaluate(
      async ({ action, session }) => {
        const source = '/src/services/supabase-client.ts'
        const { requireSupabaseClient } = await import(source)
        const result =
          action === 'token-refresh'
            ? await requireSupabaseClient().auth.refreshSession()
            : await requireSupabaseClient().auth.setSession({
                access_token: session.access_token,
                refresh_token: session.refresh_token,
              })
        return { ok: !result.error }
      },
      { action: event, session: next },
    )
    expect(refreshed.ok).toBe(true)
    await arrived.wait
    // Check while authoritative revalidation is still pending. A checking
    // transition would unmount this exact input and discard its unsaved value.
    try {
      await expect(name).toHaveValue('Borrador sin guardar')
      await expect(name).toHaveAttribute('data-draft-instance', 'original')
    } finally {
      release.resolve()
    }
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const source = '/src/services/auth-service.ts'
          const { authService } = await import(source)
          const state = authService.getSnapshot()
          return state.status
        }),
      )
      .toBe('authenticated')
    await expect(name).toHaveValue('Borrador sin guardar')
    await expect(name).toHaveAttribute('data-draft-instance', 'original')
    expect((await snapshot(page)).user.id).toBe(customerA)
  })
}
