import { mkdir } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import type { BrowserContext, Page, Route } from '@playwright/test'
import {
  customerA,
  customerB,
  expect,
  fixtureEmail,
  fixturePassword,
  fixtureProject,
  fixtureStorageKey,
  signIn,
  test,
  type SupabaseAuthNetwork,
} from './supabase-auth-fixture'

// Real SDK and application service, with isolated HTTP only. These requests
// never reach hosted Auth, send email, or update a real customer's credentials.
const endpoint = `https://${fixtureProject}.supabase.co/functions/v1/change-email`
const newEmail = 'ana.nueva@example.invalid'
const captures = 'artifacts/account-email-change-2026-10-28/screenshots'
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST,OPTIONS',
}

interface EmailCommand {
  email: string
  currentPassword: string
}

function gate() {
  let resolve!: () => void
  const wait = new Promise<void>((done) => {
    resolve = done
  })
  return { wait, resolve }
}

async function installEndpoint(
  context: BrowserContext,
  handler: (command: EmailCommand, route: Route) => Promise<void>,
) {
  const calls: EmailCommand[] = []
  await context.route(endpoint, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors })
      return
    }
    expect(route.request().method()).toBe('POST')
    const command = route.request().postDataJSON() as EmailCommand
    expect(Object.keys(command).sort()).toEqual(['currentPassword', 'email'])
    const token = route
      .request()
      .headers()
      .authorization?.replace(/^Bearer /, '')
    expect(token).toMatch(/^ey/)
    const claims = JSON.parse(
      Buffer.from(token!.split('.')[1], 'base64url').toString(),
    ) as { sub: string }
    expect(claims.sub).toBe(customerA)
    calls.push(command)
    await handler(command, route)
  })
  return calls
}

async function openDialog(page: Page) {
  await signIn(page)
  await expect(page).toHaveURL('/cuenta')
  await page.goto('/cuenta/datos')
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Ana')
  await page
    .getByRole('button', { name: 'Cambiar correo', exact: true })
    .click()
  await expect(
    page.getByRole('dialog', { name: 'Cambiar correo' }),
  ).toBeVisible()
}

async function fillDialog(page: Page, password = fixturePassword) {
  await page.getByLabel('Nuevo correo', { exact: true }).fill(newEmail)
  await page.getByLabel('Contraseña actual', { exact: true }).fill(password)
}

function expectNoEmailSideEffects(network: SupabaseAuthNetwork) {
  expect(
    network.requests.filter(
      (request) => request.path === '/auth/v1/user' && request.method === 'PUT',
    ),
  ).toHaveLength(0)
  expect(
    network.requests.filter((request) => request.path === '/auth/v1/recover'),
  ).toHaveLength(0)
  for (const request of network.requests.filter((request) =>
    request.path.startsWith('/rest/v1/rpc/'),
  )) {
    expect(request.body).not.toHaveProperty('email')
    expect(request.body).not.toHaveProperty('currentPassword')
  }
}

async function authSnapshot(page: Page) {
  return page.evaluate(async () => {
    const source = '/src/services/auth-service.ts'
    const { authService } = await import(source)
    const state = authService.getSnapshot()
    return {
      status: state.status,
      userId: state.session?.user.id,
      email: state.session?.user.email,
    }
  })
}

test.use({ reducedMotion: 'reduce' })

