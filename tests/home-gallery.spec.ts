import { test, expect } from '@playwright/test'

for (const { width, height } of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test(`Las categorias entran desde sus costados sin ampliar la fotografia a ${width}px`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.setViewportSize({ width, height })
    await page.goto('/')

    const categories = page.locator('.category-grid .category')
    await expect(categories).toHaveCount(3)
    await expect(categories.nth(0)).toHaveAttribute('data-reveal', 'from-left')
    await expect(categories.nth(1)).toHaveAttribute('data-reveal', 'from-right')
    await expect(categories.nth(2)).toHaveAttribute('data-reveal', 'from-right')

    for (let index = 0; index < 3; index += 1) {
      const category = categories.nth(index)
      await category.scrollIntoViewIfNeeded()
      await expect(category).toHaveAttribute('data-revealed', '')
    }

    expect(
      await categories.evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).animationName),
      ),
    ).toEqual(['home-enter-left', 'home-enter-right', 'home-enter-right'])
    expect(
      await categories
        .locator('img')
        .evaluateAll((images) =>
          images.map((image) => getComputedStyle(image).animationName),
        ),
    ).toEqual(['none', 'none', 'none'])
  })
}

test('Marcas: ratón y teclado cambian fotografía sin cambiar el tamaño', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const gallery = page.locator('#marcas')
  await page.evaluate(() => document.fonts.ready)
  await gallery.evaluate((element) =>
    element.scrollIntoView({ behavior: 'instant', block: 'center' }),
  )
  const preview = gallery.locator('.brand-preview')
  const active = preview.locator('.brand-preview-frame.is-active')
  await expect(active).toContainText('ATELIER 01')
  const before = await preview.boundingBox()
  const forme = gallery.getByRole('link', { name: /^FORME/ })
  await expect
    .poll(async () => {
      await forme.hover()
      return {
        text: await active.textContent(),
        src: await active.locator('img').getAttribute('src'),
      }
    })
    .toMatchObject({
      text: expect.stringContaining('Pétale Nu'),
      src: expect.stringMatching(/petale-alternate/),
    })
  const sillage = gallery.getByRole('link', { name: /^STUDIO SILLAGE/ })
  await sillage.focus()
  await expect(sillage).toBeFocused()
  await expect(active).toContainText('Vert Silence')
  const after = await preview.boundingBox()
  expect(after?.height).toBeCloseTo(before?.height ?? 0, 2)
  expect(after?.width).toBeCloseTo(before?.width ?? 0, 2)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/catalogo?marca=studio-sillage')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Elige tu próxima fragancia.',
  )
})

test('Marcas móvil: cada enlace tiene fotografía y el cambio de tamaño conserva acceso', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  const gallery = page.locator('#marcas')
  await gallery.scrollIntoViewIfNeeded()
  await expect(gallery.locator('.brand-thumbnail')).toHaveCount(4)
  await expect(gallery.locator('.brand-preview')).toHaveCount(0)
  await expect
    .poll(() =>
      gallery
        .locator('.brand-thumbnail')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true)
  await page.setViewportSize({ width: 1024, height: 900 })
  await gallery.scrollIntoViewIfNeeded()
  await expect(gallery.locator('.brand-preview')).toBeVisible()
  await expect(gallery.locator('.brand-thumbnail')).toHaveCount(0)
  await page.setViewportSize({ width: 390, height: 844 })
  await gallery.getByRole('link', { name: /^MATIÈRE 04/ }).click()
  await expect(page).toHaveURL('/catalogo?marca=matiere-04')
})

test('Más vendidos blanco y galería respetuosa con movimiento reducido', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const bestsellers = page.locator('[data-home-section="bestsellers"]')
  expect(
    await bestsellers.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    ),
  ).toBe('rgb(255, 255, 255)')
  const photos = await bestsellers
    .locator('.product-image-link')
    .evaluateAll((elements) =>
      elements.map((element) => {
        const bounds = element.getBoundingClientRect()
        return { width: bounds.width, height: bounds.height }
      }),
    )
  expect(
    photos.every(
      (photo) =>
        photo.width === photos[0].width && photo.height === photos[0].height,
    ),
  ).toBe(true)
  await page.locator('#marcas').scrollIntoViewIfNeeded()
  const duration = await page
    .locator('.brand-preview-frame')
    .first()
    .evaluate((element) => getComputedStyle(element).transitionDuration)
  expect(parseFloat(duration)).toBeLessThan(0.01)
  await page
    .locator('#marcas')
    .getByRole('link', { name: /^FORME/ })
    .focus()
  await expect(page.locator('.brand-preview-frame.is-active')).toContainText(
    'Pétale Nu',
  )
})
