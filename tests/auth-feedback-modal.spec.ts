import { mkdir, writeFile } from 'node:fs/promises'
import { expect, test, type Page } from './test'

test.use({ authMode: 'unconfigured' })

const artifactRoot = 'artifacts/auth-feedback-2026-10-26/screens'
const values = {
  firstName: 'Usuario Prueba',
  lastName: 'Registro Prueba',
  email: 'usuario-prueba@example.invalid',
  phone: '987654321',
  password: 'Clave-privada-solo-de-prueba-123',
}

const viewports = [
  { name: 'monitor', width: 1920, height: 1080 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
]

async function ready(page: Page) {
  await expect(page.locator('.auth-tabs')).toBeVisible()
  await page.evaluate(async () => {
    await document.fonts.ready
    await document
      .querySelector<HTMLImageElement>('.auth-editorial img')!
      .decode()
  })
}

async function fillValidForm(page: Page, register: boolean) {
  if (register) {
    await page.getByLabel('Nombres', { exact: true }).fill(values.firstName)
    await page.getByLabel('Apellidos', { exact: true }).fill(values.lastName)
    await page.getByLabel('Celular', { exact: true }).fill(values.phone)
  }
  await page.getByLabel('Correo electrónico').fill(values.email)
  await page.getByLabel('Contraseña', { exact: true }).fill(values.password)
}

async function expectValuesPreserved(page: Page, register: boolean) {
  if (register) {
    await expect(page.getByLabel('Nombres', { exact: true })).toHaveValue(
      values.firstName,
    )
    await expect(page.getByLabel('Apellidos', { exact: true })).toHaveValue(
      values.lastName,
    )
    await expect(page.getByLabel('Celular', { exact: true })).toHaveValue(
      values.phone,
    )
  }
  await expect(page.getByLabel('Correo electrónico')).toHaveValue(values.email)
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue(
    values.password,
  )
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const selectors: Record<string, string> = {
      frame: '.auth-customer-layout--editorial',
      panel: '.auth-form-panel',
      image: '.auth-editorial',
      tabs: '.auth-tabs',
      button: '.auth-submit',
      footer: '.site-footer',
    }
    for (const input of document.querySelectorAll<HTMLInputElement>(
      '.auth-form input',
    )) {
      selectors[input.id] = `#${input.id}`
    }
    return {
      scrollY,
      boxes: Object.fromEntries(
        Object.entries(selectors).map(([name, selector]) => {
          const rect = document.querySelector(selector)!.getBoundingClientRect()
          return [
            name,
            { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          ]
        }),
      ),
    }
  })
}

type Geometry = Awaited<ReturnType<typeof geometry>>

function expectSameGeometry(
  before: Geometry,
  after: Geometry,
  context: string,
) {
  expect(after.scrollY, `${context}: scroll`).toBe(before.scrollY)
  expect(Object.keys(after.boxes)).toEqual(Object.keys(before.boxes))
  for (const [name, original] of Object.entries(before.boxes)) {
    for (const [dimension, value] of Object.entries(original)) {
      const next = after.boxes[name][dimension as keyof typeof original]
      expect(
        Math.abs(next - value),
        `${context}: ${name}.${dimension}`,
      ).toBeLessThanOrEqual(1)
    }
  }
}