test('el modal valida campos y al cancelar elimina el borrador de contraseña', async ({
  page,
  context,
  supabaseNetwork,
}) => {
  const calls = await installEndpoint(context, async (command, route) => {
    await route.fulfill({
      headers: cors,
      json: { success: true, email: command.email },
    })
  })
  await openDialog(page)
  const save = page.getByRole('button', { name: 'Guardar correo', exact: true })
  await save.click()
  await expect(page.getByLabel('Nuevo correo', { exact: true })).toBeFocused()
  await expect(
    page.getByText('Escribe un correo electrónico válido.', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Escribe tu contraseña actual.', { exact: true }),
  ).toBeVisible()
  await page.getByLabel('Nuevo correo', { exact: true }).fill(fixtureEmail)
  await page
    .getByLabel('Contraseña actual', { exact: true })
    .fill(fixturePassword)
  await save.click()
  await expect(
    page.getByText('Escribe un correo diferente al actual.'),
  ).toBeVisible()
  expect(calls).toHaveLength(0)
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  const trigger = page.getByRole('button', {
    name: 'Cambiar correo',
    exact: true,
  })
  await expect(trigger).toBeFocused()
  await trigger.click()
  await expect(page.getByLabel('Nuevo correo', { exact: true })).toHaveValue('')
  await expect(
    page.getByLabel('Contraseña actual', { exact: true }),
  ).toHaveValue('')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expectNoEmailSideEffects(supabaseNetwork)
})

test('contraseña incorrecta muestra un error debajo del campo y conserva los datos', async ({
  page,
  context,
  supabaseNetwork,
}) => {
  const wrongPassword = 'Clave incorrecta de prueba 73!'
  const calls = await installEndpoint(context, async (_command, route) => {
    await route.fulfill({
      status: 400,
      headers: cors,
      json: {
        code: 'invalid_current_password',
        message: 'private-provider-detail',
      },
    })
  })
  await openDialog(page)
  await fillDialog(page, wrongPassword)
  await page
    .getByRole('button', { name: 'Guardar correo', exact: true })
    .click()
  const password = page.getByLabel('Contraseña actual', { exact: true })
  await expect(password).toHaveAttribute('aria-invalid', 'true')
  await expect(password).toHaveAttribute(
    'aria-describedby',
    'account-email-password-error',
  )
  await expect(password).toBeFocused()
  await expect(password).toHaveValue(wrongPassword)
  await expect(page.getByLabel('Nuevo correo', { exact: true })).toHaveValue(
    newEmail,
  )
  await expect(
    page.getByText('La contraseña actual no es correcta.'),
  ).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(page.getByRole('dialog')).not.toContainText(
    'private-provider-detail',
  )
  expect(calls).toEqual([{ email: newEmail, currentPassword: wrongPassword }])
  const stored = await page.evaluate(() =>
    JSON.stringify({ local: localStorage, session: sessionStorage }),
  )
  expect(stored).not.toContain(wrongPassword)
  expectNoEmailSideEffects(supabaseNetwork)
})

test('el cambio confirmado por Auth actualiza el perfil y el siguiente acceso utiliza el nuevo correo', async ({
  page,
  context,
  supabaseNetwork,
}) => {
  const calls = await installEndpoint(context, async (command, route) => {
    supabaseNetwork.currentEmail = command.email
    await route.fulfill({
      headers: cors,
      json: { success: true, email: command.email },
    })
  })
  await openDialog(page)
  await fillDialog(page)
  await page
    .getByRole('button', { name: 'Guardar correo', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const email = page.getByLabel('Correo electrónico', { exact: true })
  await expect(email).toHaveValue(newEmail)
  await expect(email).toHaveAttribute('readonly', '')
  expect((await authSnapshot(page)).email).toBe(newEmail)
  await page.reload()
  await expect(email).toHaveValue(newEmail)
  await page
    .getByRole('button', { name: 'Salir de mi cuenta', exact: true })
    .click()
  await expect(page).toHaveURL(/\/iniciar-sesion/)
  await email.fill(newEmail)
  await page.getByLabel('Contraseña', { exact: true }).fill(fixturePassword)
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click()
  await expect(page).toHaveURL('/cuenta/datos')
  const signins = supabaseNetwork.requests.filter(
    (request) => request.grant === 'password',
  )
  expect(signins.at(-1)?.body.email).toBe(newEmail)
  expect(calls).toHaveLength(1)
  expectNoEmailSideEffects(supabaseNetwork)
})

for (const scenario of [
  {
    code: 'email_unavailable',
    status: 409,
    message: 'Este correo no está disponible. Usa otro.',
    field: true,
  },
  {
    code: 'rate_limit',
    status: 429,
    message:
      'Has realizado varios intentos. Espera unos minutos antes de continuar.',
    field: false,
  },
  {
    code: 'service_unavailable',
    status: 503,
    message:
      'No pudimos cambiar tu correo. Revisa tu conexión e inténtalo de nuevo.',
    field: false,
  },
]) {
  test(`${scenario.code}: el error es claro, no expone el proveedor ni pierde el formulario`, async ({
    page,
    context,
    supabaseNetwork,
  }) => {
    const calls = await installEndpoint(context, async (_command, route) => {
      await route.fulfill({
        status: scenario.status,
        headers: cors,
        json: { code: scenario.code, message: 'sensitive-provider-response' },
      })
    })
    await openDialog(page)
    await fillDialog(page)
    await page
      .getByRole('button', { name: 'Guardar correo', exact: true })
      .click()
    await expect(
      page.getByText(scenario.message, { exact: true }),
    ).toBeVisible()
    await expect(page.getByLabel('Nuevo correo', { exact: true })).toHaveValue(
      newEmail,
    )
    await expect(
      page.getByLabel('Contraseña actual', { exact: true }),
    ).toHaveValue(fixturePassword)
    await expect(page.getByRole('dialog')).not.toContainText(
      'sensitive-provider-response',
    )
    if (scenario.field)
      await expect(
        page.getByLabel('Nuevo correo', { exact: true }),
      ).toHaveAttribute('aria-invalid', 'true')
    else await expect(page.getByRole('alert')).toContainText(scenario.message)
    await expect(
      page.getByRole('button', { name: 'Guardar correo', exact: true }),
    ).toBeEnabled()
    expect(calls).toHaveLength(1)
    expectNoEmailSideEffects(supabaseNetwork)
  })
}

test('doble clic registra una sola solicitud y mantiene los controles bloqueados durante el guardado', async ({
  page,
  context,
  supabaseNetwork,
}) => {
  const arrived = gate()
  const release = gate()
  const calls = await installEndpoint(context, async (command, route) => {
    arrived.resolve()
    await release.wait
    supabaseNetwork.currentEmail = command.email
    await route.fulfill({
      headers: cors,
      json: { success: true, email: command.email },
    })
  })
  await openDialog(page)
  await fillDialog(page)
  await page
    .getByRole('button', { name: 'Guardar correo', exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click()
      button.click()
    })
  await arrived.wait
  await expect(
    page.getByRole('button', { name: 'Guardando…', exact: true }),
  ).toBeDisabled()
  await expect(page.getByLabel('Nuevo correo', { exact: true })).toBeDisabled()
  await expect(
    page.getByLabel('Contraseña actual', { exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Cancelar', exact: true }),
  ).toBeDisabled()
  expect(calls).toHaveLength(1)
  release.resolve()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(
    page.getByLabel('Correo electrónico', { exact: true }),
  ).toHaveValue(newEmail)
})

test('un borrador del perfil exige guardarse antes de abrir el cambio de correo', async ({
  page,
  supabaseNetwork,
}) => {
  await signIn(page)
  await expect(page).toHaveURL('/cuenta')
  await page.goto('/cuenta/datos')
  await page.getByLabel('Nombre', { exact: true }).fill('Ana María')
  const trigger = page.getByRole('button', {
    name: 'Cambiar correo',
    exact: true,
  })
  await expect(trigger).toBeDisabled()
  await expect(
    page.getByText('Guarda tus cambios antes de cambiar el correo.'),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Guardar cambios', exact: true })
    .click()
  await expect(page.getByRole('status')).toContainText('Cambios guardados.')
  await expect(trigger).toBeEnabled()
  await trigger.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expectNoEmailSideEffects(supabaseNetwork)
})

for (const action of ['logout', 'other-account'] as const) {
  test(`una respuesta tardía después de ${action} no restaura ni modifica la nueva sesión`, async ({
    page,
    context,
    supabaseNetwork,
  }) => {
    const arrived = gate()
    const release = gate()
    const calls = await installEndpoint(context, async (command, route) => {
      arrived.resolve()
      await release.wait
      await route
        .fulfill({
          headers: cors,
          json: { success: true, email: command.email },
        })
        .catch(() => undefined)
    })
    await openDialog(page)
    await fillDialog(page)
    await page
      .getByRole('button', { name: 'Guardar correo', exact: true })
      .click()
    await arrived.wait
    if (action === 'logout') {
      await page.evaluate(async () => {
        const source = '/src/services/auth-service.ts'
        const { authService } = await import(source)
        await authService.signOut()
      })
      await expect(page).toHaveURL(/\/iniciar-sesion/)
    } else {
      supabaseNetwork.currentUserId = customerB
      await page.evaluate(async (password) => {
        const source = '/src/services/auth-service.ts'
        const { authService } = await import(source)
        await authService.signIn({ email: 'beatriz@example.invalid', password })
      }, fixturePassword)
      await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(
        'Beatriz',
      )
    }
    release.resolve()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    if (action === 'logout') {
      expect((await authSnapshot(page)).userId).toBeUndefined()
      expect(
        await page.evaluate(
          (key) => localStorage.getItem(key),
          fixtureStorageKey,
        ),
      ).toBeNull()
    } else {
      const auth = await authSnapshot(page)
      expect(auth.userId).toBe(customerB)
      expect(auth.email).toBe(fixtureEmail)
      await expect(
        page.getByLabel('Correo electrónico', { exact: true }),
      ).toHaveValue(fixtureEmail)
      const raw = await page.evaluate(
        (key) => localStorage.getItem(key),
        fixtureStorageKey,
      )
      expect(JSON.parse(raw!).user.id).toBe(customerB)
    }
    expect(calls).toHaveLength(1)
    expect(supabaseNetwork.currentEmail).toBe(fixtureEmail)
  })
}

for (const applied of [true, false]) {
  test(`un resultado ambiguo consulta Auth antes de ${applied ? 'confirmar un cambio ya aplicado' : 'permitir revisar el perfil sin reintentar'}`, async ({
    page,
    context,
    supabaseNetwork,
  }) => {
    const calls = await installEndpoint(context, async (command, route) => {
      if (applied) supabaseNetwork.currentEmail = command.email
      await route.fulfill({
        status: 503,
        headers: cors,
        json: {
          code: 'change_status_unknown',
          message: 'internal-auth-response',
        },
      })
    })
    await openDialog(page)
    await fillDialog(page)
    await page
      .getByRole('button', { name: 'Guardar correo', exact: true })
      .click()
    if (applied) {
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(
        page.getByLabel('Correo electrónico', { exact: true }),
      ).toHaveValue(newEmail)
    } else {
      await expect(page.getByRole('alert')).toContainText(
        'No pudimos confirmar el cambio.',
      )
      await expect(
        page.getByRole('button', { name: 'Guardar correo', exact: true }),
      ).toBeDisabled()
      await expect(
        page.getByLabel('Nuevo correo', { exact: true }),
      ).toHaveValue(newEmail)
      await page
        .getByRole('button', { name: 'Revisar mis datos', exact: true })
        .click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(
        page.getByLabel('Correo electrónico', { exact: true }),
      ).toHaveValue(fixtureEmail)
    }
    expect(calls).toHaveLength(1)
    expectNoEmailSideEffects(supabaseNetwork)
  })
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`el cambio de correo mantiene legibilidad y teclado en ${viewport.name}`, async ({
    page,
    context,
    supabaseNetwork,
  }) => {
    await page.setViewportSize(viewport)
    await installEndpoint(context, async (_command, route) => {
      await route.fulfill({
        status: 400,
        headers: cors,
        json: { code: 'invalid_current_password' },
      })
    })
    await openDialog(page)
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Nuevo correo', { exact: true })).toBeFocused()
    await fillDialog(page, 'Clave incorrecta visual')
    await page
      .getByRole('button', { name: 'Guardar correo', exact: true })
      .click()
    await expect(
      page.getByLabel('Contraseña actual', { exact: true }),
    ).toHaveAttribute('aria-invalid', 'true')
    await page.evaluate(async () => {
      await document.fonts.ready
    })
    const geometry = await page.getByRole('dialog').evaluate((dialog) => {
      const rectangle = dialog.getBoundingClientRect()
      return {
        left: rectangle.left,
        right: rectangle.right,
        top: rectangle.top,
        bottom: rectangle.bottom,
        overflow: document.documentElement.scrollWidth > innerWidth,
      }
    })
    expect(geometry.overflow).toBe(false)
    expect(geometry.left).toBeGreaterThanOrEqual(0)
    expect(geometry.right).toBeLessThanOrEqual(viewport.width)
    expect(geometry.top).toBeGreaterThanOrEqual(0)
    expect(geometry.bottom).toBeLessThanOrEqual(viewport.height)
    await mkdir(captures, { recursive: true })
    await page.screenshot({
      path: `${captures}/change-email-${viewport.name}.png`,
      fullPage: true,
    })
    expectNoEmailSideEffects(supabaseNetwork)
  })
}
