import { Buffer } from 'node:buffer'
import type { Route } from '@playwright/test'
import {
  customerA,
  expect,
  fixtureEmail,
  fixturePassword,
  fixtureProject,
  signIn,
  test,
} from './supabase-auth-fixture'

// Real SDK and application adapters against isolated HTTP contracts. These
// checks do not create hosted users, deliver email, or certify remote RLS.
const origin = `https://${fixtureProject}.supabase.co`
const headers = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'x-supabase-api-version': '2024-01-01',
  'access-control-expose-headers': 'x-supabase-api-version',
}

async function options(route: Route) {
  if (route.request().method() !== 'OPTIONS') return false
  await route.fulfill({ status: 204, headers })
  return true
}

function expectOwner(route: Route) {
  const authorization = route.request().headers().authorization
  expect(authorization).toMatch(/^Bearer ey/)
  const token = authorization!.replace(/^Bearer /, '')
  const claims = JSON.parse(
    Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
  ) as { sub: string }
  expect(claims.sub).toBe(customerA)
}

test('perfil y dirección dependen del propietario remoto, no de una confirmación de correo', async ({
  page,
  supabaseNetwork,
}) => {
  supabaseNetwork.confirmed = false
  await signIn(page)
  await expect(page).toHaveURL('/cuenta')
  await page.goto('/cuenta/datos')
  await expect(
    page.getByLabel('Correo electrónico', { exact: true }),
  ).toHaveValue(fixtureEmail)
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Ana')
  await page.goto('/cuenta/direcciones')
  await expect(
    page.getByRole('button', { name: 'Añadir dirección', exact: true }),
  ).toBeVisible()
})

test('dirección propia se guarda, recarga y elimina mediante las RPC del propietario', async ({
  page,
  supabaseNetwork,
}) => {
  let address: Record<string, unknown> | null = null
  let saves = 0
  let removals = 0
  await page.route(`${origin}/rest/v1/rpc/*_address`, async (route) => {
    if (await options(route)) return
    expectOwner(route)
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/save_address')) {
      const command = route.request().postDataJSON() as Record<string, unknown>
      expect(command).not.toHaveProperty('user_id')
      expect(command).not.toHaveProperty('p_user_id')
      address = {
        id: '00000000-0000-4000-8000-000000000101',
        user_id: customerA,
        label: command.p_label,
        recipient: command.p_recipient,
        department: command.p_department,
        province: command.p_province,
        district: command.p_district,
        street: command.p_street,
        reference: command.p_reference,
        location:
          typeof command.p_latitude === 'number' &&
          typeof command.p_longitude === 'number'
            ? { latitude: command.p_latitude, longitude: command.p_longitude }
            : null,
      }
      saves++
    } else if (path.endsWith('/remove_address')) {
      address = null
      removals++
    }
    await route.fulfill({ status: 200, headers, json: address })
  })
  await signIn(page)
  await expect(page).toHaveURL('/cuenta')
  await page.goto('/cuenta/direcciones')
  await page
    .getByRole('button', { name: 'Añadir dirección', exact: true })
    .click()
  await page
    .getByLabel('Etiqueta de la dirección', { exact: true })
    .fill('Casa')
  await page
    .getByLabel('Nombre de quien recibe', { exact: true })
    .fill('Ana Torres')
  await page.getByLabel('Zona de entrega', { exact: true }).selectOption('lima')
  await page.getByLabel('Distrito', { exact: true }).selectOption('150122')
  await page
    .getByRole('textbox', { name: 'Dirección', exact: true })
    .fill('Calle de prueba 123')
  await page.getByLabel('Referencia', { exact: false }).fill('Puerta verde')
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path fill="#eef0e9" d="M0 0h256v256H0z"/></svg>',
    }),
  )
  await page
    .getByRole('button', { name: 'Elegir en el mapa', exact: true })
    .click()
  const map = page.getByRole('group', { name: 'Mapa para elegir la ubicación' })
  await map.focus()
  await map.press('ArrowRight')
  await page
    .getByRole('button', { name: 'Usar este punto', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Guardar dirección', exact: true })
    .click()
  await expect(
    page.getByRole('status').filter({ hasText: 'Dirección guardada.' }),
  ).toBeVisible()
  expect(saves).toBe(1)
  expect(address).toMatchObject({
    location: { latitude: expect.any(Number), longitude: expect.any(Number) },
  })
  await page.reload()
  await expect(
    page.getByLabel('Etiqueta de la dirección', { exact: true }),
  ).toHaveValue('Casa')
  await expect(
    page.getByRole('textbox', { name: 'Dirección', exact: true }),
  ).toHaveValue('Calle de prueba 123')
  await expect(page.getByLabel('Distrito', { exact: true })).toHaveValue(
    '150122',
  )
  await expect(
    page.getByRole('link', { name: /Ver en Google Maps/ }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Quitar ubicación', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Guardar dirección', exact: true })
    .click()
  await expect.poll(() => saves).toBe(2)
  expect(address).toMatchObject({ location: null })
  await page.reload()
  await expect(
    page.getByRole('link', { name: /Ver en Google Maps/ }),
  ).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Eliminar dirección', exact: true })
    .click()
  await expect(
    page.getByRole('heading', {
      name: 'No hay una dirección guardada',
      exact: true,
    }),
  ).toBeVisible()
  expect(removals).toBe(1)
  await page.reload()
  await expect(
    page.getByRole('heading', {
      name: 'No hay una dirección guardada',
      exact: true,
    }),
  ).toBeVisible()
  expect(
    supabaseNetwork.requests.some((request) =>
      request.path.endsWith('/current_actor'),
    ),
  ).toBe(true)
})

