import type { Page } from '@playwright/test'
import {
  customerA,
  expect,
  fixtureEmail,
  fixturePassword,
  fixtureStorageKey,
  signIn,
  test,
} from './supabase-auth-fixture'

// Run on the isolated Vite server whose public environment points at
// abcdefghijklmnopqrst.supabase.co. Every Auth/RPC request is intercepted.
// These tests prove SDK/UI contracts, not SMTP, signed JWTs or hosted RLS.
async function registration(page: Page) {
  await page.goto('/crear-cuenta')
  await page.getByLabel('Nombres', { exact: true }).fill('Ana')
  await page.getByLabel('Apellidos', { exact: true }).fill('Torres')
  await page
    .getByLabel('Correo electrónico', { exact: true })
    .fill(fixtureEmail)
  await page.getByLabel('Celular', { exact: true }).fill('912345678')
  await page.getByLabel('Contraseña', { exact: true }).fill(fixturePassword)
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
}

async function authState(page: Page) {
  return page.evaluate(async () => {
    const modulePath = '/src/services/auth-service.ts'
    const { authService } = await import(modulePath)
    const state = authService.getSnapshot()
    return {
      status: state.status as string,
      userId: state.session?.user.id as string | undefined,
      role: state.session?.user.role as string | undefined,
      intent: state.session?.intent as string | undefined,
      mfaRequired: state.session?.mfaRequired as boolean | undefined,
    }
  })
}

