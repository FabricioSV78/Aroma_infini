import { expect, test } from '@playwright/test'

test('el editor conserva controles utilizables en cuatro tamaños', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const viewport of [
    { name: 'desktop', width: 1920, height: 1080 },
    { name: 'laptop', width: 1366, height: 768 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/admin/productos/cedre')
    await page.locator('.admin-related-products > summary').click()

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    await expect(
      page.getByLabel('Subir imagen del perfil olfativo'),
    ).toBeAttached()
    await expect(page.getByLabel(/Encuadre de foto/)).toHaveCount(0)
    await expect(
      page.getByLabel('Subir varias fotos del producto'),
    ).toBeAttached()
    await expect(
      page.getByRole('button', { name: 'Vista previa' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Guardar producto' }),
    ).toBeVisible()

    const actions = page.locator('.admin-editor-actions')
    const buttons = await actions.locator('.button').evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect()
        return {
          left: box.left,
          right: box.right,
          width: box.width,
          height: box.height,
        }
      }),
    )
    expect(buttons).toHaveLength(3)
    expect(buttons.every((box) => box.width >= 80 && box.height >= 44)).toBe(
      true,
    )
    expect(
      buttons.every((box) => box.left >= 0 && box.right <= viewport.width + 1),
    ).toBe(true)

    await page.locator('#product-photos-title').scrollIntoViewIfNeeded()
    await page.locator('.admin-product-upload-area').screenshot({
      path: `artifacts/admin-product-editor/photos-${viewport.name}.png`,
    })
    await page.locator('.admin-product-olfactory-slot').screenshot({
      path: `artifacts/admin-product-editor/olfactory-${viewport.name}.png`,
    })
    await page.locator('.admin-related-products').screenshot({
      path: `artifacts/admin-product-editor/related-${viewport.name}.png`,
    })
    await actions.screenshot({
      path: `artifacts/admin-product-editor/actions-${viewport.name}.png`,
    })
  }
})

test('el orden de fotografías, relacionados y acciones se manejan con teclado', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin/productos/cedre')
  const firstPhoto = page
    .locator('.admin-product-upload-item')
    .first()
    .locator('img')
  const originalPhoto = await firstPhoto.getAttribute('src')

  const moveSecondPhoto = page.getByRole('button', {
    name: 'Mover foto 2 antes',
  })
  await moveSecondPhoto.focus()
  await page.keyboard.press('Enter')
  await expect(firstPhoto).not.toHaveAttribute('src', originalPhoto ?? '')

  const related = page.locator('.admin-related-products')
  const summary = related.locator('summary')
  await summary.focus()
  await page.keyboard.press('Enter')
  await expect(related).toHaveAttribute('open', '')

  const preview = page.getByRole('button', { name: 'Vista previa' })
  const save = page.getByRole('button', { name: 'Guardar producto' })
  await preview.focus()
  await page.keyboard.press('Tab')
  await expect(save).toBeFocused()
})
