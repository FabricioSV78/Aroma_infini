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

for (const width of [1280, 1600, 1904]) {
  test(`Las fotografías de categorías conservan su encuadre en escritorio de ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 947 })
    await page.goto('/')

    const categories = page.locator('.category-grid .category')
    await categories.first().scrollIntoViewIfNeeded()

    const { images, cards, gridHeight } = await categories.evaluateAll(
      (elements) => {
        const grid = elements[0]?.parentElement
        return {
          gridHeight: grid?.getBoundingClientRect().height ?? 0,
          cards: elements.map((element) => {
            const bounds = element.getBoundingClientRect()
            return {
              x: bounds.x,
              y: bounds.y,
              bottom: bounds.bottom,
              width: bounds.width,
            }
          }),
          images: elements.map((element) => {
            const image = element.querySelector<HTMLElement>('.category-image')
            if (!image) return 0
            const bounds = image.getBoundingClientRect()
            return bounds.width / bounds.height
          }),
        }
      },
    )

    // La composición aprobada conecta un retrato con dos entradas horizontales.
    expect(images).toHaveLength(3)
    expect(images[1]).toBeCloseTo(2, 2)
    expect(images[2]).toBeCloseTo(2, 2)
    expect(cards[0].width).toBeGreaterThan(cards[1].width)
    expect(cards[0].x).toBeLessThan(cards[1].x)
    expect(cards[0].y).toBeCloseTo(cards[1].y, 1)
    expect(cards[1].x).toBeCloseTo(cards[2].x, 1)
    expect(cards[2].y).toBeGreaterThan(cards[1].bottom)
    expect(cards[0].bottom).toBeCloseTo(cards[2].bottom, 1)
    expect(gridHeight).toBeLessThanOrEqual(900)

    if (width === 1904) {
      await page.locator('#descubrir').screenshot({
        path: 'artifacts/home-categories-1904.png',
      })
    }
  })
}

test('Marcas tipográficas: teclado, enlaces y presencia editorial', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const gallery = page.locator('#marcas')
  await expect(gallery.locator('img')).toHaveCount(0)
  await expect(
    gallery.locator(
      '.brand-signatures-group:not([aria-hidden]) .brand-signature',
    ),
  ).toHaveCount(4)
  const forme = gallery.getByRole('link', {
    name: 'Ver perfumes de Forme',
    exact: true,
  })
  await forme.focus()
  await expect(forme).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL('/tienda?marca=forme')
  await expect(page.getByRole('button', { name: 'Quitar Forme' })).toBeVisible()
})

test('Home móvil: marcas accesibles y audiovisual seguido de beneficios', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const links = page.locator(
    '.brand-signatures-group:not([aria-hidden]) .brand-signature',
  )
  await expect(links).toHaveCount(4)
  const boxes = await links.evaluateAll((elements) =>
    elements.map((el) => {
      const b = el.getBoundingClientRect()
      return { x: b.x, y: b.y }
    }),
  )
  expect(boxes[0].x).toBe(boxes[1].x)
  expect(boxes[1].y).toBeGreaterThan(boxes[0].y)
  expect(boxes[2].y).toBeGreaterThan(boxes[1].y)
  await expect(
    page.locator(
      '[data-home-section="editorial"] + [data-home-section="trust"]',
    ),
  ).toHaveCount(1)
  await expect(page.locator('#destacados, .featured-section')).toHaveCount(0)
  await expect(page.locator('a[href="/#destacados"]')).toHaveCount(0)
  await page
    .locator('#marcas')
    .getByRole('link', { name: /Matière/ })
    .click()
  await expect(page).toHaveURL('/tienda?marca=matiere-04')
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
    .locator('.brand-signature-monogram')
    .first()
    .evaluate((element) => getComputedStyle(element).transitionDuration)
  expect(parseFloat(duration)).toBeLessThan(0.01)
})
