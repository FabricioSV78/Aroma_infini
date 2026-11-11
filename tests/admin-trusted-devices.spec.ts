import { Buffer } from 'node:buffer'
import type { BrowserContext, Page } from '@playwright/test'
import {
  customerA,
  customerB,
  expect,
  fixtureEmail,
  fixturePassword,
  installNetwork,
  signIn,
  test,
  type SupabaseAuthNetwork,
} from './supabase-auth-fixture'

const origin = 'https://admin.example.invalid'
const cookieName = '__Host-aroma-admin-device'
const days60 = 60 * 24 * 60 * 60
const viewports = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]
type Device = {
  id: string
  userId: string
  secret: string
  label: string
  created_at: string
  expires_at: string
  last_used_at: string
  revoked: boolean
}
function serverState() {
  return {
    devices: [] as Device[],
    resumes: 0,
    registrations: 0,
    unavailable: false,
  }
}

// Serve the actual local Vite application through a synthetic HTTPS origin.
// Auth and device APIs stay intercepted; no hosted account is contacted.
async function securePanel(
  context: BrowserContext,
  network: SupabaseAuthNetwork,
  state: ReturnType<typeof serverState>,
) {
  await context.route(`${origin}/**`, async (route) => {
    const source = new URL(route.request().url())
    const response = await route.fetch({
      url: `http://127.0.0.1:5175${source.pathname}${source.search}`,
    })
    await route.fulfill({ response })
  })
  await context.route(`${origin}/api/admin/auth/**`, async (route) => {
    const request = route.request()
    expect(request.headers()['x-aroma-admin-device']).toBe('1')
    const token =
      request.headers().authorization?.replace(/^Bearer /i, '') ?? ''
    const claims = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString(),
    ) as { sub: string; aal: string }
    const secret = request
      .headers()
      .cookie?.split('; ')
      .find((item) => item.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1)
    const current = state.devices.find(
      (item) =>
        item.secret === secret &&
        item.userId === claims.sub &&
        !item.revoked &&
        Date.parse(item.expires_at) > Date.now(),
    )
    const path = new URL(request.url()).pathname
    if (state.unavailable) return route.fulfill({ status: 404, json: {} })
    if (path.endsWith('/device/register')) {
      expect(claims.aal).toBe('aal2')
      expect(request.postDataJSON()).toEqual({})
      state.registrations++
      const item: Device = {
        id: `00000000-0000-4000-8000-${String(state.registrations).padStart(12, '0')}`,
        userId: claims.sub,
        secret: `server-only-secret-${state.registrations}`,
        label: `Navegador ${state.registrations}`,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + days60 * 1000).toISOString(),
        last_used_at: new Date().toISOString(),
        revoked: false,
      }
      state.devices.push(item)
      await route.fulfill({
        headers: {
          'Set-Cookie': `${cookieName}=${item.secret}; Path=/; Max-Age=${days60}; HttpOnly; Secure; SameSite=Strict`,
        },
        json: { id: item.id, expires_at: item.expires_at },
      })
    } else if (path.endsWith('/device/resume')) {
      state.resumes++
      expect(request.postDataJSON()).toEqual({})
      if (current) network.trustedSessions.set(token, current.expires_at)
      await route.fulfill({
        json: {
          trusted: Boolean(current),
          expires_at: current?.expires_at ?? null,
        },
      })
    } else if (request.method() === 'GET' && path.endsWith('/devices')) {
      await route.fulfill({
        json: {
          items: state.devices
            .filter(
              (item) =>
                item.userId === claims.sub &&
                !item.revoked &&
                Date.parse(item.expires_at) > Date.now(),
            )
            .map((item) => ({
              ...item,
              userId: undefined,
              secret: undefined,
              revoked: undefined,
              current: item === current,
            })),
        },
      })
    } else if (request.method() === 'DELETE') {
      const item = state.devices.find(
        (device) =>
          device.id === path.split('/').at(-1) && device.userId === claims.sub,
      )
      if (item) item.revoked = true
      if (item === current) network.trustedSessions.clear()
      await route.fulfill({ json: { revoked: Boolean(item) } })
    } else throw new Error(`Unexpected device fixture request: ${path}`)
  })
}

