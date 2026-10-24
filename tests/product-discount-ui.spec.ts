import { expect, test } from '@playwright/test'

const sizes = [
  { name: 'desktop-1920', width: 1920, height: 1080 },
  { name: 'laptop-1366', width: 1366, height: 768 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
] as const

for (const size of sizes) {
  test(`Oferta visible desde tienda hasta checkout · ${size.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(size)
    await page.goto('/tienda')

    const result = await page.evaluate(async () => {
      const path = '/src/services/admin-service.ts'
      const { adminService, hydrateAdminStore } = await import(path)
      await hydrateAdminStore()
      const saved = adminService.saveProductDiscount('cedre', {
        active: true,
        type: 'percent',
        value: 20,
        startsAt: '',
        endsAt: '',
      })
      await adminService.flush()
      return saved
    })
    expect(result.kind).toBe('saved')
    await page.reload()

    const card = page.locator('.catalog-page .product-card').filter({
      hasText: 'Bois Clair',
    })
    await expect(card.locator('.offer-label')).toHaveText(/−20 %/)
    await expect(card.locator('.offer-label .sr-only')).toHaveText(
      'Oferta: 20 % de descuento',
    )
    await expect(card.locator('.price-display__current')).toContainText('312')
    await expect(card.locator('del')).toContainText('390')
    await card.scrollIntoViewIfNeeded()
    await screenshot(page, `${size.name}-tienda.png`)
    await assertNoHorizontalOverflow(page)

    await card.getByRole('link', { name: 'Ver Bois Clair' }).click()
    const price = page.locator('.product-selected-price')
    await expect(price.locator('.offer-label')).toHaveText(/−20 %/)
    await expect(price.locator('.price-display__current')).toContainText('312')
    await expect(price.locator('del')).toContainText('390')
    await expect(price.getByText(/Ahorras|Te ahorras/i)).toHaveCount(0)
    await page.getByRole('radio', { name: /100 ml/ }).check()
    await expect(price.locator('.price-display__current')).toContainText('472')
    await expect(price.locator('del')).toContainText('590')
    await page.getByRole('radio', { name: /50 ml/ }).check()
    await price.scrollIntoViewIfNeeded()
    await screenshot(page, `${size.name}-producto.png`)
    await assertNoHorizontalOverflow(page)

    await page.getByRole('button', { name: 'Añadir al carrito' }).click()
    await page.getByRole('button', { name: 'Carrito, 1 producto' }).click()
    const drawer = page.locator('.cart-dialog')
    await expect(
      drawer.locator('.cart-line .price-display__current'),
    ).toContainText('312')
    await expect(drawer.locator('.cart-line del')).toContainText('390')
    await drawer.getByRole('link', { name: 'Revisar carrito' }).click()
    const noticeClose = page.locator('.cart-notice button')
    if (await noticeClose.isVisible()) await noticeClose.click()
    const summary = page.locator('.cart-summary')
    await expect(summary.locator('.cart-product-savings')).toContainText('78')
    await summary.scrollIntoViewIfNeeded()
    await screenshot(page, `${size.name}-carrito.png`)
    await assertNoHorizontalOverflow(page)

    await page.getByRole('link', { name: 'Continuar al checkout' }).click()
    const checkout = page.locator('.checkout-summary')
    await expect(checkout.locator('.price-display__current')).toContainText(
      '312',
    )
    await expect(checkout.locator('del')).toContainText('390')
    await expect(checkout.locator('.checkout-product-savings')).toContainText(
      '78',
    )
    await checkout.scrollIntoViewIfNeeded()
    await screenshot(page, `${size.name}-checkout.png`)
    await assertNoHorizontalOverflow(page)
  })
}

test('La oferta de importe fijo muestra el ahorro exacto en cada presentación', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tienda')
  await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = await import(path)
    await hydrateAdminStore()
    adminService.saveProductDiscount('cedre', {
      active: true,
      type: 'fixed',
      value: 2000,
      startsAt: '',
      endsAt: '',
    })
    await adminService.flush()
  })
  await page.reload()

  const catalogCard = page
    .locator('.catalog-page .product-card')
    .filter({ hasText: 'Bois Clair' })
  await expect(
    catalogCard.locator('.offer-label [aria-hidden="true"]'),
  ).toHaveText(/−S\/\s*20/)
  await expect(catalogCard.locator('.offer-label .sr-only')).toHaveText(
    /Oferta: ahorra S\/\s*20/,
  )
  await expect(catalogCard.locator('.price-display__current')).toContainText(
    '370',
  )
  await expect(catalogCard.locator('del')).toContainText('390')
  await catalogCard.scrollIntoViewIfNeeded()
  await screenshot(page, 'mobile-390-fixed-offer.png')

  await catalogCard
    .getByRole('button', { name: 'Guardar Bois Clair en favoritos' })
    .click()
  await page.goto('/favoritos')
  const favoriteCard = page.locator('.favorites-page .product-card')
  await expect(
    favoriteCard.locator('.offer-label [aria-hidden="true"]'),
  ).toHaveText(/−S\/\s*20/)

  await page.goto('/')
  const homeCard = page.locator('#mas-vendidos .product-card').filter({
    hasText: 'Bois Clair',
  })
  await expect(
    homeCard.locator('.offer-label [aria-hidden="true"]'),
  ).toHaveText(/−S\/\s*20/)

  await homeCard.getByRole('link', { name: 'Ver Bois Clair' }).click()
  const productPrice = page.locator('.product-selected-price')
  await expect(
    productPrice.locator('.offer-label [aria-hidden="true"]'),
  ).toHaveText(/−S\/\s*20/)
  await expect(productPrice.locator('.product-savings')).toHaveCount(0)
  await page.getByRole('radio', { name: /100 ml/ }).check()
  await expect(productPrice.locator('.price-display__current')).toContainText(
    '570',
  )
  await expect(productPrice.locator('del')).toContainText('590')
  await expect(
    productPrice.locator('.offer-label [aria-hidden="true"]'),
  ).toHaveText(/−S\/\s*20/)
})

test('El precio visible cambia cuando empieza y termina la vigencia sin recargar', async ({
  page,
}) => {
  await page.clock.install()
  await page.goto('/tienda')
  await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = await import(path)
    await hydrateAdminStore()
    adminService.saveProductDiscount('cedre', {
      active: true,
      type: 'percent',
      value: 20,
      startsAt: new Date(Date.now() + 1_000).toISOString(),
      endsAt: new Date(Date.now() + 3_000).toISOString(),
    })
    await adminService.flush()
  })
  await page.reload()
  const card = page
    .locator('.catalog-page .product-card')
    .filter({ hasText: 'Bois Clair' })
  await expect(card.locator('.offer-label')).toHaveCount(0)
  await expect(card.locator('.price-display__current')).toContainText('390')
  await page.clock.runFor(1_200)
  await expect(card.locator('.offer-label')).toBeVisible()
  await expect(card.locator('.price-display__current')).toContainText('312')
  await page.clock.runFor(2_000)
  await expect(card.locator('.offer-label')).toHaveCount(0)
  await expect(card.locator('.price-display__current')).toContainText('390')
})

test('Una promoción no vuelve a publicar un perfume agotado', async ({
  page,
}) => {
  await page.goto('/tienda')
  await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = await import(path)
    await hydrateAdminStore()
    adminService.saveProductDiscount('ambre', {
      active: true,
      type: 'percent',
      value: 20,
      startsAt: '',
      endsAt: '',
    })
    await adminService.flush()
  })
  await page.reload()
  const card = page
    .locator('.catalog-page .product-card')
    .filter({ hasText: 'Ambre Lent' })
  await expect(card).toHaveCount(0)
  await page.goto('/producto/ambre-lent')
  await expect(
    page.getByRole('heading', {
      name: 'Este perfume no está en la selección',
    }),
  ).toBeVisible()
  await expect(page.locator('.product-selected-price')).toHaveCount(0)
})

async function screenshot(page: import('@playwright/test').Page, file: string) {
  await page.screenshot({
    path: `artifacts/discount-ui/${file}`,
    animations: 'disabled',
  })
}

async function assertNoHorizontalOverflow(
  page: import('@playwright/test').Page,
) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  )
  expect(overflow).toBe(false)
}