test('SDK real inicia sesión, restaura la cuenta y guarda solo el perfil propio', async ({
  page,
  supabaseNetwork,
}) => {
  await signIn(page)
  await expect(page).toHaveURL('/cuenta')
  await expect(
    page.getByRole('heading', { name: 'Hola, Ana', exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Hola, Ana', exact: true }),
  ).toBeVisible()
  await page.goto('/cuenta/datos')
  await page.getByLabel('Nombre', { exact: true }).fill('Ana María')
  await page
    .getByRole('button', { name: 'Guardar cambios', exact: true })
    .click()
  await expect(page.getByRole('status')).toContainText('Cambios guardados.')
  await page.reload()
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(
    'Ana María',
  )
  await expect(
    page.getByLabel('Correo electrónico', { exact: true }),
  ).toHaveValue(fixtureEmail)
  const command = supabaseNetwork.requests.find((request) =>
    request.path.endsWith('/update_profile'),
  )
  expect(command?.body).toMatchObject({
    p_first_name: 'Ana María',
    p_last_name: 'Torres',
    p_phone: '912345678',
  })
  expect(command?.body).not.toHaveProperty('user_id')
  expect(command?.body).not.toHaveProperty('p_user_id')
  expect(command?.body).not.toHaveProperty('email')
  expect(
    supabaseNetwork.requests.some(
      (request) => request.path === '/auth/v1/user',
    ),
  ).toBe(true)
  expect(
    supabaseNetwork.requests.some((request) =>
      request.path.endsWith('/current_actor'),
    ),
  ).toBe(true)
})

test('credenciales incorrectas conservan los campos y nunca conceden una sesión', async ({
  page,
  supabaseNetwork,
}) => {
  supabaseNetwork.invalidPassword = true
  await signIn(page)
  await expect(page.getByRole('dialog')).toContainText(
    'Revisa tu correo y contraseña.',
  )
  await expect(
    page.getByLabel('Correo electrónico', { exact: true }),
  ).toHaveValue(fixtureEmail)
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue(
    fixturePassword,
  )
  expect((await authState(page)).userId).toBeUndefined()
  expect(
    supabaseNetwork.requests.filter((request) => request.grant === 'password'),
  ).toHaveLength(1)
})

test('registro envía el perfil correcto e inicia sesión sin enviar un enlace de confirmación', async ({
  page,
  supabaseNetwork,
}) => {
  await registration(page)
  await expect(page).toHaveURL('/cuenta')
  await expect(
    page.getByRole('heading', { name: 'Hola, Ana', exact: true }),
  ).toBeVisible()
  const signup = supabaseNetwork.requests.find(
    (request) => request.path === '/auth/v1/signup',
  )
  expect(signup?.body.data).toMatchObject({
    firstName: 'Ana',
    lastName: 'Torres',
    phone: '912345678',
  })
  expect(signup?.body.data).not.toHaveProperty('role')
  expect(signup?.redirectTo).toBeNull()
  expect((await authState(page)).userId).toBe(customerA)
  expect((await authState(page)).role).toBe('customer')
  expect(
    supabaseNetwork.requests.filter((request) => request.grant === 'pkce'),
  ).toHaveLength(0)
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Hola, Ana', exact: true }),
  ).toBeVisible()
})

test('una metadata role=admin no concede acceso administrativo', async ({
  page,
  supabaseNetwork,
}) => {
  supabaseNetwork.maliciousMetadata = true
  await signIn(page, 'admin')
  await expect(page.getByRole('dialog')).toContainText(
    /no tiene acceso (?:al panel )?administrativo/,
  )
  await expect(page.locator('.admin-sidebar')).toHaveCount(0)
  const state = await authState(page)
  expect(state.userId).toBe(customerA)
  expect(state.role).toBe('customer')
  await page.goto('/admin/productos')
  await expect(page).toHaveURL(/\/admin\/login/)
  await expect(page.locator('.admin-sidebar')).toHaveCount(0)
})

test('la identidad RPC que no coincide con Auth bloquea el acceso', async ({
  page,
  supabaseNetwork,
}) => {
  supabaseNetwork.actorOwnerMismatch = true
  await signIn(page)
  await expect(page.getByRole('dialog')).toBeVisible()
  expect((await authState(page)).userId).toBeUndefined()
  await expect(page.locator('.account-sidebar')).toHaveCount(0)
  await expect(page.locator('.admin-sidebar')).toHaveCount(0)
})

test('una respuesta de perfil ajena no muestra los datos de otro cliente', async ({
  page,
  supabaseNetwork,
}) => {
  supabaseNetwork.profileOwnerMismatch = true
  await signIn(page)
  await expect(
    page.getByRole('heading', { name: 'No pudimos cargar tu cuenta' }),
  ).toBeVisible()
  await expect(page.getByText('Beatriz', { exact: false })).toHaveCount(0)
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveCount(0)
})

test('un registro sin sesión del servidor conserva los datos y no concede acceso', async ({
  page,
  supabaseNetwork,
}) => {
  supabaseNetwork.signupSessionMissing = true
  await registration(page)
  await expect(page.getByRole('dialog')).toContainText(
    'No pudimos verificar tus datos.',
  )
  await expect(
    page.getByLabel('Correo electrónico', { exact: true }),
  ).toHaveValue(fixtureEmail)
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue(
    fixturePassword,
  )
  expect((await authState(page)).userId).toBeUndefined()
  await page.goto('/cuenta')
  await expect(page).toHaveURL(/\/iniciar-sesion/)
})

test('una sesión verificada no depende de la marca de confirmación del correo', async ({
  page,
  supabaseNetwork,
}) => {
  supabaseNetwork.confirmed = false
  await supabaseNetwork.seedSession(page)
  await page.goto('/cuenta')
  await expect(
    page.getByRole('heading', { name: 'Hola, Ana', exact: true }),
  ).toBeVisible()
  expect((await authState(page)).userId).toBe(customerA)
})

test('recuperación usa un código guardado sin pedir envíos de correo', async ({
  page,
  supabaseNetwork,
}) => {
  await page.goto('/recuperar-contrasena')
  await expect(
    page.getByLabel('Correo electrónico', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByLabel('Código de recuperación', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Enviar enlace', exact: true }),
  ).toHaveCount(0)
  expect(
    supabaseNetwork.requests.some(
      (request) => request.path === '/auth/v1/recover',
    ),
  ).toBe(false)
  expect((await authState(page)).userId).toBeUndefined()
})

test('logout revoca la sesión local incluso si el servidor no responde correctamente', async ({
  page,
  supabaseNetwork,
}) => {
  await signIn(page)
  await expect(
    page.getByRole('heading', { name: 'Hola, Ana', exact: true }),
  ).toBeVisible()
  supabaseNetwork.signOutUnavailable = true
  await page
    .getByRole('button', { name: 'Salir de mi cuenta', exact: true })
    .click()
  await expect(page).toHaveURL(/\/iniciar-sesion/)
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), fixtureStorageKey),
    )
    .toBeNull()
  await page.reload()
  await expect(page.locator('.account-sidebar')).toHaveCount(0)
  expect((await authState(page)).userId).toBeUndefined()
})

