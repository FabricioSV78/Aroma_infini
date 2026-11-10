import { expect, test, type Page } from './test'
import type { AuthSignUpInput } from '../src/types/auth'

test.use({ authMode: 'anonymous' })

const registration: AuthSignUpInput = {
  firstName: 'María Registro',
  lastName: 'Del Campo Prueba',
  email: 'registro@example.invalid',
  phone: '987654321',
  password: 'Una-clave-privada-de-prueba-123',
}

async function fillRegistration(
  page: Page,
  data: AuthSignUpInput = registration,
) {
  await page.getByLabel('Nombres', { exact: true }).fill(data.firstName)
  await page.getByLabel('Apellidos', { exact: true }).fill(data.lastName)
  await page.getByLabel('Correo electrónico').fill(data.email)
  await page.getByLabel('Celular', { exact: true }).fill(data.phone)
  await page.getByLabel('Contraseña', { exact: true }).fill(data.password)
}

test('valida apellidos y celular antes de enviar y enfoca el campo que necesita corrección', async ({
  page,
  context,
}) => {
  let calls = 0
  await context.route(
    '**/__aroma_playwright__/auth/sign-up?*',
    async (route) => {
      calls++
      await route.fulfill({ json: null })
    },
  )
  await page.goto('/crear-cuenta')
  await fillRegistration(page, { ...registration, lastName: '   ' })
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  const surname = page.getByLabel('Apellidos', { exact: true })
  await expect(surname).toBeFocused()
  await expect(surname).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Escribe tus apellidos.')).toBeVisible()
  expect(calls).toBe(0)

  await surname.fill(registration.lastName)
  const phone = page.getByLabel('Celular', { exact: true })
  for (const invalidPhone of ['812345678', '91234567', '9abc45678']) {
    await phone.fill(invalidPhone)
    await page
      .getByRole('button', { name: 'Crear cuenta', exact: true })
      .click()
    await expect(phone).toBeFocused()
    await expect(phone).toHaveAttribute('aria-invalid', 'true')
    await expect(
      page.getByText('Escribe un celular de 9 dígitos que empiece con 9.'),
    ).toBeVisible()
    expect(calls).toBe(0)
  }
  await expect(page.getByLabel('Nombres', { exact: true })).toHaveValue(
    registration.firstName,
  )
  await expect(surname).toHaveValue(registration.lastName)
})

test('envía el perfil estructurado y recorta datos de contacto sin alterar la contraseña', async ({
  page,
  context,
  authFixture,
}) => {
  let submitted: unknown = null
  await context.route(
    '**/__aroma_playwright__/auth/sign-up?*',
    async (route) => {
      submitted = route.request().postDataJSON()
      authFixture.setMode('customer')
      await route.fulfill({ json: null })
    },
  )
  await page.goto('/crear-cuenta')
  const password = '  Mi contraseña privada-123  '
  await fillRegistration(page, {
    ...registration,
    firstName: `  ${registration.firstName}  `,
    lastName: ` ${registration.lastName} `,
    email: ` ${registration.email} `,
    password,
  })
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  await expect(page).toHaveURL('/cuenta')
  expect(submitted).toEqual({ ...registration, password })
  expect(submitted).not.toHaveProperty('name')
  await expect(page.locator('.auth-form')).toHaveCount(0)
})

test('un error conserva todos los campos sin guardar datos personales ni contraseña en el navegador', async ({
  page,
  context,
}) => {
  await context.route('**/__aroma_playwright__/auth/sign-up?*', (route) =>
    route.fulfill({
      status: 503,
      json: { message: 'PRIVATE_REGISTRATION_PROVIDER_RESPONSE' },
    }),
  )
  await page.goto('/crear-cuenta')
  await fillRegistration(page)
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText(
    'No pudimos completar la solicitud',
  )
  for (const [label, value] of [
    ['Nombres', registration.firstName],
    ['Apellidos', registration.lastName],
    ['Correo electrónico', registration.email],
    ['Celular', registration.phone],
    ['Contraseña', registration.password],
  ]) {
    await expect(page.getByLabel(label, { exact: true })).toHaveValue(value)
  }
  await expect(
    page.getByText('PRIVATE_REGISTRATION_PROVIDER_RESPONSE'),
  ).toHaveCount(0)
  const storage = await page.evaluate(() =>
    JSON.stringify({
      local: Object.entries(localStorage),
      session: Object.entries(sessionStorage),
    }),
  )
  for (const value of Object.values(registration)) {
    expect(storage).not.toContain(value)
  }
  await page.getByRole('button', { name: 'Entendido', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Crear cuenta', exact: true }),
  ).toBeEnabled()
})

test('un registro pendiente bloquea todos los campos y no duplica solicitudes', async ({
  page,
  context,
  authFixture,
}) => {
  let calls = 0
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await context.route(
    '**/__aroma_playwright__/auth/sign-up?*',
    async (route) => {
      calls++
      await pending
      authFixture.setMode('customer')
      await route.fulfill({ json: null })
    },
  )
  await page.goto('/crear-cuenta')
  await fillRegistration(page)
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  try {
    await expect(
      page.getByRole('button', { name: 'Procesando…' }),
    ).toBeDisabled()
    await expect(page.locator('.auth-form')).toHaveAttribute(
      'aria-busy',
      'true',
    )
    for (const label of [
      'Nombres',
      'Apellidos',
      'Correo electrónico',
      'Celular',
      'Contraseña',
    ]) {
      await expect(page.getByLabel(label, { exact: true })).toBeDisabled()
    }
    await expect.poll(() => calls).toBe(1)
    await page.locator('.auth-form').evaluate((form) => {
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
    })
    expect(calls).toBe(1)
  } finally {
    release()
  }
  await expect(page).toHaveURL('/cuenta')
  await expect(page.locator('.account-sidebar')).toBeVisible()
  expect(calls).toBe(1)
})
