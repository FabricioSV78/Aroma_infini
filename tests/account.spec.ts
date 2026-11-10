import { expect, test, type Page } from './test'

test.use({ authMode: 'customer' })

const demoOrderReference = 'AI-A1B2C3D4E5F60708'

async function activateDemoAccount(page: Page, path = '/cuenta') {
  await page.goto(path)
  await expect(page.locator('.account-page')).toBeVisible()
  await expect(
    page.getByText('Cargando tu cuenta…', { exact: true }),
  ).toHaveCount(0)
}

test('La cuenta exige una identidad verificada y cerrar sesion retira el acceso', async ({
  page,
  authFixture,
}) => {
  authFixture.setMode('anonymous')
  await page.goto('/cuenta')
  await expect(page).toHaveURL(/iniciar-sesion/)
  await expect(
    page.getByRole('heading', { name: 'Mi cuenta', exact: true }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ver mi cuenta' })).toHaveCount(
    0,
  )
  authFixture.setMode('customer')
  await activateDemoAccount(page)
  await expect(
    page.getByRole('heading', { name: 'Hola, Camila' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Salir de mi cuenta' }).click()
  await expect(page).toHaveURL(/iniciar-sesion/)
  await expect(page.getByRole('heading', { name: 'Hola, Camila' })).toHaveCount(
    0,
  )
})

test('Favoritos conserva el formato de cuenta activa y la vista independiente queda para invitados', async ({
  page,
  authFixture,
}) => {
  authFixture.setMode('anonymous')
  await page.goto('/favoritos')
  await expect(
    page.getByRole('heading', { name: 'Tus favoritos' }),
  ).toBeVisible()
  await expect(page.locator('.account-page')).toHaveCount(0)

  authFixture.setMode('customer')
  await activateDemoAccount(page)
  await page
    .locator('.account-sidebar')
    .getByRole('link', { name: 'Favoritos' })
    .click()
  await expect(page).toHaveURL('/cuenta/favoritos')
  await expect(page.locator('.account-page')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Favoritos' })).toBeVisible()
  await expect(
    page.locator('.account-sidebar').getByRole('link', { name: 'Favoritos' }),
  ).toHaveAttribute('aria-current', 'page')

  await page.getByRole('link', { name: 'Explorar tienda' }).click()
  await page.getByRole('link', { name: 'Ver Bois Clair' }).first().click()
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await page.getByRole('link', { name: 'Favoritos, 1 guardado' }).click()
  await expect(page).toHaveURL('/cuenta/favoritos')
  await expect(page.locator('.account-content .product-card')).toHaveCount(1)

  await page
    .locator('.account-sidebar')
    .getByRole('link', { name: 'Resumen' })
    .click()
  await page.getByRole('link', { name: 'Ver favoritos' }).click()
  await expect(page).toHaveURL('/cuenta/favoritos')

  await page.getByRole('button', { name: 'Salir de mi cuenta' }).click()
  await page.getByRole('link', { name: 'Favoritos, 1 guardado' }).click()
  await expect(page).toHaveURL('/favoritos')
  await expect(
    page.getByRole('heading', { name: 'Tus favoritos' }),
  ).toBeVisible()
})

test('Los datos y la dirección se conservan al recargar durante la sesión de la cuenta', async ({
  page,
}) => {
  await activateDemoAccount(page)

  await page.getByRole('link', { name: 'Mis datos' }).click()
  await page.getByLabel('Nombre').fill('Ariana')
  await expect(page.getByLabel('Correo electrónico')).toHaveAttribute(
    'readonly',
    '',
  )
  await page.getByLabel('Celular').fill('912345678')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(
    page.locator('.account-form-actions [role="status"]'),
  ).toContainText('Cambios guardados.')
  await page.getByRole('link', { name: 'Resumen' }).click()
  await expect(
    page.getByRole('heading', { name: 'Hola, Ariana' }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Direcciones' }).click()
  await page.getByRole('button', { name: 'Eliminar dirección' }).click()
  await expect(
    page.getByRole('heading', { name: 'No hay una dirección guardada' }),
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'No hay una dirección guardada' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Añadir dirección' }).click()
  await expect(page.getByLabel('Distrito')).toHaveValue('')
  await page.getByLabel('Etiqueta de la dirección').fill('Casa')
  await page.getByLabel('Nombre de quien recibe').fill('Ariana Torres')
  await page.getByLabel('Zona de entrega').selectOption('lima')
  await page.getByLabel('Distrito').selectOption('150122')
  await page
    .getByRole('textbox', { name: 'Dirección', exact: true })
    .fill('Calle propia 123')
  await page.getByRole('button', { name: 'Guardar dirección' }).click()
  await expect(
    page.getByText('Dirección guardada.', { exact: true }),
  ).toBeVisible()

  const stored = await page.evaluate(() => JSON.stringify(localStorage))
  expect(stored).not.toContain('Ariana')
  expect(stored).not.toContain('Dirección registrada')

  await page.reload()
  await expect(
    page.getByRole('textbox', { name: 'Dirección', exact: true }),
  ).toHaveValue('Calle propia 123')
  await page.getByRole('link', { name: 'Resumen' }).click()
  await expect(
    page.getByRole('heading', { name: 'Hola, Ariana' }),
  ).toBeVisible()
})

test('El historial conecta pedido, estado, entrega y pago simulado', async ({
  page,
}) => {
  await activateDemoAccount(page, '/cuenta/pedidos')

  await expect(page.getByText(demoOrderReference)).toBeVisible()
  await page.getByRole('link', { name: 'Ver pedido' }).click()
  await expect(page).toHaveURL(`/cuenta/pedidos/${demoOrderReference}`)
  await expect(page.getByRole('heading', { name: 'En camino' })).toBeVisible()
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
  await expect(
    page.getByRole('heading', { name: 'Pagos', level: 1 }),
  ).toBeVisible()
  await expect(page.getByText('Mercado Pago', { exact: true })).toBeVisible()
  await expect(page.locator('input')).toHaveCount(0)
  await expect(page.getByText(/Los datos de tarjeta/)).toBeVisible()
  await expect(page.getByText(/transferencia/i)).toHaveCount(0)
})

test('La cuenta contempla historial vacío y pedido inexistente', async ({
  page,
  authFixture,
}) => {
  authFixture.setAccountMode('empty')
  await activateDemoAccount(page, '/cuenta/pedidos?demo=empty')
  await expect(
    page.getByRole('heading', { name: 'Aún no hay pedidos' }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Resumen' }).click()
  await page.goto('/cuenta/pedidos/AI-DEMO-NO-EXISTE')
  await expect(
    page.getByRole('heading', {
      name: 'No encontramos ese pedido',
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
    page.getByRole('heading', { name: 'Hola, Camila' }),
  ).toBeInViewport()

  await menu.click()
  await expect(menu).toHaveAttribute('aria-expanded', 'true')
  await expect(navigation).toBeVisible()
  await navigation.getByRole('link', { name: 'Mis pedidos' }).click()

  await expect(page).toHaveURL('/cuenta/pedidos')
  await expect(navigation).toBeHidden()
  await expect(menu).toContainText('Mis pedidos')
  await expect(page.getByRole('heading', { name: 'Mis pedidos' })).toBeVisible()

  await menu.click()
  await navigation.getByRole('link', { name: 'Favoritos' }).click()
  await expect(page).toHaveURL('/cuenta/favoritos')
  await expect(navigation).toBeHidden()
  await expect(menu).toContainText('Favoritos')
  await expect(page.getByRole('heading', { name: 'Favoritos' })).toBeVisible()
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
      page.getByRole('heading', { name: 'Mis pedidos' }),
    ).toBeVisible()
    const hasOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )

    expect(hasOverflow).toBe(false)
    expect(browserErrors).toEqual([])
  })
}
