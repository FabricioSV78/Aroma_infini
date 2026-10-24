import { expect, test, type Page } from '@playwright/test'

const viewports = [
  { name: 'desktop-1920', width: 1920, height: 1080 },
  { name: 'laptop-1366', width: 1366, height: 768 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
] as const

async function setDiscount(
  page: Page,
  discount: {
    active: boolean
    type: 'percent'
    value: number
    startsAt: string
    endsAt: string
  } | null,
) {
  const result = await page.evaluate(async (value) => {
    const path = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = await import(path)
    await hydrateAdminStore()
    const saved = adminService.saveProductDiscount('cedre', value)
    await adminService.flush()
    return saved
  }, discount)
  expect(result.kind).toBe('saved')
  await page.reload()
}

test('La ficha muestra beneficios confirmados y el umbral vigente sin una oferta ficticia', async ({
  page,
}) => {
  await page.goto('/producto/bois-clair')
  await setDiscount(page, null)

  const purchase = page.locator('.product-purchase')
  const benefits = purchase.getByRole('list', { name: 'Beneficios de compra' })
  await expect(benefits.locator('li')).toHaveCount(3)
  await expect(benefits).toContainText('100% original')
  await expect(benefits).toContainText('Productos garantizados')
  await expect(benefits).toContainText('Pago seguro')
  await expect(benefits).toContainText('Compra protegida')
  await expect(benefits).toContainText('Envíos a Lima y Callao')
  await expect(benefits).toContainText('Opciones de entrega disponibles')
  await expect(purchase.getByText('Oferta por tiempo limitado')).toHaveCount(0)
  await expect(purchase.getByText(/(?:Te )?ahorras S\//i)).toHaveCount(0)

  const order = await purchase.evaluate((element) => {
    const lead = element.querySelector('.product-lead')!
    const notice = element.querySelector('.product-purchase-notices')!
    const button = element.querySelector('.product-cart-button')!
    const benefits = element.querySelector('.product-purchase-benefits')!
    return {
      leadBeforeNotice: Boolean(
        lead.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
      noticeBeforeButton: Boolean(
        notice.compareDocumentPosition(button) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
      buttonBeforeBenefits: Boolean(
        button.compareDocumentPosition(benefits) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    }
  })
  expect(Object.values(order).every(Boolean)).toBe(true)

  const saveShipping = async (freeThresholdCents: number) =>
    page.evaluate(async (threshold) => {
      const path = '/src/services/admin-service.ts'
      const { adminService, hydrateAdminStore } = await import(path)
      await hydrateAdminStore()
      const saved = adminService.saveShipping({
        ...adminService.getSnapshot().shipping,
        freeThresholdCents: threshold,
      })
      await adminService.flush()
      return saved
    }, freeThresholdCents)

  expect((await saveShipping(99000)).kind).toBe('saved')
  await expect(purchase.getByText(/Envío gratis desde/)).toContainText(
    /S\/\s*990/,
  )
  expect((await saveShipping(0)).kind).toBe('saved')
  await expect(purchase.getByText(/Envío gratis desde/)).toHaveCount(0)
})

test('La urgencia aparece solo durante una promoción activa con final definido', async ({
  page,
}) => {
  await page.goto('/producto/bois-clair')
  const offer = {
    active: true,
    type: 'percent' as const,
    value: 20,
    startsAt: '',
    endsAt: '',
  }
  await setDiscount(page, offer)
  await expect(
    page.locator('.product-selected-price .offer-label'),
  ).toBeVisible()
  await expect(page.getByText('Oferta por tiempo limitado')).toHaveCount(0)

  await setDiscount(page, {
    ...offer,
    endsAt: new Date(Date.now() + 60_000).toISOString(),
  })
  await expect(page.getByText('Oferta por tiempo limitado')).toBeVisible()
  await expect(
    page.locator('.product-selected-price .price-display__current'),
  ).toContainText('312')
  await expect(page.locator('.product-selected-price del')).toContainText('390')

  await setDiscount(page, {
    ...offer,
    endsAt: new Date(Date.now() - 60_000).toISOString(),
  })
  await expect(page.getByText('Oferta por tiempo limitado')).toHaveCount(0)
  await expect(
    page.locator('.product-selected-price .offer-label'),
  ).toHaveCount(0)
  await expect(page.locator('.product-selected-price del')).toHaveCount(0)
})

test('La composición sin descuento y con descuento cabe en cuatro tamaños', async ({
  page,
}) => {
  test.setTimeout(120_000)
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.goto('/producto/bois-clair')
    await setDiscount(page, null)
    for (const state of ['plain', 'discounted'] as const) {
      if (state === 'discounted') {
        await setDiscount(page, {
          active: true,
          type: 'percent',
          value: 20,
          startsAt: '',
          endsAt: new Date(Date.now() + 60_000).toISOString(),
        })
      }
      await page.evaluate(() => document.fonts.ready)
      await expect(page.locator('.product-purchase-benefits li')).toHaveCount(3)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(viewport.width)
      const benefitRects = await page
        .locator('.product-purchase-benefits li')
        .evaluateAll((items) =>
          items.map((item) => {
            const rect = item.getBoundingClientRect()
            return {
              x: rect.x,
              y: rect.y,
              right: rect.right,
              bottom: rect.bottom,
            }
          }),
        )
      for (const rect of benefitRects) {
        expect(rect.x).toBeGreaterThanOrEqual(0)
        expect(rect.right).toBeLessThanOrEqual(viewport.width)
      }
      if (viewport.width >= 1024) {
        expect(
          Math.max(...benefitRects.map((rect) => rect.y)) -
            Math.min(...benefitRects.map((rect) => rect.y)),
        ).toBeLessThanOrEqual(1)
      } else {
        expect(benefitRects[2].y).toBeGreaterThan(benefitRects[0].y)
      }
      await page.locator('.product-intro').screenshot({
        path: `artifacts/product-detail-adjustment/after/${state}-${viewport.name}.png`,
        animations: 'disabled',
      })
      if (viewport.width === 390) {
        const shippingBenefit = page
          .locator('.product-purchase-benefits li')
          .nth(2)
        await shippingBenefit.scrollIntoViewIfNeeded()
        await expect(shippingBenefit).toBeInViewport()
        await page.locator('.product-purchase').screenshot({
          path: `artifacts/product-detail-adjustment/after/${state}-mobile-390-purchase.png`,
          animations: 'disabled',
        })
      }
    }
  }
})