async function passwordLogin(page: Page, email = fixtureEmail) {
  await page.goto(`${origin}/admin/login`)
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(fixturePassword)
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click()
}

async function verify(page: Page) {
  await page
    .getByLabel('Código de verificación', { exact: true })
    .fill('123456')
  await page
    .getByRole('button', { name: 'Verificar y continuar', exact: true })
    .click()
  await expect(page).toHaveURL(`${origin}/admin`)
  await expect(page.locator('#admin-content')).toBeVisible()
}

test('recuerda 60 días con cookie protegida; volver a entrar exige contraseña y omite TOTP', async ({
  page,
  context,
  supabaseNetwork,
}) => {
  const state = serverState()
  supabaseNetwork.adminMembership = true
  await securePanel(context, supabaseNetwork, state)
  await passwordLogin(page)
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await expect(
      page.getByLabel('Código de verificación', { exact: true }),
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    await page.locator('.auth-mfa').screenshot({
      path: `artifacts/admin-device-ui/mfa-${viewport.width}.png`,
      animations: 'disabled',
    })
  }
  await verify(page)
  const cookie = (await context.cookies(origin)).find(
    (item) => item.name === cookieName,
  )!
  expect(cookie).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
  })
  expect(cookie.expires - Date.now() / 1000).toBeGreaterThan(days60 - 20)
  expect(cookie.expires - Date.now() / 1000).toBeLessThanOrEqual(days60)
  expect(await page.evaluate(() => document.cookie)).not.toContain(cookieName)
  expect(
    await page.evaluate(() =>
      JSON.stringify({
        local: { ...localStorage },
        session: { ...sessionStorage },
      }),
    ),
  ).not.toContain('server-only-secret')
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible()
  expect(
    supabaseNetwork.requests.find((item) => item.path === '/auth/v1/logout')
      ?.scope,
  ).toBe('local')
  const passwordCount = supabaseNetwork.requests.filter(
    (item) => item.grant === 'password',
  ).length
  await passwordLogin(page)
  await expect(page).toHaveURL(`${origin}/admin`)
  expect(
    supabaseNetwork.requests.filter((item) => item.grant === 'password'),
  ).toHaveLength(passwordCount + 1)
  expect(state.registrations).toBe(1)
  await expect(
    page.getByLabel('Código de verificación', { exact: true }),
  ).toHaveCount(0)
  const session = await page.evaluate(async () => {
    const source = '/src/services/auth-service.ts'
    return (await import(source)).authService.getSnapshot().session
  })
  expect(session).toMatchObject({
    assurance: 'aal1',
    trustedDevice: true,
    mfaRequired: false,
  })
  const resumes = state.resumes
  await page.evaluate(async () => {
    const source = '/src/services/auth-service.ts'
    await (await import(source)).authService.initialize()
  })
  expect(state.resumes).toBe(resumes)
  // A refreshed signed-token identity must check the cookie again even when
  // the managed Auth session_id and account are unchanged.
  const stored = await page.evaluate(async () => {
    const source = '/src/services/supabase-client.ts'
    const { data } = await (
      await import(source)
    )
      .requireSupabaseClient()
      .auth.getSession()
    return {
      token: data.session!.access_token,
      refresh: data.session!.refresh_token,
    }
  })
  const [header, encoded, signature] = stored.token.split('.')
  const claims = JSON.parse(Buffer.from(encoded, 'base64url').toString())
  const rotated = `${header}.${Buffer.from(JSON.stringify({ ...claims, iat: claims.iat + 1, exp: claims.exp + 1 })).toString('base64url')}.${signature}`
  await page.evaluate(
    async ({ access, refresh }) => {
      const source = '/src/services/supabase-client.ts'
      await (
        await import(source)
      )
        .requireSupabaseClient()
        .auth.setSession({ access_token: access, refresh_token: refresh })
      const auth = '/src/services/auth-service.ts'
      await (await import(auth)).authService.initialize()
    },
    { access: rotated, refresh: stored.refresh },
  )
  await expect.poll(() => state.resumes).toBe(resumes + 1)
  await expect(page.locator('#admin-content')).toBeVisible()
})

