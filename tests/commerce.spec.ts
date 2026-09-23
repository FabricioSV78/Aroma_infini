import { expect, test } from '@playwright/test'
import { parseStoredCart } from '../src/features/cart/cart-storage'
import { parseStoredFavorites } from '../src/features/favorites/favorites-storage'
import { resolveCart } from '../src/services/commerce-service'

test('Esquemas locales descartan datos corruptos y normalizan cantidades', () => {
  expect(parseStoredFavorites('{')).toEqual([])
  expect(
    parseStoredFavorites(
      JSON.stringify({ version: 1, ids: ['cedre', 'cedre', '', 12] }),
    ),
  ).toEqual(['cedre'])
  expect(
    parseStoredCart(
      JSON.stringify({
        version: 1,
        items: [
          { variantId: 'cedre-50', quantity: 2 },
          { variantId: 'cedre-50', quantity: 1 },
          { variantId: 'petale-50', quantity: 0 },
        ],
      }),
    ),
  ).toEqual([{ variantId: 'cedre-50', quantity: 3 }])
  expect(parseStoredCart(JSON.stringify({ version: 2, items: [] }))).toEqual([])
  expect(
    parseStoredFavorites(
      JSON.stringify({
        version: 1,
        ids: [
          ...Array.from({ length: 600 }, (_, index) => `item-${index}`),
          'x'.repeat(129),
        ],
      }),
    ),
  ).toHaveLength(500)
  expect(
    parseStoredCart(
      JSON.stringify({
        version: 1,
        items: [
          { variantId: 'x'.repeat(129), quantity: 1 },
          ...Array.from({ length: 600 }, (_, index) => ({
            variantId: `variant-${index}`,
            quantity: 200,
          })),
        ],
      }),
    ),
  ).toHaveLength(500)
  expect(
    parseStoredCart(
      JSON.stringify({
        version: 1,
        items: [{ variantId: 'valid', quantity: 200 }],
      }),
    ),
  ).toEqual([{ variantId: 'valid', quantity: 99 }])
})

test('El resumen conserva variante, cantidad, subtotal y problemas de stock', () => {
  const cart = resolveCart([
    { variantId: 'cedre-50', quantity: 2 },
    { variantId: 'ambre-50', quantity: 1 },
    { variantId: 'missing', quantity: 1 },
  ])
  expect(cart.quantity).toBe(4)
  expect(cart.subtotalCents).toBe(123000)
  expect(cart.needsAttention).toBe(true)
  expect(cart.lines.map((line) => line.kind)).toEqual([
    'ready',
    'ready',
    'missing',
  ])
})

test('Favoritos se comparten entre vistas, persisten y pueden quitarse', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const favoriteButtons = page.getByRole('button', {
    name: 'Guardar Bois Clair en favoritos',
    exact: true,
  })
  await favoriteButtons.first().click()
  for (const button of await page
    .getByRole('button', { name: 'Quitar Bois Clair de favoritos' })
    .all())
    await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.locator('a.header-commerce-action .header-count'),
  ).toHaveText('1')
  await page.getByRole('link', { name: /Favoritos, 1 guardado/ }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Tus favoritos.' }),
  ).toBeVisible()
  await expect(page.locator('.favorites-grid .product-card')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.favorites-grid .product-card')).toHaveCount(1)
  await page
    .getByRole('button', {
      name: 'Quitar Bois Clair de favoritos',
      exact: true,
    })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Encuentra un aroma para recordar.' }),
  ).toBeVisible()
})

test('Carrito añade variantes, actualiza cantidades, persiste y abre desde el header', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/producto/bois-clair')
  const add = page.getByRole('button', { name: 'Añadir al carrito' })
  await add.click()
  await expect(page.getByRole('status')).toContainText(
    'Bois Clair se añadió al carrito.',
  )
  await add.click()
  await page.getByLabel('100 ml').check()
  await add.click()
  await expect(
    page.locator('button.header-commerce-action .header-count'),
  ).toHaveText('3')

  const cartTrigger = page.getByRole('button', { name: /Carrito, 3 productos/ })
  await cartTrigger.click()
  const drawer = page.getByRole('dialog', { name: /Tu carrito · 3/ })
  await expect(drawer).toBeVisible()
  await expect(drawer.locator('.cart-line')).toHaveCount(2)
  await drawer.getByRole('link', { name: /Revisar carrito/ }).click()

  await expect(
    page.getByRole('heading', { level: 1, name: 'Tu carrito.' }),
  ).toBeVisible()
  await expect(page.locator('.cart-summary')).toContainText('S/ 1,370')
  await expect(page.locator('.cart-summary')).toContainText('Gratis')
  await page
    .getByRole('button', { name: 'Aumentar cantidad de Bois Clair, 50 ml' })
    .click()
  await expect(
    page.locator('button.header-commerce-action .header-count'),
  ).toHaveText('4')
  await page.reload()
  await expect(
    page.locator('button.header-commerce-action .header-count'),
  ).toHaveText('4')
  const largeLine = page.locator('.cart-line').filter({ hasText: '100 ml' })
  await largeLine.getByRole('button', { name: 'Retirar' }).click()
  await expect(
    page.locator('button.header-commerce-action .header-count'),
  ).toHaveText('3')
})

