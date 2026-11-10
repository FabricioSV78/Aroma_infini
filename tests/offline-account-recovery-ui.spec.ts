import { mkdir } from 'node:fs/promises'
import type { BrowserContext, Page, Route } from '@playwright/test'
import {
  expect,
  fixtureEmail,
  fixturePassword,
  fixtureProject,
  signIn,
  test,
} from './supabase-auth-fixture'

// Real frontend and SDK against isolated network contracts. No mail/SMS API,
// hosted account, secret or production data is used by these tests.
const endpoint = `https://${fixtureProject}.supabase.co/functions/v1/account-recovery`
const code = `AI-${'A1'.repeat(32)}`
const replacement = `AI-${'B2'.repeat(32)}`
const nextPassword = 'Nueva-clave-Recuperacion-123!'
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'POST,OPTIONS',
}

test.use({ reducedMotion: 'reduce' })

async function revealPage(page: Page) {
  await page.evaluate(() => document.fonts.ready)
  const footer = page.locator('footer').first()
  if (await footer.count()) await footer.scrollIntoViewIfNeeded()
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  )
  await page.evaluate(() => window.scrollTo(0, 0))
}
test.beforeEach(async ({ supabaseNetwork }) => {
  expect(supabaseNetwork.currentUserId).toBeTruthy()
})
type Command = Record<string, unknown>

async function install(
  context: BrowserContext,
  handler?: (command: Command, route: Route) => Promise<boolean>,
) {
  const calls: Command[] = []
  await context.route(endpoint, async (route) => {
    if (route.request().method() === 'OPTIONS')
      return route.fulfill({ status: 204, headers: cors })
    const command = route.request().postDataJSON() as Command
    calls.push(command)
    if (command.action === 'recover')
      expect(route.request().headers().authorization).toBeUndefined()
    else expect(route.request().headers().authorization).toMatch(/^Bearer ey/)
    expect(command).not.toHaveProperty('userId')
    if (handler && (await handler(command, route))) return
    await route.fulfill({
      headers: cors,
      json:
        command.action === 'status'
          ? { hasCode: false, createdAt: null }
          : command.action === 'issue'
            ? { recoveryCode: code, createdAt: '2026-10-28T12:00:00Z' }
            : { success: true, recoveryCode: replacement },
    })
  })
  return calls
}

async function fillRecovery(page: Page) {
  await page
    .getByLabel('Correo electrónico', { exact: true })
    .fill(fixtureEmail)
  await page.getByLabel('Código de recuperación', { exact: true }).fill(code)
  await page.getByLabel('Nueva contraseña', { exact: true }).fill(nextPassword)
  await page
    .getByLabel('Confirmar contraseña', { exact: true })
    .fill(nextPassword)
}

async function openSettings(page: Page) {
  await signIn(page)
  await expect(page).toHaveURL('/cuenta')
  await page.goto('/cuenta/datos')
  await expect(
    page.getByRole('button', { name: 'Crear código', exact: true }),
  ).toBeEnabled()
  await page.getByRole('button', { name: 'Crear código', exact: true }).click()
  await expect(
    page.getByRole('dialog', { name: 'Crear código', exact: true }),
  ).toBeVisible()
}

