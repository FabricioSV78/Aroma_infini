import { mkdir } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import {
  expect,
  fixtureEmail,
  fixturePassword,
  signIn,
  test,
} from './supabase-auth-fixture'

// Offline recovery never requests email delivery. Real adapters use isolated
// HTTP contracts; no hosted accounts, keys, emails or production data are used.
const captures = 'artifacts/email-confirmation-removal-2026-10-28/screenshots'
test.use({ reducedMotion: 'reduce' })

async function capture(page: Page, name: string) {
  await mkdir(captures, { recursive: true })
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all(
      [...document.images].map((image) =>
        image.decode().catch(() => undefined),
      ),
    )
  })
  // Full-page captures include the existing footer reveal after real scrolling.
  const footer = page.locator('footer').first()
  if (await footer.count()) {
    await footer.scrollIntoViewIfNeeded()
    await page.waitForTimeout(250)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(250)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false)
  await page.screenshot({ path: `${captures}/${name}.png`, fullPage: true })
}

test('el registro accede directamente a la cuenta sin mensajes ni enlaces de confirmación', async ({
  page,
  supabaseNetwork,
}) => {
  await page.goto('/crear-cuenta')
  await page.getByLabel('Nombres', { exact: true }).fill('Ana')
  await page.getByLabel('Apellidos', { exact: true }).fill('Torres')
  await page
    .getByLabel('Correo electrónico', { exact: true })
    .fill(fixtureEmail)
  await page.getByLabel('Celular', { exact: true }).fill('912345678')
  await page.getByLabel('Contraseña', { exact: true }).fill(fixturePassword)
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  await expect(page).toHaveURL('/cuenta')
  await expect(page.getByRole('heading', { name: 'Hola, Ana' })).toBeVisible()
  await expect(page.getByText(/revisa tu correo para confirmar/i)).toHaveCount(
    0,
  )
  const signup = supabaseNetwork.requests.filter(
    (request) => request.path === '/auth/v1/signup',
  )
  expect(signup).toHaveLength(1)
  expect(signup[0].redirectTo).toBeNull()
  expect(signup[0].body.data).not.toHaveProperty('role')
  expect(
    supabaseNetwork.requests.filter((request) => request.grant === 'pkce'),
  ).toHaveLength(0)
})

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`los accesos de clientes y admin ofrecen recuperación: ${viewport.name}`, async ({
    page,
    supabaseNetwork,
  }) => {
    await page.setViewportSize(viewport)
    for (const [audience, path] of [
      ['cliente', '/iniciar-sesion'],
      ['admin', '/admin/login'],
    ]) {
      await page.goto(path)
      await expect(
        page.getByLabel('Correo electrónico', { exact: true }),
      ).toBeVisible()
      await expect(page.getByRole('link', { name: /olvidaste/i })).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Iniciar sesión', exact: true }),
      ).toBeVisible()
      await capture(page, `login-${audience}-${viewport.name}`)
    }
    expect(
      supabaseNetwork.requests.some(
        (request) => request.path === '/auth/v1/recover',
      ),
    ).toBe(false)
  })
}

test('recuperación y restablecer usan códigos sin correos ni sesiones automáticas', async ({
  page,
  supabaseNetwork,
}) => {
  for (const path of ['/recuperar-contrasena', '/restablecer-contrasena']) {
    await page.goto(path + '?returnTo=%2Fcheckout')
    await expect(
      page.getByLabel('Código de recuperación', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Enviar enlace', exact: true }),
    ).toHaveCount(0)
  }
  for (const path of ['/admin/recuperar', '/admin/restablecer']) {
    await page.goto(path)
    await expect(
      page.getByRole('heading', { name: 'Recuperar acceso administrativo' }),
    ).toBeVisible()
    await expect(
      page.getByLabel('Código de recuperación', { exact: true }),
    ).toHaveCount(0)
  }
  expect(
    supabaseNetwork.requests.some(
      (request) => request.path === '/auth/v1/recover',
    ),
  ).toBe(false)
  expect(
    supabaseNetwork.requests.some(
      (request) => request.method === 'PUT' && request.path === '/auth/v1/user',
    ),
  ).toBe(false)
})

test('Mis datos mantiene el correo de Auth en solo lectura y permite guardar los demás campos', async ({
  page,
  supabaseNetwork,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await signIn(page)
  await expect(page).toHaveURL('/cuenta')
  await page.goto('/cuenta/datos')
  const email = page.getByLabel('Correo electrónico', { exact: true })
  await expect(email).toHaveValue(fixtureEmail)
  await expect(email).toHaveAttribute('readonly', '')
  await expect(page.getByText(/para confirmar el cambio/i)).toHaveCount(0)
  await page.getByLabel('Nombre', { exact: true }).fill('Ana María')
  await page.getByLabel('Celular', { exact: true }).fill('923456789')
  await page
    .getByRole('button', { name: 'Guardar cambios', exact: true })
    .click()
  await expect(
    page.locator('.account-form-actions [role="status"]'),
  ).toContainText('Cambios guardados.')
  const update = supabaseNetwork.requests.filter((request) =>
    request.path.endsWith('/update_profile'),
  )
  expect(update).toHaveLength(1)
  expect(update[0].body).toMatchObject({
    p_first_name: 'Ana María',
    p_phone: '923456789',
  })
  expect(update[0].body).not.toHaveProperty('email')
  expect(
    supabaseNetwork.requests.some(
      (request) => request.method === 'PUT' && request.path === '/auth/v1/user',
    ),
  ).toBe(false)
  await page.reload()
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(
    'Ana María',
  )
  await expect(email).toHaveValue(fixtureEmail)
  await capture(page, 'datos-correo-solo-lectura-desktop')
  await page.setViewportSize({ width: 390, height: 844 })
  await capture(page, 'datos-correo-solo-lectura-mobile')
})

for (const callback of [
  '/auth/callback?code=old-code&access_token=old-access&refresh_token=old-refresh#access_token=old-hash&type=recovery',
  '/auth/callback?code=old-code&type=email_change&token_hash=old-token-hash',
]) {
  test(`un callback antiguo se limpia y rechaza sin intercambiar credenciales: ${callback.includes('email_change') ? 'cambio de correo' : 'recuperación'}`, async ({
    page,
    supabaseNetwork,
  }) => {
    await page.goto(callback)
    await expect(
      page.getByRole('heading', {
        name: 'Este enlace ya no está disponible',
        exact: true,
      }),
    ).toBeVisible()
    await expect(page).toHaveURL('/auth/callback')
    expect(
      supabaseNetwork.requests.filter((request) => request.grant === 'pkce'),
    ).toHaveLength(0)
    expect(
      supabaseNetwork.requests.some(
        (request) =>
          request.method === 'PUT' && request.path === '/auth/v1/user',
      ),
    ).toBe(false)
    await expect(
      page.getByRole('link', { name: 'Recuperar acceso', exact: true }),
    ).toBeVisible()
  })
}