test('Adiciones rápidas respetan el stock y anuncian el límite real', async ({
  page,
}) => {
  await page.goto('/producto/bois-clair')
  await page
    .getByRole('button', { name: 'Añadir al carrito' })
    .evaluate((button) => {
      for (let index = 0; index < 7; index++)
        (button as HTMLButtonElement).click()
    })
  await expect(
    page.getByRole('button', { name: 'Carrito, 5 productos' }),
  ).toBeVisible()
  await expect(page.getByRole('status')).toContainText('máximo disponible')
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Carrito, 5 productos' }),
  ).toBeVisible()
})

test('Escape cierra el carrito y devuelve el foco al disparador', async ({
  page,
}) => {
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'Carrito', exact: true })
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog', { name: 'Tu carrito' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Tu carrito' })).toBeHidden()
  await expect(trigger).toBeFocused()
})

test('Si el almacenamiento falla, favoritos continúa durante la sesión', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Storage blocked', 'SecurityError')
    }
  })
  await page.goto('/')
  await page
    .getByRole('button', {
      name: 'Guardar Pétale Nu en favoritos',
      exact: true,
    })
    .first()
    .click()
  await page.getByRole('link', { name: /Favoritos, 1 guardado/ }).click()
  await expect(page.locator('.favorites-page .storage-note')).toContainText(
    'esta sesión',
  )
  await expect(page.getByRole('heading', { name: 'Pétale Nu' })).toBeVisible()
})

test('Los cambios y el borrado del almacenamiento se reflejan en otras pestañas', async ({
  context,
  page,
}) => {
  const otherTab = await context.newPage()
  await page.goto('/producto/bois-clair')
  await otherTab.goto('/favoritos')

  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await page.getByRole('button', { name: 'Añadir al carrito' }).click()
  await expect(
    otherTab.getByRole('link', { name: 'Favoritos, 1 guardado' }),
  ).toBeVisible()
  await expect(
    otherTab.getByRole('button', { name: 'Carrito, 1 producto' }),
  ).toBeVisible()

  await page.evaluate(() => localStorage.clear())
  await expect(
    otherTab.getByRole('link', { name: 'Favoritos', exact: true }),
  ).toBeVisible()
  await expect(
    otherTab.getByRole('button', { name: 'Carrito', exact: true }),
  ).toBeVisible()
  await otherTab.close()
})

for (const width of [360, 375, 390, 430, 768, 1024, 1280, 1440]) {
  test(`Favoritos y carrito ${width}px: sin recortes, errores ni imágenes rotas`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning')
        errors.push(message.text())
    })
    await page.addInitScript(() => {
      localStorage.setItem(
        'aroma-infini:favorites:v1',
        JSON.stringify({ version: 1, ids: ['cedre', 'petale'] }),
      )
      localStorage.setItem(
        'aroma-infini:cart:v1',
        JSON.stringify({
          version: 1,
          items: [
            { variantId: 'cedre-50', quantity: 2 },
            { variantId: 'petale-100', quantity: 1 },
          ],
        }),
      )
    })
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['/favoritos', '/carrito']) {
      await page.goto(path)
      await page.locator('footer').scrollIntoViewIfNeeded()
      await page.locator('img').evaluateAll(async (elements) => {
        const images = elements as HTMLImageElement[]
        images.forEach((image) => {
          image.loading = 'eager'
        })
        await Promise.all(
          images.map(
            (image) =>
              new Promise<void>((resolve) => {
                if (image.complete) resolve()
                else {
                  image.addEventListener('load', () => resolve(), {
                    once: true,
                  })
                  image.addEventListener('error', () => resolve(), {
                    once: true,
                  })
                }
              }),
          ),
        )
      })
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true)
      expect(
        await page
          .locator('img')
          .evaluateAll(
            (elements) =>
              (elements as HTMLImageElement[]).filter(
                (image) => image.naturalWidth === 0,
              ).length,
          ),
      ).toBe(0)
    }
    expect(errors).toEqual([])
  })
}
