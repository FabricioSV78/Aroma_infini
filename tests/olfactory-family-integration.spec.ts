import { expect, test } from '@playwright/test'

test('la familia guardada en el panel se refleja en la tienda y la ficha', async ({
  page,
}) => {
  await page.goto('/admin/productos/cedre')
  await page.getByRole('checkbox', { name: 'Amaderada' }).uncheck()
  await page.getByRole('checkbox', { name: 'Gourmand' }).check()
  await page
    .getByRole('textbox', { name: 'Perfil aromático breve' })
    .fill('Gourmand · fresco')
  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page).toHaveURL(/guardado=1/)

  await page.goto('/tienda?familia=gourmand')
  await expect(page.locator('.product-card')).toHaveCount(1)
  await expect(page.locator('.product-card').first()).toContainText(
    'Bois Clair',
  )
  await expect(
    page
      .getByRole('complementary', { name: 'Filtros de la tienda' })
      .getByRole('checkbox', { name: 'Gourmand' }),
  ).toBeChecked()

  await page.goto('/producto/bois-clair')
  await expect(page.locator('.product-kind')).toContainText('Gourmand')
  await page.reload()
  await expect(page.locator('.product-kind')).toContainText('Gourmand')
})

test('una familia sin clasificar no aparece como filtro disponible', async ({
  page,
}) => {
  await page.goto('/admin/productos/cedre')
  await page.getByRole('checkbox', { name: 'Amaderada' }).uncheck()
  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page).toHaveURL(/guardado=1/)

  await page.goto('/tienda')
  const sidebar = page.getByRole('complementary', {
    name: 'Filtros de la tienda',
  })
  await expect(sidebar.locator('[data-filter-group="family"]')).toHaveAttribute(
    'open',
    '',
  )
  await expect(
    sidebar.getByRole('checkbox', { name: 'Amaderada' }),
  ).toHaveCount(1)
  await page.goto('/tienda?familia=amaderado')
  await expect(page.locator('.product-card')).toHaveCount(4)
  await expect(page.locator('.product-card').first()).not.toContainText(
    'Bois Clair',
  )
})

test('el filtro mantiene una composición usable en cuatro tamaños de pantalla', async ({
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
    await expect(page.locator('.product-card')).toHaveCount(12)
    if (viewport.width >= 1024) {
      const sidebar = page.getByRole('complementary', {
        name: 'Filtros de la tienda',
      })
      await expect(
        sidebar.locator('[data-filter-group="family"]'),
      ).toHaveAttribute('open', '')
      await expect(
        sidebar.getByRole('checkbox', { name: 'Floral' }),
      ).toBeVisible()
    } else {
      await page.getByRole('button', { name: /^Filtros/ }).click()
      const dialog = page.getByRole('dialog', {
        name: 'Afinar la selección',
      })
      await dialog.locator('[data-filter-group="family"] summary').click()
      await expect(
        dialog.getByRole('checkbox', { name: 'Floral' }),
      ).toBeVisible()
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `artifacts/olfactory-family/tienda-${viewport.name}.png`,
      fullPage: false,
    })
  }
})

test('el selector del panel sigue legible en escritorio, laptop, tablet y móvil', async ({
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
    await page.goto('/admin/productos/cedre')
    const family = page.getByRole('checkbox', { name: 'Amaderada' })
    await family.scrollIntoViewIfNeeded()
    await expect(family).toBeVisible()
    await expect(family).toBeChecked()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `artifacts/olfactory-family/admin-${viewport.name}.png`,
      fullPage: false,
    })
  }
})