for (const viewport of viewports) {
  test(`el aviso de acceso y registro no desplaza el formulario en ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await mkdir(artifactRoot, { recursive: true })
    const results = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    for (const register of [false, true]) {
      const view = register ? 'register' : 'login'
      await page.goto(register ? '/crear-cuenta' : '/iniciar-sesion')
      await ready(page)
      await fillValidForm(page, register)
      await page.evaluate(() =>
        window.scrollTo({ top: 40, behavior: 'instant' }),
      )
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(40)
      const before = await geometry(page)
      await page.screenshot({
        path: `${artifactRoot}/${view}-${viewport.name}-before.png`,
        animations: 'disabled',
      })

      const submit = page.getByRole('button', {
        name: register ? 'Crear cuenta' : 'Iniciar sesión',
        exact: true,
      })
      await submit.click()
      const dialog = page.getByRole('dialog', {
        name: 'No pudimos continuar',
        exact: true,
      })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('alert')).toHaveText(
        'No pudimos conectar con el acceso a tu cuenta. Vuelve a intentarlo más tarde.',
      )
      await expect(page.locator('dialog[open]')).toHaveCount(1)
      const opened = await geometry(page)
      expectSameGeometry(before, opened, `${viewport.name}/${view}/abierto`)
      await expectValuesPreserved(page, register)
      await page.screenshot({
        path: `${artifactRoot}/${view}-${viewport.name}-modal.png`,
        animations: 'disabled',
      })

      await dialog
        .getByRole('button', { name: 'Entendido', exact: true })
        .click()
      await expect(dialog).not.toBeVisible()
      await expect(submit).toBeFocused()
      const closed = await geometry(page)
      expectSameGeometry(before, closed, `${viewport.name}/${view}/cerrado`)
      await expectValuesPreserved(page, register)
      await page.screenshot({
        path: `${artifactRoot}/${view}-${viewport.name}-after.png`,
        animations: 'disabled',
      })
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false)
      results.push({ view, before, opened, closed })
    }
    expect(errors).toEqual([])
    await writeFile(
      `${artifactRoot}/${viewport.name}.json`,
      JSON.stringify({ viewport, results, errors }, null, 2),
    )
  })
}

test('el aviso conserva el foco dentro, cierra con Escape o Enter y reaparece al repetir el intento', async ({
  page,
}) => {
  await page.goto('/iniciar-sesion')
  await ready(page)
  await fillValidForm(page, false)
  const submit = page.getByRole('button', {
    name: 'Iniciar sesión',
    exact: true,
  })
  const dialog = page.getByRole('dialog', {
    name: 'No pudimos continuar',
    exact: true,
  })
  await submit.click()
  await expect(dialog).toBeVisible()
  const understood = dialog.getByRole('button', {
    name: 'Entendido',
    exact: true,
  })
  const close = dialog.getByRole('button', { name: 'Cerrar', exact: true })
  await understood.focus()
  await page.keyboard.press('Tab')
  await expect(close).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(understood).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(submit).toBeFocused()
  await expectValuesPreserved(page, false)

  await submit.click()
  await expect(dialog).toBeVisible()
  await expect(page.locator('dialog[open]')).toHaveCount(1)
  await close.click()
  await expect(dialog).not.toBeVisible()
  await expect(submit).toBeFocused()

  await submit.click()
  await expect(dialog).toBeVisible()
  await understood.focus()
  await page.keyboard.press('Enter')
  await expect(dialog).not.toBeVisible()
  await expect(submit).toBeFocused()
  await expectValuesPreserved(page, false)
})

test('las validaciones permanecen junto a los campos y no abren un modal general', async ({
  page,
}) => {
  for (const register of [false, true]) {
    await page.goto(register ? '/crear-cuenta' : '/iniciar-sesion')
    await ready(page)
    await page
      .getByRole('button', {
        name: register ? 'Crear cuenta' : 'Iniciar sesión',
        exact: true,
      })
      .click()
    await expect(
      page.getByLabel(register ? 'Nombres' : 'Correo electrónico', {
        exact: true,
      }),
    ).toBeFocused()
    await expect(page.locator('.auth-field-error')).toHaveCount(
      register ? 5 : 2,
    )
    await expect(
      page.locator('.auth-form input[aria-invalid="true"]'),
    ).toHaveCount(register ? 5 : 2)
    await expect(page.locator('dialog[open]')).toHaveCount(0)
  }
})

test.describe('Avisos del proveedor aislado', () => {
  test.use({ authMode: 'anonymous' })

  test('cerrar un error contextual permite editar y un nuevo envío vuelve a informar el mismo error', async ({
    page,
    context,
  }) => {
    for (const action of ['session', 'sign-in'])
      await context.route(`**/__aroma_playwright__/auth/${action}?*`, (route) =>
        route.fulfill({
          status: 503,
          json: { code: 'network', message: 'PRIVATE_PROVIDER_RESPONSE' },
        }),
      )
    await page.goto('/iniciar-sesion')
    const dialog = page.getByRole('dialog', { name: 'No pudimos continuar' })
    await expect(dialog).toBeVisible()
    const text = await dialog.getByRole('alert').textContent()
    await dialog.getByRole('button', { name: 'Entendido' }).click()
    await fillValidForm(page, false)
    await expect(dialog).not.toBeVisible()
    await page.getByLabel('Correo electrónico').fill('otro@example.invalid')
    await expect(dialog).not.toBeVisible()
    await page
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('alert')).toHaveText(text!)
    await expect(page.getByText('PRIVATE_PROVIDER_RESPONSE')).toHaveCount(0)
    await expect(page.locator('dialog[open]')).toHaveCount(1)
  })

  test('un registro sin sesión informa el fallo sin desplazar ni vaciar el formulario', async ({
    page,
    context,
  }) => {
    await context.route('**/__aroma_playwright__/auth/sign-up?*', (route) =>
      route.fulfill({ json: null }),
    )
    await page.goto('/crear-cuenta')
    await ready(page)
    await fillValidForm(page, true)
    const before = await geometry(page)
    const submit = page.getByRole('button', {
      name: 'Crear cuenta',
      exact: true,
    })
    await submit.click()
    const dialog = page.getByRole('dialog', { name: 'No pudimos continuar' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('alert')).toHaveText(
      'No pudimos verificar tus datos. Inténtalo de nuevo.',
    )
    expectSameGeometry(before, await geometry(page), 'registro sin sesión')
    await dialog.getByRole('button', { name: 'Entendido' }).click()
    await expect(submit).toBeFocused()
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue(
      values.password,
    )
    await expect(page.getByLabel('Correo electrónico')).toHaveValue(
      values.email,
    )
  })
})
