import { mkdir, writeFile } from 'node:fs/promises'
import { expect, test, type Page } from './test'

const artifactRoot = 'artifacts/auth-field-feedback-2026-10-26'
const views = [
  { name: 'login', path: '/admin/login', submit: 'Iniciar sesión' },
] as const
type AdminView = (typeof views)[number]

const values = {
  email: 'administracion-prueba@example.invalid',
  password: 'Clave-privada-solo-de-prueba-123',
}

async function ready(page: Page, view: AdminView) {
  await page.goto(view.path)
  await expect(page.locator('.admin-auth .auth-form')).toBeVisible()
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].map((image) => image.decode()))
  })
}

async function fillValidForm(page: Page, view: AdminView) {
  await page.getByLabel('Correo electrónico').fill(values.email)
  if (view.name === 'login')
    await page.getByLabel('Contraseña', { exact: true }).fill(values.password)
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const selectors = [
      '.admin-auth-header',
      '.admin-auth-main',
      '.auth-form-panel',
      '.auth-form-heading',
      '.auth-form',
      '.auth-submit',
      '.admin-auth-footer',
      ...[...document.querySelectorAll('.auth-form input')].map(
        (input) => `#${input.id}`,
      ),
    ]
    return {
      scrollY,
      boxes: Object.fromEntries(
        selectors.map((selector) => {
          const rect = document.querySelector(selector)!.getBoundingClientRect()
          return [
            selector,
            { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          ]
        }),
      ),
      primaryColor: getComputedStyle(document.querySelector('.auth-submit')!)
        .backgroundColor,
      surfaceColor: getComputedStyle(
        document.querySelector('.auth-form-panel')!,
      ).backgroundColor,
    }
  })
}

function expectSameGeometry(
  before: Awaited<ReturnType<typeof geometry>>,
  after: Awaited<ReturnType<typeof geometry>>,
) {
  expect(after.scrollY).toBe(before.scrollY)
  expect(after.primaryColor).toBe(before.primaryColor)
  expect(after.surfaceColor).toBe(before.surfaceColor)
  for (const [selector, original] of Object.entries(before.boxes)) {
    for (const [dimension, value] of Object.entries(original)) {
      const next = after.boxes[selector][dimension as keyof typeof original]
      expect(
        Math.abs(next - value),
        `${selector}.${dimension}: el modal no desplaza el acceso`,
      ).toBeLessThanOrEqual(1)
    }
  }
}

