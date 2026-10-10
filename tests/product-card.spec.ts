import { expect, test } from '@playwright/test'
import { getProductPresentation } from '../src/services/product-presentation'
import type { ProductVariant } from '../src/types/catalog'

const small: ProductVariant = {
  id: 'small',
  ml: 50,
  priceCents: 39000,
  stock: 0,
}
const large: ProductVariant = {
  id: 'large',
  ml: 100,
  priceCents: 59000,
  stock: 2,
}

test('El precio y los tamaños corresponden solo a variantes disponibles', () => {
  expect(getProductPresentation([small, large])).toEqual({
    inStock: true,
    priceCents: 59000,
    showFrom: false,
    variants: [large],
  })
  const both = getProductPresentation([{ ...small, stock: 1 }, large])
  expect(both.priceCents).toBe(39000)
  expect(both.showFrom).toBe(true)
  expect(getProductPresentation([large, { ...small, stock: 1 }])).toMatchObject(
    { priceCents: 39000, showFrom: true },
  )
})

test('Agotados y productos sin variantes no anuncian un precio comprable', () => {
  const soldOut = getProductPresentation([small, { ...large, stock: 0 }])
  expect(soldOut).toMatchObject({
    inStock: false,
    priceCents: 39000,
    showFrom: false,
  })
  expect(getProductPresentation([])).toEqual({
    inStock: false,
    priceCents: null,
    showFrom: false,
    variants: [],
  })
  expect(
    getProductPresentation([{ ...small, stock: 1, priceCents: 59000 }, large])
      .showFrom,
  ).toBe(false)
})

test('Favoritos compartidos: botón, teclado y estado coherente al repetir un producto', async ({
  page,
}) => {
  await page.goto('/')
  const favorites = page.getByRole('button', {
    name: 'Guardar Bois Clair en favoritos',
    exact: true,
  })
  await expect(favorites).toHaveCount(2)
  await favorites.first().focus()
  await page.keyboard.press('Space')
  const savedFavorites = page.getByRole('button', {
    name: 'Quitar Bois Clair de favoritos',
    exact: true,
  })
  for (const favorite of await savedFavorites.all())
    await expect(favorite).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveURL('/')
  await savedFavorites.last().click()
  for (const favorite of await favorites.all()) {
    await expect(favorite).toHaveAttribute('aria-pressed', 'false')
    const box = (await favorite.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
  const soldOut = page
    .locator('.product-card')
    .filter({ has: page.getByRole('heading', { name: 'Ambre Lent' }) })
  await expect(soldOut).toContainText('Agotado')
  await expect(soldOut).toContainText('Referencia:')
  await expect(soldOut).not.toContainText('Desde')
})

test('Las fotos de Más vendidos conservan tamaño, alineación y fundido sin zoom', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const links = page.locator('#mas-vendidos .product-image-link')
  await links.first().scrollIntoViewIfNeeded()
  await page.waitForFunction(() =>
    [...document.querySelectorAll<HTMLImageElement>('#mas-vendidos img')].every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  )
  await page
    .locator('#mas-vendidos .product-grid')
    .evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished),
      )
    })
  const boxes = await links.evaluateAll((elements) =>
    elements.map((element) => {
      const box = element.getBoundingClientRect()
      return { width: box.width, height: box.height, y: box.y }
    }),
  )
  for (const box of boxes) expect(box).toEqual(boxes[0])
  const primary = links.first().locator('.product-image-primary')
  const alternate = links.first().locator('.product-image-alternate')
  await expect(primary).toHaveCSS('opacity', '1')
  await expect(alternate).toHaveCSS('opacity', '0')
  await links.first().hover()
  await expect(primary).toHaveCSS('opacity', '0')
  await expect(alternate).toHaveCSS('opacity', '1')
  await expect(alternate).toHaveCSS('transform', 'none')
  expect(
    parseFloat(
      await alternate.evaluate(
        (element) => getComputedStyle(element).transitionDuration,
      ),
    ),
  ).toBeGreaterThan(0.3)
  await page.mouse.move(0, 0)
  await expect(primary).toHaveCSS('opacity', '1')
  await expect(alternate).toHaveCSS('opacity', '0')
  await links.first().focus()
  await expect(primary).toHaveCSS('opacity', '0')
  await expect(alternate).toHaveCSS('opacity', '1')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(
    parseFloat(
      await alternate.evaluate(
        (element) => getComputedStyle(element).transitionDuration,
      ),
    ),
  ).toBeLessThan(0.01)
})

test('Las recomendaciones sustituyen la foto sin superponer dos frascos', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/producto/petale-nu')
  const imageLink = page
    .locator('.product-recommendations .product-image-link--swap')
    .last()
  await imageLink.scrollIntoViewIfNeeded()
  await imageLink.hover()
  await expect(imageLink.locator('.product-image-primary')).toHaveCSS(
    'opacity',
    '0',
  )
  await expect(imageLink.locator('.product-image-alternate')).toHaveCSS(
    'opacity',
    '1',
  )
})