test('el correo es de solo lectura y guardar perfil no solicita correos', async ({
  page,
  supabaseNetwork,
}) => {
  await signIn(page)
  await expect(page).toHaveURL('/cuenta')
  await page.goto('/cuenta/datos')
  const email = page.getByLabel('Correo electrónico', { exact: true })
  await expect(email).toHaveAttribute('readonly', '')
  await expect(email).toHaveValue(fixtureEmail)
  await page.getByLabel('Nombre', { exact: true }).fill('Ana María')
  await page.getByLabel('Celular', { exact: true }).fill('923456789')
  await page
    .getByRole('button', { name: 'Guardar cambios', exact: true })
    .click()
  await expect(
    page.locator('.account-form-actions [role="status"]'),
  ).toContainText('Cambios guardados.')
  const profileWrite = supabaseNetwork.requests.find((request) =>
    request.path.endsWith('/update_profile'),
  )
  expect(profileWrite?.body).not.toHaveProperty('email')
  expect(
    supabaseNetwork.requests.filter(
      (request) => request.path === '/auth/v1/user' && request.method === 'PUT',
    ),
  ).toHaveLength(0)
  await page.reload()
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(
    'Ana María',
  )
  await expect(page.getByLabel('Celular', { exact: true })).toHaveValue(
    '923456789',
  )
  await expect(email).toHaveValue(fixtureEmail)
  await expect(page.locator('body')).not.toContainText(
    'pendiente de confirmación',
  )
})

test('coordenadas inválidas se rechazan antes de enviar una dirección al servidor', async ({
  page,
  supabaseNetwork,
}) => {
  await signIn(page)
  await expect(page).toHaveURL('/cuenta')
  const writesBefore = supabaseNetwork.requests.filter((request) =>
    request.path.endsWith('/save_address'),
  ).length
  const outcomes = await page.evaluate(async (userId) => {
    const source = '/src/services/account-adapter.ts'
    const { accountAdapter } = await import(source)
    const locations = [
      { latitude: 91, longitude: -77 },
      { latitude: -12, longitude: 181 },
      { latitude: NaN, longitude: -77 },
      { latitude: -12, longitude: Infinity },
      { latitude: -12 },
      { latitude: '-12', longitude: -77 },
    ]
    const result: string[] = []
    for (const location of locations) {
      try {
        await accountAdapter.saveAddress(userId, {
          id: '',
          label: 'Casa',
          recipient: 'Ana Torres',
          department: 'lima',
          province: '1501',
          district: '150122',
          street: 'Calle de prueba 123',
          reference: '',
          location,
        })
        result.push('accepted')
      } catch (error) {
        result.push(
          error instanceof Error && 'code' in error
            ? String(error.code)
            : 'unexpected',
        )
      }
    }
    return result
  }, customerA)
  expect(outcomes).toEqual(Array(6).fill('validation'))
  expect(
    supabaseNetwork.requests.filter((request) =>
      request.path.endsWith('/save_address'),
    ),
  ).toHaveLength(writesBefore)
})

