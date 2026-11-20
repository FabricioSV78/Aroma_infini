import {
  test,
  expect,
  signIn,
  customerA,
  customerB,
  fixtureStorageKey,
  fixtureAdminStorageKey,
  fixtureLegacyStorageKey,
  fixtureProject,
  fixturePassword,
} from './supabase-auth-fixture'

async function sessions(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const source = '/src/services/auth-service.ts'
    const { authService, adminAuthService } = await import(source)
    return {
      customer: authService.getSnapshot(),
      admin: adminAuthService.getSnapshot(),
    }
  })
}
test('visitante anónimo y sesión caducada nunca representan el dashboard', async ({
  page,
  supabaseNetwork,
}) => {
  await page.goto('/cuenta')
  await expect(page).toHaveURL(/iniciar-sesion/)
  await expect(page.locator('.account-overview-grid')).toHaveCount(0)
  await supabaseNetwork.seedSession(page, { expired: true })
  await page.goto('/cuenta')
  await expect(page).toHaveURL(/iniciar-sesion/)
  await expect(page.locator('.account-overview-grid')).toHaveCount(0)
})
test('admin con MFA no se convierte en cliente y ambas identidades permanecen separadas en el mismo navegador', async ({
  page,
  supabaseNetwork,
  context,
}) => {
  supabaseNetwork.adminMembership = true
  await signIn(page, 'admin')
  await page
    .getByLabel('Código de verificación', { exact: true })
    .fill('123456')
  await page
    .getByRole('button', { name: 'Verificar y continuar', exact: true })
    .click()
  await expect(page).toHaveURL('/admin')
  const before = await sessions(page)
  expect(before.admin.session.user.id).toBe(customerA)
  await page.goto('/cuenta')
  await expect(page).toHaveURL(/iniciar-sesion/)
  await expect(page.locator('.account-overview-grid')).toHaveCount(0)
  supabaseNetwork.currentUserId = customerB
  supabaseNetwork.currentEmail = 'beatriz@example.invalid'
  supabaseNetwork.adminMembership = false
  await page
    .getByLabel('Correo electrónico', { exact: true })
    .fill('beatriz@example.invalid')
  await page.getByLabel('Contraseña', { exact: true }).fill(fixturePassword)
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Hola, Beatriz', exact: true }),
  ).toBeVisible()
  const adminTab = await context.newPage()
  await adminTab.goto('/admin')
  await expect(adminTab.locator('.admin-sidebar')).toBeVisible()
  expect((await sessions(adminTab)).admin.session.user.id).toBe(customerA)
  await page.goto('/cuenta/datos')
  await expect(
    page.getByLabel('Correo electrónico', { exact: true }),
  ).toHaveValue('beatriz@example.invalid')
  await page
    .getByRole('button', { name: 'Salir de mi cuenta', exact: true })
    .click()
  await expect(page).toHaveURL(/iniciar-sesion/)
  await adminTab.reload()
  await expect(adminTab.locator('.admin-sidebar')).toBeVisible()
  expect(
    await adminTab.evaluate(
      (key) => Boolean(localStorage.getItem(key)),
      fixtureAdminStorageKey,
    ),
  ).toBe(true)
  expect(
    await page.evaluate((key) => localStorage.getItem(key), fixtureStorageKey),
  ).toBeNull()
})
test('restauración, nueva pestaña y cambio de cliente conservan exclusivamente el propietario verificado', async ({
  page,
  supabaseNetwork,
  context,
}) => {
  await signIn(page)
  await expect(
    page.getByRole('heading', { name: 'Hola, Ana', exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Hola, Ana', exact: true }),
  ).toBeVisible()
  const other = await context.newPage()
  await other.goto('/cuenta')
  await expect(
    other.getByRole('heading', { name: 'Hola, Ana', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Salir de mi cuenta', exact: true })
    .click()
  await expect(other).toHaveURL(/iniciar-sesion/)
  supabaseNetwork.currentUserId = customerB
  supabaseNetwork.currentEmail = 'beatriz@example.invalid'
  await signIn(page)
  await expect(
    page.getByRole('heading', { name: 'Hola, Beatriz', exact: true }),
  ).toBeVisible()
  await other.goto('/cuenta')
  await expect(
    other.getByRole('heading', { name: 'Hola, Beatriz', exact: true }),
  ).toBeVisible()
  await expect(other.locator('main')).not.toContainText('Hola, Ana')
})
test('una pestaña que cerró sesión adopta un nuevo login válido de otra pestaña', async ({
  page,
  context,
  supabaseNetwork,
}) => {
  void supabaseNetwork
  await signIn(page)
  await expect(page).toHaveURL('/cuenta')
  const other = await context.newPage()
  await other.goto('/contacto')
  await page
    .getByRole('button', { name: 'Salir de mi cuenta', exact: true })
    .click()
  await expect(page).toHaveURL(/iniciar-sesion/)
  await signIn(other)
  await expect(other).toHaveURL('/cuenta')
  await expect(page).toHaveURL('/cuenta')
  expect((await sessions(page)).customer.session.user.id).toBe(customerA)
})
test('red lenta y errores de perfil no representan contadores vacíos exitosos', async ({
  page,
  supabaseNetwork,
}) => {
  void supabaseNetwork
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(
    `https://${fixtureProject}.supabase.co/rest/v1/rpc/get_profile`,
    async (route) => {
      await gate
      await route.fulfill({
        status: 503,
        headers: { 'access-control-allow-origin': '*' },
        json: { code: '08006', message: 'Isolated unavailable' },
      })
    },
  )
  await signIn(page)
  await expect(page.locator('main')).toContainText('Cargando tu cuenta')
  await expect(page.locator('.account-overview-grid')).toHaveCount(0)
  release()
  await expect(
    page.getByRole('heading', { name: 'No pudimos cargar tu cuenta' }),
  ).toBeVisible()
  await expect(page.locator('.account-overview-grid')).toHaveCount(0)
  await page.unroute(
    `https://${fixtureProject}.supabase.co/rest/v1/rpc/get_profile`,
  )
  await page
    .getByRole('button', { name: 'Volver a intentar', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Hola, Ana', exact: true }),
  ).toBeVisible()
})
test('perfil ausente conserva una identidad válida y puede completarse sin datos ajenos', async ({
  page,
  supabaseNetwork,
}) => {
  const newId = '00000000-0000-4000-8000-0000000000c3'
  supabaseNetwork.currentUserId = newId
  supabaseNetwork.currentEmail = 'nueva@example.invalid'
  await signIn(page)
  await expect(
    page.getByRole('heading', { name: 'Mi cuenta', exact: true }),
  ).toBeVisible()
  expect((await sessions(page)).customer.session.user.id).toBe(newId)
  await page.goto('/cuenta/datos')
  await expect(
    page.getByLabel('Correo electrónico', { exact: true }),
  ).toHaveValue('nueva@example.invalid')
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('')
  await page.getByLabel('Nombre', { exact: true }).fill('Nueva')
  await page.getByLabel('Apellido', { exact: true }).fill('Cliente')
  await page.getByLabel('Celular', { exact: true }).fill('999999999')
  await page
    .getByRole('button', { name: 'Guardar cambios', exact: true })
    .click()
  await expect(page.getByRole('status')).toContainText('Cambios guardados')
})
test('la antigua sesión administrativa se clasifica remotamente sin copiarla al almacén de clientes ni eliminarla', async ({
  page,
  supabaseNetwork,
}) => {
  supabaseNetwork.adminMembership = true
  await supabaseNetwork.seedSession(page, { audience: 'legacy' })
  await page.goto('/cuenta')
  await expect(page).toHaveURL(/iniciar-sesion/)
  expect(
    await page.evaluate((key) => localStorage.getItem(key), fixtureStorageKey),
  ).toBeNull()
  expect(
    await page.evaluate(
      (key) => Boolean(localStorage.getItem(key)),
      fixtureAdminStorageKey,
    ),
  ).toBe(true)
  expect(
    await page.evaluate(
      (key) => Boolean(localStorage.getItem(key)),
      fixtureLegacyStorageKey,
    ),
  ).toBe(true)
  await page.goto('/admin')
  await expect(
    page.getByRole('heading', { name: 'Verificación en dos pasos' }),
  ).toBeVisible()
})
test('un evento TOKEN_REFRESHED no cambia propietario ni mezcla las claves de audiencia', async ({
  page,
  supabaseNetwork,
}) => {
  supabaseNetwork.refreshAllowed = true
  await signIn(page)
  await expect(page).toHaveURL('/cuenta')
  await page.evaluate(async () => {
    const path = '/src/services/supabase-client.ts'
    const { requireSupabaseClient } = await import(path)
    const sdk = requireSupabaseClient(),
      session = (await sdk.auth.getSession()).data.session
    const result = await sdk.auth.refreshSession({
      refresh_token: session.refresh_token,
    })
    if (result.error) throw result.error
    const auth = '/src/services/auth-service.ts'
    await (await import(auth)).authService.refresh()
  })
  await expect(
    page.getByRole('heading', { name: 'Hola, Ana', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      (key) => localStorage.getItem(key),
      fixtureAdminStorageKey,
    ),
  ).toBeNull()
})