test('refresh token vencido limpia el acceso sin recuperar perfiles locales', async ({
  page,
  supabaseNetwork,
}) => {
  await supabaseNetwork.seedSession(page, { expired: true })
  await page.goto('/cuenta')
  await expect(page).toHaveURL(/\/iniciar-sesion/)
  await expect(page.locator('.account-sidebar')).toHaveCount(0)
  expect((await authState(page)).userId).toBeUndefined()
  expect(
    supabaseNetwork.requests.some(
      (request) => request.grant === 'refresh_token',
    ),
  ).toBe(true)
})

test('admin AAL1 necesita TOTP y solo entra al panel tras verificar AAL2', async ({
  page,
  supabaseNetwork,
}) => {
  supabaseNetwork.adminMembership = true
  await signIn(page, 'admin')
  await expect(
    page.getByRole('heading', { name: 'Verificación en dos pasos' }),
  ).toBeVisible()
  await expect(page.locator('.admin-sidebar')).toHaveCount(0)
  const code = page.getByLabel('Código de verificación', { exact: true })
  await code.fill('000000')
  await page
    .getByRole('button', { name: 'Verificar y continuar', exact: true })
    .click()
  await expect(code).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('#auth-mfa-error')).toContainText(
    'El código no es válido',
  )
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.admin-sidebar')).toHaveCount(0)
  await code.fill('123456')
  await page
    .getByRole('button', { name: 'Verificar y continuar', exact: true })
    .click()
  await expect(page).toHaveURL('/admin')
  await expect(page.locator('.admin-sidebar')).toBeVisible()
  expect((await authState(page)).mfaRequired).toBe(false)
  expect(
    supabaseNetwork.requests.some((request) =>
      request.path.endsWith('/factor-test/verify'),
    ),
  ).toBe(true)
})

test('primer acceso administrativo prepara TOTP sin guardar su secreto en el navegador', async ({
  page,
  supabaseNetwork,
}) => {
  supabaseNetwork.adminMembership = true
  supabaseNetwork.mfaEnrolled = false
  await signIn(page, 'admin')
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
  const persisted = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }),
  )
  expect(persisted).not.toContain('JBSWY3DPEHPK3PXP')
  const enrollment = supabaseNetwork.requests.find(
    (request) =>
      request.path === '/auth/v1/factors' && request.method === 'POST',
  )
  expect(enrollment?.body).toMatchObject({
    friendly_name: 'Aroma Infini',
    factor_type: 'totp',
    issuer: 'Aroma Infini',
  })
  await page
    .getByLabel('Código de verificación', { exact: true })
    .fill('123456')
  await page
    .getByRole('button', { name: 'Verificar y continuar', exact: true })
    .click()
  await expect(page).toHaveURL('/admin')
  await expect(page.locator('.admin-sidebar')).toBeVisible()
  await expect(page.getByText('JBSWY3DPEHPK3PXP')).toHaveCount(0)
})

test('los enlaces de correo antiguos no intercambian tokens ni conceden una sesión', async ({
  page,
  supabaseNetwork,
}) => {
  await page.goto(
    '/auth/callback?code=old-code&sb_flow_id=old-flow#access_token=old-token',
  )
  await expect(
    page.getByRole('heading', { name: 'Este enlace ya no está disponible' }),
  ).toBeVisible()
  await expect(page).toHaveURL('/auth/callback')
  expect(
    supabaseNetwork.requests.filter((request) => request.grant === 'pkce'),
  ).toHaveLength(0)
  expect((await authState(page)).userId).toBeUndefined()
  await page.getByRole('link', { name: 'Recuperar acceso' }).click()
  await expect(page).toHaveURL(/\/recuperar-contrasena/)
})

for (const viewport of [
  { name: 'monitor', width: 1920, height: 1080 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`MFA real del SDK mantiene legibilidad y teclado en ${viewport.name}`, async ({
    page,
    supabaseNetwork,
  }) => {
    await page.setViewportSize(viewport)
    supabaseNetwork.adminMembership = true
    await signIn(page, 'admin')
    const code = page.getByLabel('Código de verificación', { exact: true })
    await expect(code).toBeVisible()
    await code.focus()
    await page.keyboard.type('123456')
    await page.keyboard.press('Tab')
    await expect(
      page.getByRole('button', { name: 'Verificar y continuar', exact: true }),
    ).toBeFocused()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    const box = await code.boundingBox()
    expect(box!.width).toBeGreaterThan(240)
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
    await page.screenshot({
      path: `artifacts/supabase-phase-3-2026-10-28/screens/mfa-${viewport.name}.png`,
      fullPage: true,
    })
  })
}
