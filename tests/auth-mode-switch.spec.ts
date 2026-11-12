import { mkdir, writeFile } from 'node:fs/promises'
import { expect, test, type Page } from './test'

test.use({ authMode: 'unconfigured' })

const artifactRoot = 'artifacts/auth-centered-2026-10-26'
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
    await Promise.all(
      [
        ...document.querySelectorAll<HTMLImageElement>('.auth-editorial img'),
      ].map((image) => image.decode()),
    )
  })
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const selectors = {
      frame: '.auth-customer-layout--editorial',
      image: '.auth-editorial',
      selector: '.auth-tabs',
      content: '.auth-form-content',
      footer: '.site-footer',
    }
    return Object.fromEntries(
      Object.entries(selectors).map(([name, selector]) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect()
        return [
          name,
          { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        ]
      }),
    )
  })
}

async function expectCenteredForm(page: Page) {
  const offset = await page.evaluate(() => {
    const area = document
      .querySelector('.auth-form-content')!
      .getBoundingClientRect()
    const form = document.querySelector('.auth-form')!.getBoundingClientRect()
    const legal = document.querySelector('.auth-legal')?.getBoundingClientRect()
    return {
      horizontal: Math.abs(
        (form.left + form.right) / 2 - (area.left + area.right) / 2,
      ),
      vertical: Math.abs(
        (form.top + (legal?.bottom ?? form.bottom)) / 2 -
          (area.top + area.bottom) / 2,
      ),
    }
  })
  expect(offset.horizontal).toBeLessThanOrEqual(1)
  expect(offset.vertical).toBeLessThanOrEqual(1)
  await expect(page.locator('h1')).toHaveText('Mi cuenta')
  await expect(page.locator('.auth-form-heading')).toHaveClass(/sr-only/)
}

for (const viewport of viewports) {
  test(`imagen, selector y página permanecen estables al alternar en ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('/iniciar-sesion?returnTo=%2Fcheckout')
    await ready(page)
    await expectCenteredForm(page)
    const before = await geometry(page)
    const measurements = [before]
    await mkdir(`${artifactRoot}/screens`, { recursive: true })
    await page.screenshot({
      path: `${artifactRoot}/screens/login-${viewport.name}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    const choices = page.getByRole('navigation', { name: 'Acceso a tu cuenta' })
    for (const [index, label] of [
      'Crear cuenta',
      'Iniciar sesión',
      'Crear cuenta',
    ].entries()) {
      await choices.getByRole('link', { name: label, exact: true }).click()
      await expect(choices.locator('[aria-current="page"]')).toHaveText(label)
      await ready(page)
      await expectCenteredForm(page)
      const after = await geometry(page)
      for (const [name, original] of Object.entries(before)) {
        for (const [dimension, value] of Object.entries(original)) {
          const next = after[name][dimension as keyof typeof original]
          expect(
            Math.abs(next - value),
            `${viewport.name}: ${name}.${dimension}, cambio ${index + 1}`,
          ).toBeLessThanOrEqual(1)
        }
      }
      measurements.push(after)
      expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/checkout')
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false)
    }
    await page.screenshot({
      path: `${artifactRoot}/screens/register-${viewport.name}.png`,
      fullPage: true,
      animations: 'disabled',
    })

    // The choices stay visible at both offsets; switching must not reset scroll.
    for (const [top, label] of [
      [40, 'Iniciar sesión'],
      [80, 'Crear cuenta'],
    ] as const) {
      await page.evaluate(
        (position) => window.scrollTo({ top: position, behavior: 'instant' }),
        top,
      )
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(top)
      await choices.getByRole('link', { name: label, exact: true }).click()
      await expect(choices.locator('[aria-current="page"]')).toHaveText(label)
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(top)
    }
    expect(errors).toEqual([])
    await writeFile(
      `${artifactRoot}/screens/${viewport.name}.json`,
      JSON.stringify(
        { viewport, measurements, scrollOffsets: [40, 80], errors },
        null,
        2,
      ),
    )
  })
}

test('la alternancia por teclado conserva foco, destino de compra y posición de página', async ({
  page,
}) => {
  await page.goto('/iniciar-sesion?returnTo=%2Fcheckout')
  await ready(page)
  const choices = page.getByRole('navigation', { name: 'Acceso a tu cuenta' })
  await choices
    .getByRole('link', { name: 'Iniciar sesión', exact: true })
    .focus()
  await page.keyboard.press('Tab')
  await expect(
    choices.getByRole('link', { name: 'Crear cuenta', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/crear-cuenta?returnTo=%2Fcheckout')
  // History can update while React still shows the previous form. Its link
  // already has focus, so wait for the destination UI before testing focus.
  await expect(
    choices.getByRole('link', { name: 'Crear cuenta', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(
    choices.getByRole('link', { name: 'Crear cuenta', exact: true }),
  ).toBeFocused()
  expect(await page.evaluate(() => scrollY)).toBe(0)
  await page.keyboard.press('Shift+Tab')
  await expect(
    choices.getByRole('link', { name: 'Iniciar sesión', exact: true }),
  ).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/iniciar-sesion?returnTo=%2Fcheckout')
  await expect(
    choices.getByRole('link', { name: 'Iniciar sesión', exact: true }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(
    choices.getByRole('link', { name: 'Iniciar sesión', exact: true }),
  ).toBeFocused()
  expect(await page.evaluate(() => scrollY)).toBe(0)
})

test('cambiar de opción limpia contraseñas, visibilidad y validaciones del formulario anterior', async ({
  page,
}) => {
  await page.goto('/iniciar-sesion')
  await page.getByLabel('Correo electrónico').fill('correo-inválido')
  await page
    .getByLabel('Contraseña', { exact: true })
    .fill('Clave-solo-de-prueba-123')
  await page
    .getByRole('button', { name: 'Mostrar contraseña', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Iniciar sesión', exact: true })
    .click()
  await expect(page.getByLabel('Correo electrónico')).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  const choices = page.getByRole('navigation', { name: 'Acceso a tu cuenta' })
  await choices.getByRole('link', { name: 'Crear cuenta', exact: true }).click()
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveAttribute(
    'type',
    'password',
  )
  await expect(page.locator('.auth-field-error')).toHaveCount(0)
  await expect(page.getByLabel('Correo electrónico')).toHaveValue('')
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  await expect(page.getByLabel('Nombres', { exact: true })).toBeFocused()
  await expect(page.locator('.auth-field-error')).not.toHaveCount(0)
  await choices
    .getByRole('link', { name: 'Iniciar sesión', exact: true })
    .click()
  await expect(page.locator('.auth-field-error')).toHaveCount(0)
  await expect(page.getByLabel('Contraseña', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Correo electrónico')).toHaveAttribute(
    'aria-invalid',
    'false',
  )
})

for (const viewport of [viewports[1], viewports[4]]) {
  test(`movimiento reducido evita animación de contenido en ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/iniciar-sesion')
    const choices = page.getByRole('navigation', { name: 'Acceso a tu cuenta' })
    await choices
      .getByRole('link', { name: 'Crear cuenta', exact: true })
      .click()
    await expect(choices.locator('[aria-current="page"]')).toHaveText(
      'Crear cuenta',
    )
    expect(
      await page.locator('.auth-form-content').evaluate((element) => ({
        animation: getComputedStyle(element).animationName,
        animations: element.getAnimations().length,
      })),
    ).toEqual({ animation: 'none', animations: 0 })
    for (const selector of ['.auth-editorial', '.auth-tabs']) {
      expect(
        await page
          .locator(selector)
          .evaluate((element) => element.getAnimations().length),
      ).toBe(0)
    }
  })
}