test.describe('Mensajes administrativos sin autenticación configurada', () => {
  test.use({ authMode: 'unconfigured' })

  for (const width of [1440, 390]) {
    test(`los errores de campo quedan debajo de su input en ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await mkdir(artifactRoot, { recursive: true })
      for (const view of views) {
        await ready(page, view)
        await page
          .getByRole('button', { name: view.submit, exact: true })
          .click()
        await expect(page.getByLabel('Correo electrónico')).toBeFocused()
        await expect(page.locator('dialog[open]')).toHaveCount(0)
        await expect(page.locator('.auth-field-error')).toHaveCount(
          view.name === 'login' ? 2 : 1,
        )

        const invalidFields = page.locator(
          '.auth-form input[aria-invalid="true"]',
        )
        for (const input of await invalidFields.all()) {
          const id = await input.getAttribute('id')
          const error = page.locator(`#${id}-error`)
          await expect(input).toHaveAttribute('aria-describedby', `${id}-error`)
          await expect(error).toBeVisible()
          expect(
            await input.evaluate((element) =>
              element
                .closest('.auth-field')
                ?.contains(document.getElementById(`${element.id}-error`)),
            ),
          ).toBe(true)
          const inputBox = (await input.boundingBox())!
          const errorBox = (await error.boundingBox())!
          expect(errorBox.y).toBeGreaterThanOrEqual(
            inputBox.y + inputBox.height,
          )
          expect(errorBox.y - inputBox.y - inputBox.height).toBeLessThanOrEqual(
            12,
          )
        }
        await page.screenshot({
          path: `${artifactRoot}/admin-${view.name}-fields-${width}.png`,
          fullPage: true,
          animations: 'disabled',
        })

        await page.getByLabel('Correo electrónico').fill('correo-incompleto')
        await page
          .getByRole('button', { name: view.submit, exact: true })
          .click()
        await expect(page.locator('#auth-email-error')).toHaveText(
          'Escribe un correo electrónico válido.',
        )
        await expect(page.locator('dialog[open]')).toHaveCount(0)
        await page.getByLabel('Correo electrónico').fill(values.email)
        await expect(page.locator('#auth-email-error')).toHaveCount(0)
        await expect(page.getByLabel('Correo electrónico')).toHaveAttribute(
          'aria-invalid',
          'false',
        )
      }
    })
  }

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    test(`el error general abre un modal sin mover el formulario en ${viewport.width}px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await mkdir(artifactRoot, { recursive: true })
      const results = []
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))

      for (const view of views) {
        await ready(page, view)
        await fillValidForm(page, view)
        const before = await geometry(page)
        const submit = page.getByRole('button', {
          name: view.submit,
          exact: true,
        })
        await submit.click()
        const dialog = page.getByRole('dialog', {
          name: 'No pudimos continuar',
        })
        await expect(dialog).toBeVisible()
        await expect(dialog.getByRole('alert')).toContainText(
          'No se puede iniciar sesión en este momento. Vuelve a intentarlo más tarde.',
        )
        await expect(page.locator('dialog[open]')).toHaveCount(1)
        await expect(page.locator('.auth-field-error')).toHaveCount(0)
        await expect(
          page.locator('.auth-form input[aria-invalid="true"]'),
        ).toHaveCount(0)
        const opened = await geometry(page)
        expectSameGeometry(before, opened)
        await expect(page.getByLabel('Correo electrónico')).toHaveValue(
          values.email,
        )
        if (view.name === 'login')
          await expect(
            page.getByLabel('Contraseña', { exact: true }),
          ).toHaveValue(values.password)
        const confirm = dialog.getByRole('button', {
          name: 'Entendido',
          exact: true,
        })
        expect(
          await confirm.evaluate(
            (button) => getComputedStyle(button).backgroundColor,
          ),
        ).toBe(before.primaryColor)
        await page.screenshot({
          path: `${artifactRoot}/admin-${view.name}-general-${viewport.width}.png`,
          fullPage: true,
          animations: 'disabled',
        })
        await confirm.click()
        await expect(dialog).not.toBeVisible()
        await expect(submit).toBeFocused()
        const closed = await geometry(page)
        expectSameGeometry(before, closed)
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
        ).toBe(false)
        results.push({ view: view.name, before, opened, closed })
      }
      expect(errors).toEqual([])
      await writeFile(
        `${artifactRoot}/admin-${viewport.width}.json`,
        JSON.stringify({ viewport, results, errors }, null, 2),
      )
    })
  }

  test('el modal administrativo mantiene el foco y permite cerrar con Escape o Enter', async ({
    page,
  }) => {
    const view = views[0]
    await ready(page, view)
    await fillValidForm(page, view)
    const submit = page.getByRole('button', { name: view.submit, exact: true })
    const dialog = page.getByRole('dialog', { name: 'No pudimos continuar' })
    await submit.click()
    await expect(dialog).toBeVisible()
    const close = dialog.getByRole('button', { name: 'Cerrar', exact: true })
    const confirm = dialog.getByRole('button', {
      name: 'Entendido',
      exact: true,
    })
    await confirm.focus()
    await page.keyboard.press('Tab')
    await expect(close).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(confirm).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(submit).toBeFocused()
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue(
      values.password,
    )

    await submit.click()
    await expect(dialog).toBeVisible()
    await confirm.focus()
    await page.keyboard.press('Enter')
    await expect(dialog).not.toBeVisible()
    await expect(submit).toBeFocused()
    await expect(page.locator('dialog[open]')).toHaveCount(0)
  })
})

test.describe('Errores generales del proveedor aislado', () => {
  test.use({ authMode: 'anonymous' })

  for (const scenario of [
    {
      name: 'red al acceder',
      view: views[0],
      action: 'sign-in',
      network: true,
    },
    {
      name: 'credenciales sin sesión',
      view: views[0],
      action: 'sign-in',
      network: false,
    },
  ]) {
    test(`${scenario.name}: error general sin atribuirlo a un campo ni perder datos`, async ({
      page,
      context,
    }) => {
      let requests = 0
      await context.route(
        `**/__aroma_playwright__/auth/${scenario.action}?*`,
        async (route) => {
          requests++
          if (scenario.network)
            await route.fulfill({
              status: 503,
              json: { code: 'network', message: 'PRIVATE_PROVIDER_RESPONSE' },
            })
          else await route.fulfill({ json: null })
        },
      )
      await ready(page, scenario.view)
      await fillValidForm(page, scenario.view)
      await page
        .getByRole('button', { name: scenario.view.submit, exact: true })
        .click()
      const dialog = page.getByRole('dialog', { name: 'No pudimos continuar' })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('alert')).toHaveText(
        scenario.network
          ? 'No pudimos completar la solicitud. Inténtalo de nuevo.'
          : 'No pudimos iniciar sesión. Revisa tu correo y contraseña.',
      )
      await expect(page.getByText('PRIVATE_PROVIDER_RESPONSE')).toHaveCount(0)
      await expect(page.locator('.auth-field-error')).toHaveCount(0)
      await expect(
        page.locator('.auth-form input[aria-invalid="true"]'),
      ).toHaveCount(0)
      await expect(page.getByLabel('Correo electrónico')).toHaveValue(
        values.email,
      )
      if (scenario.view.name === 'login')
        await expect(
          page.getByLabel('Contraseña', { exact: true }),
        ).toHaveValue(values.password)
      expect(requests).toBe(1)
      await expect(page.locator('.admin-sidebar')).toHaveCount(0)
      await expect(page).toHaveURL(scenario.view.path)
      await dialog.getByRole('button', { name: 'Entendido' }).click()
      await expect(dialog).not.toBeVisible()
      await expect(
        page.getByRole('button', { name: scenario.view.submit, exact: true }),
      ).toBeFocused()
    })
  }
})