for (const reason of ['expired', 'revoked', 'other-account'] as const) {
  test(`una cookie ${reason} vuelve a pedir el autenticador existente sin inscribir otro QR`, async ({
    page,
    context,
    supabaseNetwork,
  }) => {
    const state = serverState()
    supabaseNetwork.adminMembership = true
    await securePanel(context, supabaseNetwork, state)
    await passwordLogin(page)
    await verify(page)
    await page
      .getByRole('button', { name: 'Cerrar sesión', exact: true })
      .click()
    if (reason === 'expired')
      state.devices[0].expires_at = new Date(Date.now() - 1000).toISOString()
    if (reason === 'revoked') state.devices[0].revoked = true
    if (reason === 'other-account') supabaseNetwork.currentUserId = customerB
    await passwordLogin(page)
    await expect(
      page.getByLabel('Código de verificación', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', {
        name: 'Activar verificación en dos pasos',
        exact: true,
      }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('img', {
        name: 'Código QR para configurar tu aplicación autenticadora',
      }),
    ).toHaveCount(0)
    expect(state.registrations).toBe(1)
    expect(
      supabaseNetwork.requests.filter(
        (item) => item.path === '/auth/v1/factors' && item.method === 'POST',
      ),
    ).toHaveLength(0)
  })
}

test('un primer QR se inscribe una vez y dos administradores conservan sesiones independientes', async ({
  page,
  context,
  browser,
  supabaseNetwork,
}) => {
  // Both existing sessions in this scenario reach real AAL2. These isolated
  // fixtures do not prove how hosted GoTrue invalidates other AAL1 sessions
  // when the same account completes a new TOTP challenge.
  const state = serverState()
  supabaseNetwork.adminMembership = true
  supabaseNetwork.mfaEnrolled = false
  await securePanel(context, supabaseNetwork, state)
  await passwordLogin(page)
  await page
    .getByRole('button', {
      name: 'Activar verificación en dos pasos',
      exact: true,
    })
    .click()
  await expect(
    page.getByRole('img', {
      name: 'Código QR para configurar tu aplicación autenticadora',
    }),
  ).toBeVisible()
  await verify(page)
  const other = await browser.newContext()
  try {
    const otherNetwork = await installNetwork(other)
    otherNetwork.adminMembership = true
    otherNetwork.currentUserId = customerB
    otherNetwork.currentEmail = 'beatriz@example.invalid'
    await securePanel(other, otherNetwork, state)
    const otherPage = await other.newPage()
    await passwordLogin(otherPage, otherNetwork.currentEmail)
    await expect(
      otherPage.getByLabel('Código de verificación', { exact: true }),
    ).toBeVisible()
    await expect(
      otherPage.getByRole('img', {
        name: 'Código QR para configurar tu aplicación autenticadora',
      }),
    ).toHaveCount(0)
    await verify(otherPage)
    expect(state.registrations).toBe(2)
    const accountIn = (target: Page) =>
      target.evaluate(async () => {
        const source = '/src/services/auth-service.ts'
        return (await import(source)).authService.getSnapshot().session?.user.id
      })
    expect(await accountIn(page)).toBe(customerA)
    expect(await accountIn(otherPage)).toBe(customerB)
    await page.reload()
    await expect(page.locator('.admin-sidebar')).toBeVisible()
    await otherPage
      .getByRole('button', { name: 'Cerrar sesión', exact: true })
      .click()
    await expect(
      otherPage.getByLabel('Contraseña', { exact: true }),
    ).toBeVisible()
    await page.reload()
    await expect(page.locator('.admin-sidebar')).toBeVisible()
    expect(
      supabaseNetwork.requests.filter(
        (item) => item.path === '/auth/v1/factors' && item.method === 'POST',
      ),
    ).toHaveLength(1)
    expect(
      otherNetwork.requests.filter(
        (item) => item.path === '/auth/v1/factors' && item.method === 'POST',
      ),
    ).toHaveLength(0)
  } finally {
    await other.close()
  }
})

