import { expect, test } from './test'

test('el menú prepara solo el código de la opción señalada y comunica su carga sin consultar datos privados', async ({
  page,
}) => {
  await page.goto('/admin/productos')
  await expect(page.locator('main h1')).toHaveText('Productos')
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let modules = 0
  const privateReads: string[] = []
  page.on('request', (request) => {
    if (/\/rest\/v1\/rpc\/admin_|\/api\/admin\//.test(request.url()))
      privateReads.push(new URL(request.url()).pathname)
  })
  await page.route(
    '**/src/features/admin/AdminShippingPage.tsx*',
    async (route) => {
      modules++
      await gate
      await route.continue()
    },
  )
  const link = page
    .getByRole('navigation', { name: 'Navegación administrativa' })
    .getByRole('link', { name: 'Tarifas de envío', exact: true })
  try {
    await link.hover()
    await expect.poll(() => modules).toBe(1)
    await expect(page.locator('main h1')).toHaveText('Productos')
    expect(privateReads).toEqual([])
    await link.click()
    await expect(link).toHaveClass(/is-pending/)
    await expect(
      page.locator('.ui-navigation-status[role="status"]'),
    ).toContainText('Cargando la página')
    release()
    await expect(
      page.getByLabel('Courier en Lima (S/)', { exact: true }),
    ).toBeVisible()
    await expect(link).not.toHaveClass(/is-pending/)
    expect(modules).toBe(1)
  } finally {
    release()
  }
})

test('el modo de ahorro de datos evita la precarga por intención y conserva la navegación', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true, effectiveType: '4g' },
    }),
  )
  await page.goto('/admin/productos')
  await expect(page.locator('main h1')).toHaveText('Productos')
  let modules = 0
  await page.route(
    '**/src/features/admin/AdminShippingPage.tsx*',
    async (route) => {
      modules++
      await route.continue()
    },
  )
  const link = page
    .getByRole('navigation', { name: 'Navegación administrativa' })
    .getByRole('link', { name: 'Tarifas de envío', exact: true })
  await link.hover()
  await link.focus()
  // Await actual browser frames after both intent handlers, not a navigation.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
  expect(modules).toBe(0)
  await page.keyboard.press('Enter')
  await expect(
    page.getByLabel('Courier en Lima (S/)', { exact: true }),
  ).toBeVisible()
  expect(modules).toBe(1)
})
