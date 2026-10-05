import { expect, test } from '@playwright/test'

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`Precio: campos, aplicación y limpieza a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/tienda')
    if (width < 1024)
      await page.getByRole('button', { name: /^Filtros/ }).click()
    const form = page.locator('.catalog-filter-form:visible')
    const minimum = form.getByRole('spinbutton', { name: 'Mínimo' })
    const maximum = form.getByRole('spinbutton', { name: 'Máximo' })
    await minimum.fill('600')
    await maximum.fill('630')
    await form.locator('.catalog-price-fields').screenshot({
      path: `artifacts/price-fields-${width}.png`,
    })
    await form.getByRole('button', { name: 'Aplicar filtros' }).click()
    await expect(page).toHaveURL(/min=600&max=630/)
    await expect(page.locator('.product-card')).toHaveCount(1)
    if (width < 1024)
      await page.getByRole('button', { name: /^Filtros/ }).click()
    await form.getByRole('button', { name: 'Limpiar selección' }).click()
    await expect(minimum).toHaveValue('')
    await expect(maximum).toHaveValue('')
    await form.getByRole('button', { name: 'Aplicar filtros' }).click()
    await expect(page).toHaveURL('/tienda')
    await expect(page.locator('.product-card')).toHaveCount(8)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
  })
}

test('Precio máximo debe ser mayor o igual al mínimo', async ({ page }) => {
  await page.goto('/tienda')
  const form = page.locator('.catalog-sidebar .catalog-filter-form')
  await form.getByRole('spinbutton', { name: 'Mínimo' }).fill('650')
  const maximum = form.getByRole('spinbutton', { name: 'Máximo' })
  await maximum.fill('600')
  await form.getByRole('button', { name: 'Aplicar filtros' }).click()
  await expect(maximum).toHaveJSProperty(
    'validationMessage',
    'El precio máximo debe ser mayor o igual al mínimo.',
  )
  await expect(page).toHaveURL('/tienda')
})

test('El botón se llena y se vacía de izquierda a derecha', async ({ page }) => {
  await page.goto('/producto/bois-clair')
  const button = page.locator('.product-cart-button')
  await button.screenshot({ path: 'artifacts/cart-button-light.png' })
  const scale = () =>
    button.evaluate((node) =>
      Number(
        getComputedStyle(node, '::before')
          .transform.split('(')[1]
          .split(',')[0],
      ),
    )
  const origin = () =>
    button.evaluate((node) =>
      Number.parseFloat(getComputedStyle(node, '::before').transformOrigin),
    )
  const width = await button.evaluate((node) => node.clientWidth)
  expect(await scale()).toBe(0)
  expect(await origin()).toBeGreaterThan(width * 0.95)
  await button.hover()
  expect(await origin()).toBe(0)
  await expect.poll(scale).toBe(1)
  await button.screenshot({ path: 'artifacts/cart-button-filled.png' })
  await page.mouse.move(0, 0)
  expect(await origin()).toBeGreaterThan(width * 0.95)
  await expect.poll(scale).toBe(0)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(
    await button.evaluate((node) =>
      parseFloat(getComputedStyle(node, '::before').transitionDuration),
    ),
  ).toBeLessThan(0.001)
})
