import { expect, test, type Locator } from '@playwright/test'

const group = (root: Locator, name: string) =>
  root.locator(`[data-filter-group="${name}"]`)

test('los cuatro grupos son independientes y responden al teclado en escritorio', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/tienda')
  const sidebar = page.getByRole('complementary', {
    name: 'Filtros de la tienda',
  })
  const brand = group(sidebar, 'brand')
  const gender = group(sidebar, 'gender')
  const family = group(sidebar, 'family')
  const price = group(sidebar, 'price')

  for (const section of [brand, gender, family, price]) {
    await expect(section).toHaveClass(/catalog-filter-group/)
    await expect(section.locator('summary')).toBeVisible()
  }
  await expect(brand).toHaveAttribute('open', '')
  await expect(family).toHaveAttribute('open', '')
  await expect(gender).not.toHaveAttribute('open', '')
  await expect(price).not.toHaveAttribute('open', '')

  await gender.locator('summary').focus()
  await page.keyboard.press('Enter')
  await expect(gender).toHaveAttribute('open', '')
  await price.locator('summary').focus()
  await page.keyboard.press('Space')
  await expect(price).toHaveAttribute('open', '')
  await expect(brand).toHaveAttribute('open', '')
  await expect(family).toHaveAttribute('open', '')

  await family.locator('summary').focus()
  await page.keyboard.press('Enter')
  await expect(family).not.toHaveAttribute('open', '')
  await expect(family.getByRole('checkbox', { name: 'Floral' })).toBeHidden()
  await expect(gender).toHaveAttribute('open', '')
  await expect(price).toHaveAttribute('open', '')
})

test('contraer conserva las selecciones y muestra un conteo discreto por grupo', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/tienda')
  const sidebar = page.getByRole('complementary', {
    name: 'Filtros de la tienda',
  })
  const brand = group(sidebar, 'brand')
  const gender = group(sidebar, 'gender')
  const family = group(sidebar, 'family')
  const price = group(sidebar, 'price')

  await brand.getByRole('checkbox', { name: 'Forme' }).check()
  await brand.locator('summary').click()
  await expect(brand.locator('.catalog-filter-group__count')).toContainText('1')
  await expect(brand.getByRole('checkbox', { name: 'Forme' })).toBeHidden()
  await brand.locator('summary').click()
  await expect(brand.getByRole('checkbox', { name: 'Forme' })).toBeChecked()

  await gender.locator('summary').click()
  await gender.getByRole('checkbox', { name: 'Para ella' }).check()
  await gender.locator('summary').click()
  await expect(gender.locator('.catalog-filter-group__count')).toContainText(
    '1',
  )

  await family.getByRole('checkbox', { name: 'Floral' }).check()
  await family.getByRole('checkbox', { name: 'Verde' }).check()
  await family.locator('summary').click()
  await expect(family.locator('.catalog-filter-group__count')).toContainText(
    '2',
  )
  await family.locator('summary').click()
  await expect(family.getByRole('checkbox', { name: 'Floral' })).toBeChecked()
  await expect(family.getByRole('checkbox', { name: 'Verde' })).toBeChecked()

  await price.locator('summary').click()
  await price.getByRole('spinbutton', { name: 'Mínimo' }).fill('400')
  await price.getByRole('spinbutton', { name: 'Máximo' }).fill('630')
  await price.locator('summary').click()
  await expect(price.locator('.catalog-filter-group__count')).toContainText('1')

  await sidebar.getByRole('button', { name: 'Aplicar filtros' }).click()
  await expect(page).toHaveURL(/marca=forme/)
  await expect(page).toHaveURL(/genero=mujer/)
  await expect(page).toHaveURL(/familia=floral/)
  await expect(page).toHaveURL(/familia=verde/)
  await expect(page).toHaveURL(/min=400&max=630/)
  await page.reload()
  await expect(
    group(sidebar, 'brand').getByRole('checkbox', { name: 'Forme' }),
  ).toBeChecked()
  await expect(
    group(sidebar, 'family').getByRole('checkbox', { name: 'Floral' }),
  ).toBeChecked()
  await expect(
    group(sidebar, 'family').getByRole('checkbox', { name: 'Verde' }),
  ).toBeChecked()
  await expect(
    group(sidebar, 'gender').locator('.catalog-filter-group__count'),
  ).toContainText('1')
  await expect(
    group(sidebar, 'price').locator('.catalog-filter-group__count'),
  ).toContainText('1')
})