test('recuperación mantiene el destino y no ofrece envío por email ni SMS', async ({
  page,
  context,
  supabaseNetwork,
}) => {
  await install(context)
  await page.goto('/iniciar-sesion?returnTo=%2Fcheckout')
  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click()
  await expect(
    page.getByRole('heading', { name: 'Recuperar acceso', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Volver a iniciar sesión', exact: true }),
  ).toHaveAttribute('href', '/iniciar-sesion?returnTo=%2Fcheckout')
  await expect(page.getByRole('button', { name: 'Enviar enlace' })).toHaveCount(
    0,
  )
  await expect(page.locator('body')).not.toContainText('Te enviaremos')
  expect(
    supabaseNetwork.requests.some((request) =>
      request.path.includes('/recover'),
    ),
  ).toBe(false)
})

test('valida los campos y enfoca el primer error sin llamar al servidor', async ({
  page,
  context,
}) => {
  const calls = await install(context)
  await page.goto('/recuperar-contrasena')
  await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click()
  await expect(
    page.getByLabel('Correo electrónico', { exact: true }),
  ).toBeFocused()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(calls).toHaveLength(0)
  await fillRecovery(page)
  await page
    .getByLabel('Confirmar contraseña', { exact: true })
    .fill('Otra-clave-123!')
  await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click()
  await expect(page.getByText('Las contraseñas deben coincidir.')).toBeVisible()
  expect(calls).toHaveLength(0)
})

test('código no válido o email desconocido comparten un error sin perder los campos', async ({
  page,
  context,
}) => {
  await install(context, async (command, route) => {
    if (command.action !== 'recover') return false
    await route.fulfill({
      status: 400,
      headers: cors,
      json: { code: 'invalid_recovery', message: 'private-auth-row-detail' },
    })
    return true
  })
  await page.goto('/recuperar-contrasena')
  await fillRecovery(page)
  await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click()
  await expect(
    page.getByText(
      'El correo y el código no son válidos o el código ya fue utilizado.',
    ),
  ).toBeVisible()
  await expect(
    page.getByLabel('Código de recuperación', { exact: true }),
  ).toBeFocused()
  await expect(
    page.getByLabel('Nueva contraseña', { exact: true }),
  ).toHaveValue(nextPassword)
  await expect(
    page.getByLabel('Correo electrónico', { exact: true }),
  ).toHaveValue(fixtureEmail)
  await expect(page.locator('body')).not.toContainText(
    'private-auth-row-detail',
  )
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('éxito muestra código nuevo una sola vez y exige guardarlo sin iniciar sesión', async ({
  page,
  context,
  supabaseNetwork,
}) => {
  const calls = await install(context)
  await page.goto('/recuperar-contrasena?returnTo=%2Fcheckout')
  await fillRecovery(page)
  await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click()
  await expect(
    page.getByRole('heading', { name: 'Contraseña actualizada', exact: true }),
  ).toBeVisible()
  await expect(page.getByText(replacement, { exact: true })).toBeVisible()
  const go = page.getByRole('button', {
    name: 'Volver a iniciar sesión',
    exact: true,
  })
  await expect(go).toBeDisabled()
  const download = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Descargar código', exact: true })
    .click()
  expect((await download).suggestedFilename()).toBe(
    'aroma-infini-codigo-recuperacion.txt',
  )
  await page.getByLabel('Ya guardé el código').check()
  await go.click()
  await expect(page).toHaveURL('/iniciar-sesion?returnTo=%2Fcheckout')
  expect(calls).toEqual([
    {
      action: 'recover',
      email: fixtureEmail,
      recoveryCode: code,
      newPassword: nextPassword,
    },
  ])
  expect(
    supabaseNetwork.requests.filter((request) => request.grant === 'password'),
  ).toHaveLength(0)
  const stored = await page.evaluate(() =>
    JSON.stringify({ local: localStorage, session: sessionStorage }),
  )
  expect(stored).not.toContain(code)
  expect(stored).not.toContain(replacement)
  expect(stored).not.toContain(nextPassword)
})

test('límite de intentos usa modal general y conserva los datos', async ({
  page,
  context,
}) => {
  await install(context, async (_command, route) => {
    await route.fulfill({
      status: 429,
      headers: cors,
      json: { code: 'rate_limit' },
    })
    return true
  })
  await page.goto('/recuperar-contrasena')
  await fillRecovery(page)
  await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click()
  await expect(page.getByRole('dialog')).toContainText(
    'Has realizado varios intentos.',
  )
  await page.getByRole('button', { name: 'Entendido', exact: true }).click()
  await expect(
    page.getByLabel('Código de recuperación', { exact: true }),
  ).toHaveValue(code)
})

test('el acceso administrativo deriva al propietario sin permitir reset con códigos de cliente', async ({
  page,
  context,
}) => {
  const calls = await install(context)
  await page.goto('/admin/recuperar')
  await expect(
    page.getByRole('heading', { name: 'Recuperar acceso administrativo' }),
  ).toBeVisible()
  await expect(page.getByText(/directamente en Supabase/)).toBeVisible()
  await expect(
    page.getByLabel('Código de recuperación', { exact: true }),
  ).toHaveCount(0)
  expect(calls).toHaveLength(0)
})

test('crear código exige contraseña y muestra la credencial solo después del éxito', async ({
  page,
  context,
}) => {
  const calls = await install(context)
  await openSettings(page)
  const dialog = page.getByRole('dialog')
  await dialog
    .getByRole('button', { name: 'Crear código', exact: true })
    .click()
  await expect(page.getByText('Escribe tu contraseña actual.')).toBeVisible()
  expect(calls.filter((call) => call.action === 'issue')).toHaveLength(0)
  await page
    .getByLabel('Contraseña actual', { exact: true })
    .fill(fixturePassword)
  await dialog
    .getByRole('button', { name: 'Crear código', exact: true })
    .click()
  await expect(page.getByText(code, { exact: true })).toBeVisible()
  await expect(
    dialog.getByRole('button', { name: 'Continuar', exact: true }),
  ).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeVisible()
  await page.getByLabel('Ya guardé el código').check()
  await dialog.getByRole('button', { name: 'Continuar', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText(code, { exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Reemplazar código', exact: true }),
  ).toBeVisible()
  const stored = await page.evaluate(() =>
    JSON.stringify({ local: localStorage, session: sessionStorage }),
  )
  expect(stored).not.toContain(code)
  expect(stored).not.toContain(fixturePassword)
  expect(calls.filter((call) => call.action === 'issue')).toEqual([
    { action: 'issue', currentPassword: fixturePassword },
  ])
})

test('contraseña actual incorrecta se muestra bajo el campo de crear código', async ({
  page,
  context,
}) => {
  await install(context, async (command, route) => {
    if (command.action !== 'issue') return false
    await route.fulfill({
      status: 400,
      headers: cors,
      json: { code: 'invalid_current_password' },
    })
    return true
  })
  await openSettings(page)
  await page
    .getByLabel('Contraseña actual', { exact: true })
    .fill('Incorrecta-123!')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Crear código', exact: true })
    .click()
  await expect(
    page.getByText('La contraseña actual no es correcta.'),
  ).toBeVisible()
  await expect(
    page.getByLabel('Contraseña actual', { exact: true }),
  ).toBeFocused()
  await expect(page.getByText(code, { exact: true })).toHaveCount(0)
})

for (const viewport of [
  { name: 'monitor', width: 1920, height: 1080 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`recuperación y recibo se adaptan a ${viewport.name}`, async ({
    page,
    context,
  }) => {
    await install(context)
    await page.setViewportSize(viewport)
    await page.goto('/recuperar-contrasena')
    await fillRecovery(page)
    await mkdir('artifacts/offline-recovery-ui-2026-10-28/screenshots', {
      recursive: true,
    })
    await revealPage(page)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false)
    await page.screenshot({
      path: `artifacts/offline-recovery-ui-2026-10-28/screenshots/form-${viewport.name}.png`,
      fullPage: true,
    })
    await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click()
    await expect(page.getByText(replacement, { exact: true })).toBeVisible()
    await revealPage(page)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false)
    await page.screenshot({
      path: `artifacts/offline-recovery-ui-2026-10-28/screenshots/success-${viewport.name}.png`,
      fullPage: true,
    })
  })
}