test('configuración permite revocar un dispositivo por separado y conserva los otros', async ({
  page,
  context,
  supabaseNetwork,
}) => {
  const state = serverState()
  supabaseNetwork.adminMembership = true
  await securePanel(context, supabaseNetwork, state)
  await passwordLogin(page)
  await verify(page)
  state.devices.push({
    ...state.devices[0],
    id: '00000000-0000-4000-8000-000000000099',
    label: 'Otro navegador',
    secret: 'other-secret',
  })
  state.devices.push({
    ...state.devices[0],
    id: '00000000-0000-4000-8000-000000000098',
    userId: customerB,
    label: 'Cuenta ajena',
    secret: 'foreign-secret',
  })
  await page.goto(`${origin}/admin/configuracion`)
  const panel = page.getByRole('region', { name: 'Dispositivos de confianza' })
  await expect(
    panel.getByText('Este dispositivo', { exact: true }),
  ).toBeVisible()
  await panel
    .getByRole('button', {
      name: 'Revocar confianza de Otro navegador',
      exact: true,
    })
    .click()
  await expect(
    panel.getByRole('button', {
      name: 'Revocar confianza de Otro navegador',
      exact: true,
    }),
  ).toHaveCount(0)
  await expect(
    panel.getByRole('button', {
      name: 'Revocar confianza de Navegador 1',
      exact: true,
    }),
  ).toBeVisible()
  expect(state.devices[0].revoked).toBe(false)
  expect(state.devices[1].revoked).toBe(true)
  await expect(panel.getByText('Cuenta ajena', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Cerrar aviso', exact: true }).click()
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    const control = panel.getByRole('button', {
      name: 'Revocar confianza de Navegador 1',
      exact: true,
    })
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await panel.screenshot({
      path: `artifacts/admin-device-ui/devices-${viewport.width}.png`,
      animations: 'disabled',
    })
  }
})

test('una sesión de confianza AAL1 queda limitada por su fecha y un rechazo de Auth retira el acceso', async ({
  page,
  context,
  supabaseNetwork,
}) => {
  const state = serverState()
  supabaseNetwork.adminMembership = true
  await securePanel(context, supabaseNetwork, state)
  await passwordLogin(page)
  await verify(page)
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  const expiry = new Date(Date.now() + 60000).toISOString()
  state.devices[0].expires_at = expiry
  await passwordLogin(page)
  await expect(page).toHaveURL(`${origin}/admin`)
  const expiresAt = await page.evaluate(async () => {
    const source = '/src/services/auth-service.ts'
    return (await import(source)).authService.getSnapshot().session?.expiresAt
  })
  expect(expiresAt).toBe(Date.parse(expiry))
  // Managed Auth can revoke a session independently, including when another
  // device upgrades the same account from AAL1 to AAL2. Cookie trust cannot
  // restore that invalidated Auth identity.
  const resumes = state.resumes
  await page.route(
    'https://abcdefghijklmnopqrst.supabase.co/auth/v1/user',
    (route) =>
      route.fulfill({
        status: 401,
        json: {
          code: 'session_not_found',
          message: 'Fixture server revoked session',
        },
        headers: { 'access-control-allow-origin': '*' },
      }),
  )
  await page.reload()
  await expect(page.getByLabel('Contraseña', { exact: true })).toBeVisible()
  await expect(page.locator('.admin-sidebar')).toHaveCount(0)
  expect(state.resumes).toBe(resumes)
})

test('un endpoint anterior o no disponible conserva el acceso AAL2 y avisa que el dispositivo no se recordó', async ({
  page,
  context,
  supabaseNetwork,
}) => {
  const state = serverState()
  state.unavailable = true
  supabaseNetwork.adminMembership = true
  await securePanel(context, supabaseNetwork, state)
  await passwordLogin(page)
  await verify(page)
  await expect(page.locator('.admin-toast')).toContainText(
    'No pudimos recordar este dispositivo',
  )
  expect(await context.cookies(origin)).toEqual([])
})

test('el panel local HTTP conserva TOTP y no intenta emitir cookies de confianza', async ({
  page,
  supabaseNetwork,
}) => {
  supabaseNetwork.adminMembership = true
  let deviceRequests = 0
  await page.route('**/api/admin/auth/**', async (route) => {
    deviceRequests++
    await route.abort()
  })
  await signIn(page, 'admin')
  await page
    .getByLabel('Código de verificación', { exact: true })
    .fill('123456')
  await page
    .getByRole('button', { name: 'Verificar y continuar', exact: true })
    .click()
  await expect(page).toHaveURL('/admin')
  expect(deviceRequests).toBe(0)
})
