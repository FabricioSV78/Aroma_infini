import { expect, test, type Page } from '@playwright/test'

const demoOrderReference = 'AI-DEMO-A1B2C3D4E5F60708'

async function activateDemoAccount(page: Page, path = '/cuenta') {
  await page.goto(path)
  const accessButton = page.getByRole('button', {
    name: 'Explorar cuenta de demostración',
  })
  await expect(accessButton).toBeVisible()
  await accessButton.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText(/Cuenta de demostración/).first()).toBeVisible()
}

test('La cuenta diferencia el acceso futuro de la demostración sin pedir credenciales', async ({
  page,
}) => {
  await page.goto('/cuenta')

  await expect(
    page.getByRole('heading', { name: 'Tu universo, siempre cerca.' }),
  ).toBeVisible()
  await expect(page.getByText('Continuar con Google')).toBeVisible()
  await expect(page.getByText('Correo y contraseña')).toBeVisible()
  await expect(page.locator('input')).toHaveCount(0)

  await page
    .getByRole('button', { name: 'Explorar cuenta de demostración' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Hola, Cliente.' }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Resumen' })).toHaveAttribute(
    'aria-current',
    'page',
  )

  await page.getByRole('button', { name: 'Salir de la demostración' }).click()
  await expect(
    page.getByRole('heading', { name: 'Tu universo, siempre cerca.' }),
  ).toBeVisible()
})

test('Los datos y la dirección cambian solo durante la sesión de la cuenta', async ({
  page,
}) => {
  await activateDemoAccount(page)

  await page.getByRole('link', { name: 'Mis datos' }).click()
  await page.getByLabel('Nombre').fill('Ariana')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('status').last()).toContainText(
    'Cambios guardados durante esta sesión.',
  )
  await page.getByRole('link', { name: 'Resumen' }).click()
  await expect(
    page.getByRole('heading', { name: 'Hola, Ariana.' }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Direcciones' }).click()
  await page
    .getByRole('button', { name: 'Eliminar dirección de prueba' })
    .click()
  await expect(
    page.getByRole('heading', { name: 'No hay una dirección guardada.' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Restaurar ejemplo' }).click()
  await expect(page.getByLabel('Distrito')).toHaveValue('150122')

  const stored = await page.evaluate(() => JSON.stringify(localStorage))
  expect(stored).not.toContain('Ariana')
  expect(stored).not.toContain('Avenida de ejemplo 123')

  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Tu universo, siempre cerca.' }),
  ).toBeVisible()
})

test('El historial conecta pedido, estado, entrega y pago simulado', async ({
  page,
}) => {
  await activateDemoAccount(page, '/cuenta/pedidos')

  await expect(page.getByText(demoOrderReference)).toBeVisible()
  await page.getByRole('link', { name: 'Ver pedido' }).click()
  await expect(page).toHaveURL(`/cuenta/pedidos/${demoOrderReference}`)
  await expect(page.getByRole('heading', { name: 'En camino.' })).toBeVisible()
  await expect(
    page.locator('.account-order-timeline li[aria-current="step"]'),
  ).toContainText('En camino')
  await expect(page.getByText('Pétale Nu')).toBeVisible()
  const purchasedProduct = page.getByRole('link', { name: 'Ver Pétale Nu' })
  await expect(purchasedProduct).toBeVisible()
  await expect(purchasedProduct.locator('img')).toHaveAttribute(
    'src',
    '/images/petale-480.webp',
  )
  await expect(page.getByText(/^S\/\s*435$/).last()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Entrega' })).toBeVisible()

  await page.getByRole('link', { name: 'Pagos' }).click()
  await expect(page.getByRole('heading', { name: 'Pagos.' })).toBeVisible()
  await expect(page.getByText('Mercado Pago', { exact: true })).toBeVisible()
  await expect(page.locator('input')).toHaveCount(0)
  await expect(page.getByText(/CVV/)).toBeVisible()
  await expect(page.getByText(/transferencia/i)).toHaveCount(0)
})

test('La cuenta contempla historial vacío y pedido inexistente', async ({
  page,
}) => {
  await activateDemoAccount(page, '/cuenta/pedidos?demo=empty')
  await expect(
    page.getByRole('heading', { name: 'Aún no hay pedidos de prueba.' }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Resumen' }).click()
  await page.goto('/cuenta/pedidos/AI-DEMO-NO-EXISTE')
  await page
    .getByRole('button', { name: 'Explorar cuenta de demostración' })
    .click()
  await expect(
    page.getByRole('heading', {
      name: 'No encontramos ese pedido de prueba.',
    }),
  ).toBeVisible()
})

test('La navegación móvil de cuenta se abre bajo demanda y se repliega al elegir una sección', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await activateDemoAccount(page)

  const menu = page.locator('.account-menu-toggle')
  const navigation = page.locator('#account-navigation')
  await expect(menu).toBeVisible()
  await expect(menu).toHaveAttribute('aria-expanded', 'false')
  await expect(navigation).toBeHidden()
  await expect(
    page.getByRole('heading', { name: 'Hola, Cliente.' }),
  ).toBeInViewport()

  await menu.click()
  await expect(menu).toHaveAttribute('aria-expanded', 'true')
  await expect(navigation).toBeVisible()
  await navigation.getByRole('link', { name: 'Mis pedidos' }).click()

  await expect(page).toHaveURL('/cuenta/pedidos')
  await expect(navigation).toBeHidden()
  await expect(menu).toContainText('Mis pedidos')
  await expect(
    page.getByRole('heading', { name: 'Mis pedidos.' }),
  ).toBeVisible()
})

for (const width of [360, 375, 390, 430, 768, 1024, 1280, 1440]) {
  test(`La cuenta conserva su composición y evita overflow a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    const browserErrors: string[] = []
    page.on('pageerror', (error) => browserErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') browserErrors.push(message.text())
    })

    await activateDemoAccount(page, '/cuenta/pedidos')
    await expect(
      page.getByRole('heading', { name: 'Mis pedidos.' }),
    ).toBeVisible()
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )

    expect(hasOverflow).toBe(false)
    expect(browserErrors).toEqual([])
  })
}
