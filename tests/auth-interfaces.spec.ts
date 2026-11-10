import { mkdir, writeFile } from 'node:fs/promises'
import { expect, test, type Page } from './test'
import { safeAuthReturn } from '../src/domain/auth-navigation'

const unavailableMessage =
  'No pudimos conectar con el acceso a tu cuenta. Vuelve a intentarlo más tarde.'

async function completeRegistration(page: Page) {
  await page.goto('/crear-cuenta?returnTo=%2Fcuenta%2Fpedidos')
  await page.getByLabel('Nombres', { exact: true }).fill('Ana')
  await page.getByLabel('Apellidos', { exact: true }).fill('Torres')
  await page.getByLabel('Celular', { exact: true }).fill('912345678')
  await page.getByLabel('Correo electrónico').fill('ana@example.invalid')
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill('Una-frase-privada-larga')
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
}

test.describe('Autenticación sin proveedor configurado', () => {
  test.use({ authMode: 'unconfigured' })
  test('el selector superior funciona con teclado y conserva el destino de compra', async ({
    page,
  }) => {
    await page.goto('/iniciar-sesion?returnTo=%2Fcheckout')
    const choices = page.getByRole('navigation', {
      name: 'Acceso a tu cuenta',
    })
    await choices.getByRole('link', { name: 'Iniciar sesión' }).focus()
    await page.keyboard.press('Tab')
    await expect(
      choices.getByRole('link', { name: 'Crear cuenta' }),
    ).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/crear-cuenta?returnTo=%2Fcheckout')
    await expect(
      choices.getByRole('link', { name: 'Crear cuenta' }),
    ).toHaveAttribute('aria-current', 'page')
    await expect(page.getByLabel('Nombres', { exact: true })).toBeVisible()
    await choices.getByRole('link', { name: 'Iniciar sesión' }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/iniciar-sesion?returnTo=%2Fcheckout')
    await expect(page.getByLabel('Nombres', { exact: true })).toHaveCount(0)
    await expect(page.locator('.auth-editorial img')).toBeVisible()
    await expect(page.locator('.auth-tabs')).toHaveCount(1)
  })

  test('admin y rutas internas llevan al acceso sin admitir flags locales', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem('isAdmin', 'true')
      sessionStorage.setItem(
        'aroma-infini-account-session-v1',
        JSON.stringify({
          active: true,
          profile: { firstName: 'Camila' },
          orders: [],
        }),
      )
    })
    for (const path of [
      '/admin',
      '/admin/productos/nuevo',
      '/admin/pedidos/AI-210926-01',
    ]) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/admin\/login\?returnTo=/)
      await expect(
        page.getByRole('heading', { name: 'Acceso administrativo' }),
      ).toBeVisible()
      expect(new URL(page.url()).searchParams.get('returnTo')).toBe(path)
      await expect(page.locator('.admin-sidebar')).toHaveCount(0)
      await expect(
        page.getByRole('link', { name: 'Crear cuenta' }),
      ).toHaveCount(0)
      await expect(
        page.getByRole('button', { name: 'Continuar con Google' }),
      ).toHaveCount(0)
    }
  })

  test('Mi cuenta exige acceso y no muestra perfiles antiguos ni pedidos', async ({
    page,
  }) => {
    await page.goto('/')
    await page.locator('.desktop-access[aria-label="Mi cuenta"]').click()
    await expect(page).toHaveURL(/iniciar-sesion/)
    await expect(
      page.getByRole('heading', { name: 'Mi cuenta', exact: true }),
    ).toBeVisible()
    await expect(page.getByText(/Camila|AI-A1B2C3D4E5F60708/)).toHaveCount(0)
    await page.goto('/cuenta/pedidos/AI-A1B2C3D4E5F60708')
    await expect(page).toHaveURL(/iniciar-sesion/)
    expect(new URL(page.url()).searchParams.get('returnTo')).toBe(
      '/cuenta/pedidos/AI-A1B2C3D4E5F60708',
    )
  })

  test('valida campos, permite mostrar la contraseña y nunca concede un inicio ficticio', async ({
    page,
  }) => {
    await page.goto('/iniciar-sesion?returnTo=%2Fcheckout')
    await page
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click()
    await expect(page.getByLabel('Correo electrónico')).toBeFocused()
    await expect(
      page.getByText('Escribe un correo electrónico válido.'),
    ).toBeVisible()
    await page.getByLabel('Correo electrónico').fill('mal@')
    await page
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click()
    await expect(page.getByLabel('Correo electrónico')).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    await page.getByLabel('Correo electrónico').fill('cliente@example.invalid')
    await page
      .getByLabel('Contraseña', { exact: true })
      .fill('Una-clave-privada-123')
    await page
      .getByRole('button', { name: 'Mostrar contraseña', exact: true })
      .click()
    await expect(
      page.getByLabel('Contraseña', { exact: true }),
    ).toHaveAttribute('type', 'text')
    await page
      .getByRole('button', { name: 'Ocultar contraseña', exact: true })
      .click()
    await page
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click()
    await expect(page.getByRole('alert')).toContainText(unavailableMessage)
    await expect(page.getByLabel('Correo electrónico')).toHaveValue(
      'cliente@example.invalid',
    )
    await expect(page).toHaveURL(/iniciar-sesion/)
    const storage = await page.evaluate(() =>
      JSON.stringify({ local: localStorage, session: sessionStorage }),
    )
    expect(storage).not.toContain('Una-clave-privada-123')
    expect(storage).not.toContain('cliente@example.invalid')
  })

  test('registro conserva validaciones y ofrece la recuperación de contraseña', async ({
    page,
  }) => {
    await page.goto('/iniciar-sesion?returnTo=%2Fcheckout')
    await page.getByRole('link', { name: 'Crear cuenta', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible()
    expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/checkout')
    await page
      .getByRole('button', { name: 'Crear cuenta', exact: true })
      .click()
    await expect(page.getByLabel('Nombres', { exact: true })).toBeFocused()
    await page.getByLabel('Nombres', { exact: true }).fill('Ana')
    await page.getByLabel('Apellidos', { exact: true }).fill('Torres')
    await page.getByLabel('Celular', { exact: true }).fill('912345678')
    await page.getByLabel('Correo electrónico').fill('ana@example.invalid')
    await page.getByLabel('Contraseña', { exact: true }).fill('corta')
    await page
      .getByRole('button', { name: 'Crear cuenta', exact: true })
      .click()
    await expect(
      page.getByText('Usa al menos 12 caracteres.', { exact: true }),
    ).toBeVisible()
    await page
      .getByLabel('Contraseña', { exact: true })
      .fill('Una-frase-muy-larga')
    await page
      .getByRole('button', { name: 'Crear cuenta', exact: true })
      .click()
    await expect(page.getByRole('alert')).toContainText(unavailableMessage)
    await expect(page.getByText(/Google|o con tu correo/)).toHaveCount(0)
    await expect(
      page.locator('img[src*="google"], .auth-google, .auth-divider'),
    ).toHaveCount(0)
    await page.getByRole('button', { name: 'Entendido', exact: true }).click()
    await page
      .getByRole('link', { name: 'Iniciar sesión', exact: true })
      .click()
    await expect(
      page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }),
    ).toBeVisible()
    await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click()
    await expect(page).toHaveURL(/\/recuperar-contrasena/)
    await expect(
      page.getByLabel('Código de recuperación', { exact: true }),
    ).toBeVisible()
    await page.goto('/restablecer-contrasena')
    await expect(
      page.getByLabel('Código de recuperación', { exact: true }),
    ).toBeVisible()
    await expect(
      page.getByLabel('Confirmar contraseña', { exact: true }),
    ).toBeVisible()
  })

  test('callback cancelado elimina detalles del proveedor y no redirige fuera de la tienda', async ({
    page,
  }) => {
    await page.goto(
      '/auth/callback?error=access_denied&error_description=private-debug-token&returnTo=https://evil.invalid',
    )
    await expect(page.locator('.auth-form')).toHaveCount(0)
    await expect(page).toHaveURL('/auth/callback')
    await expect(page.getByText('private-debug-token')).toHaveCount(0)
    await expect(page.getByText(/Google/)).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'Recuperar acceso' }),
    ).toHaveAttribute('href', /returnTo=%2Fcuenta/)
  })

  test('carrito y favoritos se conservan y checkout invitado sigue disponible', async ({
    page,
  }) => {
    await page.goto('/producto/bois-clair')
    await page.getByRole('button', { name: 'Añadir al carrito' }).click()
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.goto('/checkout')
    await expect(
      page.getByRole('radio', { name: /Como invitado/ }),
    ).toBeChecked()
    await page.getByRole('link', { name: /Con mi cuenta/ }).click()
    await expect(page).toHaveURL(/iniciar-sesion.*checkout/)
    await page.goto('/carrito')
    await expect(page.locator('.cart-page-lines .cart-line')).toHaveCount(1)
    await page.goto('/favoritos')
    await expect(page.locator('.product-card')).toHaveCount(1)
  })

  for (const viewport of [
    { name: 'monitor', width: 1920, height: 1080 },
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'laptop', width: 1366, height: 768 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 390, height: 844 },
  ])
    test(`interfaces completas y teclado en ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await mkdir('artifacts/auth-centered-2026-10-26/screens', {
        recursive: true,
      })
      for (const [name, path] of [
        ['cliente-login', '/iniciar-sesion'],
        ['cliente-registro', '/crear-cuenta'],
        ['admin-login', '/admin/login'],
      ]) {
        await page.goto(path)
        await expect(page.locator('.auth-form')).toBeVisible()
        await expect(page.getByText(/Google|o con tu correo/)).toHaveCount(0)
        await expect(
          page.locator('img[src*="google"], .auth-google, .auth-divider'),
        ).toHaveCount(0)
        await page.evaluate(async () => {
          await document.fonts.ready
          await Promise.all(
            [...document.images].map((image) =>
              image.decode().catch(() => undefined),
            ),
          )
        })
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          path,
        ).toBe(false)
        expect(
          await page.locator('img').evaluateAll((images) =>
            images
              .filter(
                (image): image is HTMLImageElement =>
                  image instanceof HTMLImageElement,
              )
              .filter((image) => image.currentSrc && !image.naturalWidth)
              .map((image) => image.src),
          ),
          path,
        ).toEqual([])
        const submit = page.locator('.auth-submit')
        const submitBox = await submit.boundingBox()
        expect(submitBox, `${path}: acción principal`).not.toBeNull()
        expect(
          submitBox!.height,
          `${path}: alto táctil`,
        ).toBeGreaterThanOrEqual(44)
        if (name === 'cliente-login' || name === 'cliente-registro') {
          const panelBox = await page.locator('.auth-form-panel').boundingBox()
          const formBox = await page.locator('.auth-form').boundingBox()
          expect(panelBox, `${path}: panel de acceso`).not.toBeNull()
          expect(formBox, `${path}: formulario`).not.toBeNull()
          expect(
            formBox!.width,
            `${path}: formulario legible`,
          ).toBeGreaterThanOrEqual(300)
          expect(
            formBox!.width,
            `${path}: ancho de lectura`,
          ).toBeLessThanOrEqual(440)
          const choices = page.getByRole('navigation', {
            name: 'Acceso a tu cuenta',
          })
          await expect(choices.getByRole('link')).toHaveCount(2)
          await expect(choices.locator('[aria-current="page"]')).toHaveText(
            name === 'cliente-login' ? 'Iniciar sesión' : 'Crear cuenta',
          )
          const imageBox = await page.locator('.auth-editorial').boundingBox()
          expect(imageBox, `${path}: fotografía editorial`).not.toBeNull()
          if (viewport.name === 'mobile') {
            expect(imageBox!.y + imageBox!.height).toBeLessThanOrEqual(
              panelBox!.y,
            )
            expect(imageBox!.height).toBeLessThanOrEqual(128)
          } else {
            expect(imageBox!.x + imageBox!.width).toBeCloseTo(panelBox!.x)
            expect(imageBox!.height).toBeGreaterThanOrEqual(panelBox!.height)
          }
          await expect(
            page.locator('.auth-page .auth-availability'),
          ).toHaveCount(0)
          await expect(
            page.getByText('El acceso a cuentas todavía no está disponible.'),
          ).toHaveCount(0)
          await expect(page.locator('.auth-switch')).toHaveCount(0)
          if (viewport.name === 'mobile') {
            expect(
              submitBox!.y + submitBox!.height,
              `${path}: acción en primera vista móvil`,
            ).toBeLessThanOrEqual(viewport.height + 1)
          }
        }
        const email = page.getByLabel('Correo electrónico')
        await email.focus()
        await expect(email).toBeFocused()
        await page.keyboard.press('Tab')
        if (name === 'cliente-registro')
          await expect(
            page.getByLabel('Celular', { exact: true }),
          ).toBeFocused()
        else if (name.endsWith('login'))
          await expect(
            page.getByLabel('Contraseña', { exact: true }),
          ).toBeFocused()
        await page.screenshot({
          path: `artifacts/auth-centered-2026-10-26/screens/${name}-${viewport.name}.png`,
          fullPage: true,
          animations: 'disabled',
        })
      }
      expect(errors).toEqual([])
      await writeFile(
        `artifacts/auth-centered-2026-10-26/screens/${viewport.name}.json`,
        JSON.stringify({ viewport, errors }, null, 2),
      )
    })
})

test.describe('Contratos de identidad y permisos con adaptador aislado', () => {
  test.use({ authMode: 'customer' })
  test('un cliente verificado nunca entra como administrador', async ({
    page,
  }) => {
    await page.goto('/admin/pedidos')
    await expect(page).toHaveURL(/\/admin\/login/)
    await expect(page.getByRole('alert')).toContainText(
      'no tiene acceso administrativo',
    )
    await expect(page.locator('#admin-content')).toHaveCount(0)
  })
  test('rechaza datos de otro propietario y limpia la cuenta al expirar', async ({
    page,
    authFixture,
  }) => {
    authFixture.setAccountMode('foreign')
    await page.goto('/cuenta/pedidos')
    await expect(
      page.getByRole('heading', { name: 'No pudimos cargar tu cuenta' }),
    ).toBeVisible()
    await expect(page.locator('.account-order-list li')).toHaveCount(0)
    authFixture.setAccountMode('populated')
    await page.getByRole('button', { name: 'Volver a intentar' }).click()
    await expect(page.locator('.account-order-list li')).toHaveCount(1)
    authFixture.setMode('expired')
    await authFixture.publish(page)
    await expect(page).toHaveURL(/iniciar-sesion/)
    await expect(page.getByText(/Tu sesión terminó/)).toBeVisible()
    await expect(page.locator('.account-order-list')).toHaveCount(0)
  })

  test('la caducidad retira el acceso incluso sin un evento del proveedor', async ({
    page,
    context,
  }) => {
    await context.route('**/__aroma_playwright__/auth/session?*', (route) =>
      route.fulfill({
        json: {
          user: {
            id: 'test-customer-a',
            email: 'camila@example.invalid',
            role: 'customer',
          },
          expiresAt: Date.now() + 3000,
          intent: 'account',
        },
      }),
    )
    await page.goto('/cuenta/pedidos')
    await expect(page.locator('.account-order-list li')).toHaveCount(1)
    await expect(page).toHaveURL(/iniciar-sesion/, { timeout: 10000 })
    await expect(page.locator('.account-order-list')).toHaveCount(0)
    await expect(page.getByRole('status')).toContainText('Tu sesión terminó')
  })

  test('un cambio de identidad no conserva datos de la cuenta anterior', async ({
    page,
    context,
    authFixture,
  }) => {
    await page.goto('/cuenta/pedidos')
    await expect(page.locator('.account-order-list li')).toHaveCount(1)
    await context.route('**/__aroma_playwright__/auth/session?*', (route) =>
      route.fulfill({
        json: {
          user: {
            id: 'test-customer-b',
            email: 'otra@example.invalid',
            role: 'customer',
          },
          expiresAt: Date.now() + 60000,
          intent: 'account',
        },
      }),
    )
    await authFixture.publish(page)
    await expect(
      page.getByRole('heading', { name: 'No pudimos cargar tu cuenta' }),
    ).toBeVisible()
    await expect(page.locator('.account-order-list')).toHaveCount(0)
    await expect(page.getByText('AI-A1B2C3D4E5F60708')).toHaveCount(0)
  })
})

test.describe('Administrador verificado de prueba', () => {
  test.use({ authMode: 'admin' })
  test('entra directamente y salir revoca todas las rutas protegidas', async ({
    page,
  }) => {
    await page.goto('/admin/login?returnTo=%2Fadmin%2Fproductos')
    await expect(page).toHaveURL('/admin/productos')
    await expect(
      page.getByRole('heading', { name: 'Productos', exact: true }),
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Cerrar sesión', exact: true })
      .click()
    await expect(page).toHaveURL(/\/admin\/login/)
    await page.goto('/admin/pedidos')
    await expect(page).toHaveURL(/\/admin\/login/)
  })

  test('un fallo al cerrar el proveedor revoca de todos modos el acceso local', async ({
    page,
    context,
  }) => {
    await context.route('**/__aroma_playwright__/auth/sign-out?*', (route) =>
      route.fulfill({ status: 503, json: { message: 'Provider unavailable' } }),
    )
    await page.goto('/admin/productos')
    await page.getByRole('link', { name: 'Pedidos', exact: true }).click()
    await expect(page).toHaveURL('/admin/pedidos')
    await page
      .getByRole('button', { name: 'Cerrar sesión', exact: true })
      .click()
    await expect(page).toHaveURL(/\/admin\/login/)
    await page.goBack()
    await expect(page).toHaveURL(/\/admin\/login/)
    await expect(page.locator('#admin-content')).toHaveCount(0)
  })
})

test.describe('Respuestas del proveedor aisladas del frontend', () => {
  test.use({ authMode: 'anonymous' })

  test('un registro redirige solo tras verificar la sesión', async ({
    page,
    context,
    authFixture,
  }) => {
    await context.route(
      '**/__aroma_playwright__/auth/sign-up?*',
      async (route) => {
        authFixture.setMode('customer')
        await route.fulfill({ json: null })
      },
    )
    await completeRegistration(page)
    await expect(page).toHaveURL('/cuenta/pedidos')
    await expect(page.locator('.account-order-list li')).toHaveCount(1)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('registrarse después de salir verifica una sesión nueva sin reutilizar el acceso anterior', async ({
    page,
    context,
    authFixture,
  }) => {
    authFixture.setMode('customer')
    await page.goto('/cuenta/pedidos')
    await expect(page.locator('.account-order-list li')).toHaveCount(1)
    await page.getByRole('button', { name: 'Salir de mi cuenta' }).click()
    await expect(page).toHaveURL(/\/iniciar-sesion/)
    await expect(page.locator('.account-order-list')).toHaveCount(0)
    await context.route(
      '**/__aroma_playwright__/auth/sign-up?*',
      async (route) => {
        authFixture.setMode('customer')
        await route.fulfill({ json: null })
      },
    )
    // Stay in the SPA: a document reload would discard the sign-out lock.
    await page.getByRole('link', { name: 'Crear cuenta', exact: true }).click()
    await page.getByLabel('Nombres', { exact: true }).fill('Ana')
    await page.getByLabel('Apellidos', { exact: true }).fill('Torres')
    await page.getByLabel('Celular', { exact: true }).fill('912345678')
    await page.getByLabel('Correo electrónico').fill('ana@example.invalid')
    await page
      .getByLabel('Contraseña', { exact: true })
      .fill('Una-frase-privada-larga')
    await page
      .getByRole('button', { name: 'Crear cuenta', exact: true })
      .click()
    await expect(page).toHaveURL('/cuenta/pedidos')
    await expect(page.locator('.account-order-list li')).toHaveCount(1)
    await expect(page.locator('#admin-content')).toHaveCount(0)
  })

  test('un registro sin sesión informa un error sin inventar acceso ni envío de correo', async ({
    page,
    context,
  }) => {
    await context.route('**/__aroma_playwright__/auth/sign-up?*', (route) =>
      route.fulfill({ json: null }),
    )
    await completeRegistration(page)
    await expect(page.getByRole('alert')).toHaveText(
      'No pudimos verificar tus datos. Inténtalo de nuevo.',
    )
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue(
      'Una-frase-privada-larga',
    )
    await expect(page).toHaveURL(/\/crear-cuenta/)
    await page.goto('/cuenta/pedidos')
    await expect(page).toHaveURL(/\/iniciar-sesion/)
    await expect(page.locator('.account-order-list')).toHaveCount(0)
  })

  test('un error conserva los datos y el envío pendiente no se duplica', async ({
    page,
    context,
  }) => {
    let calls = 0
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    await context.route(
      '**/__aroma_playwright__/auth/sign-in?*',
      async (route) => {
        calls++
        await pending
        await route.fulfill({
          status: 503,
          json: { message: 'PRIVATE_SDK_RESPONSE', code: 'network' },
        })
      },
    )
    await page.goto('/iniciar-sesion')
    await page.getByLabel('Correo electrónico').fill('cliente@example.invalid')
    await page
      .getByLabel('Contraseña', { exact: true })
      .fill('Una-clave-privada-123')
    await page
      .getByRole('button', { name: 'Iniciar sesión', exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Procesando…' }),
    ).toBeDisabled()
    await expect(page.getByLabel('Correo electrónico')).toBeDisabled()
    await expect(page.getByLabel('Contraseña', { exact: true })).toBeDisabled()
    await page.locator('.auth-form').evaluate((form) => {
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      )
    })
    expect(calls).toBe(1)
    release()
    await expect(page.getByRole('alert')).toContainText(
      'No pudimos completar la solicitud',
    )
    await expect(page.getByLabel('Correo electrónico')).toHaveValue(
      'cliente@example.invalid',
    )
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue(
      'Una-clave-privada-123',
    )
    await expect(page.getByText('PRIVATE_SDK_RESPONSE')).toHaveCount(0)
    await page.getByRole('button', { name: 'Entendido', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Iniciar sesión', exact: true }),
    ).toBeEnabled()
  })

  test('un fallo al verificar la sesión no muestra contenido privado', async ({
    page,
    context,
  }) => {
    await context.route('**/__aroma_playwright__/auth/session?*', (route) =>
      route.fulfill({ status: 503, json: { message: 'PRIVATE_SERVER_ERROR' } }),
    )
    await page.goto('/admin/productos')
    await expect(page).toHaveURL(/\/admin\/login/)
    await expect(page.getByRole('alert')).toContainText(
      'No pudimos completar la solicitud',
    )
    await expect(page.locator('#admin-content')).toHaveCount(0)
    await expect(page.getByText('PRIVATE_SERVER_ERROR')).toHaveCount(0)
  })
})

test.describe('Los estados antiguos de recuperación no conceden permisos', () => {
  test.use({ authMode: 'recovery' })
  for (const admin of [false, true])
    test(
      'no restaura permisos ' + (admin ? 'administrativos' : 'de cliente'),
      async ({ page, context }) => {
        let updates = 0
        await context.route(
          '**/__aroma_playwright__/auth/update-password?*',
          async (route) => {
            updates++
            await route.fulfill({ json: null })
          },
        )
        await page.goto(
          admin ? '/admin/restablecer' : '/restablecer-contrasena',
        )
        if (admin)
          await expect(
            page.getByRole('heading', {
              name: 'Recuperar acceso administrativo',
            }),
          ).toBeVisible()
        else
          await expect(
            page.getByLabel('Código de recuperación', { exact: true }),
          ).toBeVisible()
        expect(updates).toBe(0)
        await page.goto(admin ? '/admin/productos' : '/cuenta/pedidos')
        await expect(page).toHaveURL(
          admin ? /\/admin\/login/ : /\/iniciar-sesion/,
        )
        await expect(
          page.locator('.account-order-list,#admin-content'),
        ).toHaveCount(0)
      },
    )
})

test('destinos de retorno evitan orígenes externos, roles cruzados y bucles', () => {
  for (const unsafe of [
    'https://evil.invalid',
    '//evil.invalid',
    '/\\evil.invalid',
    '/%5Cevil.invalid',
    '/%2f%2fevil.invalid',
    '/iniciar-sesion',
    '/auth/callback',
    '/admin/login',
    '/admin/recuperar',
    '/admin/restablecer',
    '/admin/../admin/login',
  ]) {
    expect(safeAuthReturn(unsafe, 'admin')).toBe('/admin')
    expect(safeAuthReturn(unsafe, 'customer')).toBe('/cuenta')
  }
  expect(safeAuthReturn('/admin/pedidos?estado=received', 'admin')).toBe(
    '/admin/pedidos?estado=received',
  )
  expect(safeAuthReturn('/checkout', 'customer')).toBe('/checkout')
  expect(safeAuthReturn('/admin/pedidos', 'customer')).toBe('/cuenta')
})