test('un intento manipulado de cambiar correo se rechaza antes de escribir perfil o Auth', async ({
  page,
  supabaseNetwork,
}) => {
  await signIn(page)
  await expect(page).toHaveURL('/cuenta')
  const writesBefore = supabaseNetwork.requests.filter((request) =>
    request.path.endsWith('/update_profile'),
  ).length
  const result = await page.evaluate(
    async ({ userId, email }) => {
      const source = '/src/services/account-adapter.ts'
      const { accountAdapter } = await import(source)
      try {
        await accountAdapter.updateProfile(userId, {
          firstName: 'Cambio que no debe guardarse',
          lastName: 'Torres',
          phone: '912345678',
          email,
        })
        return { rejected: false, code: '' }
      } catch (error) {
        return {
          rejected: true,
          code:
            error instanceof Error && 'code' in error ? String(error.code) : '',
        }
      }
    },
    { userId: customerA, email: 'otro@example.invalid' },
  )
  expect(result).toEqual({ rejected: true, code: 'email-change' })
  expect(
    supabaseNetwork.requests.filter((request) =>
      request.path.endsWith('/update_profile'),
    ),
  ).toHaveLength(writesBefore)
  expect(
    supabaseNetwork.requests.filter(
      (request) => request.path === '/auth/v1/user' && request.method === 'PUT',
    ),
  ).toHaveLength(0)
  await page.goto('/cuenta/datos')
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Ana')
  await expect(
    page.getByLabel('Correo electrónico', { exact: true }),
  ).toHaveValue(fixtureEmail)
})

test('un error SQL general no muestra detalles técnicos ni borra datos del formulario', async ({
  page,
  supabaseNetwork,
}) => {
  await page.route(`${origin}/rest/v1/rpc/update_profile`, async (route) => {
    if (await options(route)) return
    expectOwner(route)
    await route.fulfill({
      status: 400,
      headers,
      json: {
        code: '23514',
        message: 'private-table-constraint-internal-detail',
        details: 'sensitive-row-value',
      },
    })
  })
  await signIn(page)
  await expect(page).toHaveURL('/cuenta')
  await page.goto('/cuenta/datos')
  await page.getByLabel('Nombre', { exact: true }).fill('Ana María')
  await page
    .getByRole('button', { name: 'Guardar cambios', exact: true })
    .click()
  const dialog = page.getByRole('dialog', { name: 'No pudimos guardar' })
  await expect(dialog).toContainText(
    'Revisa los datos del formulario e inténtalo de nuevo.',
  )
  await expect(dialog).not.toContainText('23514')
  await expect(dialog).not.toContainText(
    'private-table-constraint-internal-detail',
  )
  await dialog.getByRole('button', { name: 'Entendido', exact: true }).click()
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(
    'Ana María',
  )
  expect(
    supabaseNetwork.requests.some((request) => request.grant === 'password'),
  ).toBe(true)
})

test('Supabase rechaza una contraseña débil debajo del campo sin abrir un modal ni perder el registro', async ({
  page,
  supabaseNetwork,
}) => {
  await page.route(`${origin}/auth/v1/signup*`, async (route) => {
    if (await options(route)) return
    const command = route.request().postDataJSON() as Record<string, unknown>
    expect(command.password).toBe(fixturePassword)
    await route.fulfill({
      status: 422,
      headers,
      json: {
        code: 'weak_password',
        msg: 'provider-internal-weak-password-description',
      },
    })
  })
  await page.goto('/crear-cuenta')
  await page.getByLabel('Nombres', { exact: true }).fill('Ana')
  await page.getByLabel('Apellidos', { exact: true }).fill('Torres')
  await page
    .getByLabel('Correo electrónico', { exact: true })
    .fill(fixtureEmail)
  await page.getByLabel('Celular', { exact: true }).fill('912345678')
  await page.getByLabel('Contraseña', { exact: true }).fill(fixturePassword)
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  await expect(page.locator('#auth-password-error')).toContainText(
    'Usa al menos 12 caracteres, con mayúscula, minúscula, número y símbolo.',
  )
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByLabel('Nombres', { exact: true })).toHaveValue('Ana')
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue(
    fixturePassword,
  )
  await expect(page.locator('body')).not.toContainText(
    'provider-internal-weak-password-description',
  )
  expect(
    supabaseNetwork.requests.some((request) =>
      request.path.endsWith('/current_actor'),
    ),
  ).toBe(false)
})