test('el panel móvil empieza contraído, conserva el borrador y mantiene sus acciones visibles', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 390, height: 700 })
  await page.goto('/tienda')
  const trigger = page.getByRole('button', { name: /^Filtros/ })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Afinar la selección' })
  for (const name of ['brand', 'gender', 'family', 'price'])
    await expect(group(dialog, name)).not.toHaveAttribute('open', '')

  const family = group(dialog, 'family')
  await family.locator('summary').click()
  await family.getByRole('checkbox', { name: 'Floral' }).check()
  await family.locator('summary').click()
  await expect(family.locator('.catalog-filter-group__count')).toContainText(
    '1',
  )
  await family.locator('summary').click()
  await expect(family.getByRole('checkbox', { name: 'Floral' })).toBeChecked()

  const price = group(dialog, 'price')
  await price.locator('summary').click()
  const maximum = price.getByRole('spinbutton', { name: 'Máximo' })
  await maximum.scrollIntoViewIfNeeded()
  const actions = dialog.locator('.catalog-filter-actions')
  const apply = actions.getByRole('button', { name: 'Aplicar filtros' })
  const clear = actions.getByRole('button', { name: 'Limpiar selección' })
  await expect(apply).toBeInViewport({ ratio: 1 })
  await expect(clear).toBeInViewport({ ratio: 1 })
  const inputBox = await maximum.boundingBox()
  const actionsBox = await actions.boundingBox()
  expect(inputBox!.y + inputBox!.height).toBeLessThanOrEqual(actionsBox!.y + 1)
  await page.screenshot({
    path: 'artifacts/catalog-accordions/mobile-expanded.png',
    fullPage: false,
  })

  await apply.click()
  await expect(page).toHaveURL(/familia=floral/)
  await trigger.click()
  await expect(group(dialog, 'family')).not.toHaveAttribute('open', '')
  await expect(
    group(dialog, 'family').locator('.catalog-filter-group__count'),
  ).toContainText('1')
  await group(dialog, 'family').locator('summary').click()
  await expect(
    group(dialog, 'family').getByRole('checkbox', { name: 'Floral' }),
  ).toBeChecked()
})

test('limpiar el borrador actualiza los indicadores y un precio inválido abre su grupo', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 })
  await page.goto('/tienda')
  await page.getByRole('button', { name: /^Filtros/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Afinar la selección' })
  const brand = group(dialog, 'brand')
  const price = group(dialog, 'price')

  await brand.locator('summary').click()
  await brand.getByRole('checkbox', { name: 'Forme' }).check()
  await brand.locator('summary').click()
  await expect(brand.locator('.catalog-filter-group__count')).toHaveText(/1/)
  await dialog.getByRole('button', { name: 'Limpiar selección' }).click()
  await expect(brand.locator('.catalog-filter-group__count')).toHaveCount(0)
  await brand.locator('summary').click()
  await expect(brand.getByRole('checkbox', { name: 'Forme' })).not.toBeChecked()

  await price.locator('summary').click()
  await price.getByRole('spinbutton', { name: 'Mínimo' }).fill('650')
  await price.getByRole('spinbutton', { name: 'Máximo' }).fill('600')
  await price.locator('summary').click()
  await dialog.getByRole('button', { name: 'Aplicar filtros' }).click()
  await expect(price).toHaveAttribute('open', '')
  await expect(
    price.getByRole('spinbutton', { name: 'Máximo' }),
  ).toHaveJSProperty(
    'validationMessage',
    'El precio máximo debe ser mayor o igual al mínimo.',
  )
  await expect(page).toHaveURL('/tienda')
})

test('los filtros mantienen composición y controles utilizables en cuatro anchos', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const viewport of [
    { name: 'desktop', width: 1600, height: 950 },
    { name: 'laptop', width: 1280, height: 800 },
    { name: 'tablet', width: 820, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/tienda')
    const root =
      viewport.width >= 1024
        ? page.getByRole('complementary', { name: 'Filtros de la tienda' })
        : page.getByRole('dialog', { name: 'Afinar la selección' })
    if (viewport.width < 1024)
      await page.getByRole('button', { name: /^Filtros/ }).click()
    for (const name of ['brand', 'gender', 'family', 'price'])
      await expect(group(root, name).locator('summary')).toBeVisible()
    await expect(
      root.getByRole('button', { name: 'Aplicar filtros' }),
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `artifacts/catalog-accordions/${viewport.name}.png`,
      fullPage: false,
    })
    if (viewport.name === 'tablet') {
      await group(root, 'family').locator('summary').click()
      await group(root, 'price').locator('summary').click()
      await expect(
        root.getByRole('button', { name: 'Aplicar filtros' }),
      ).toBeInViewport({ ratio: 1 })
      await page.screenshot({
        path: 'artifacts/catalog-accordions/tablet-expanded.png',
        fullPage: false,
      })
    }
  }
})
