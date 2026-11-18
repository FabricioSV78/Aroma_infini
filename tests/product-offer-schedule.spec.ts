import { expect, test } from './test'
import type { Product, ProductDiscount } from '../src/types/catalog'
import { getNextProductDiscountChange } from '../src/services/product-discounts'
import {
  catalogRefreshCount,
  installCatalogRefreshCounter,
  settleCatalogRefreshRender,
} from './catalog-refresh-fixture'

const now = Date.parse('2030-01-02T12:00:00.000Z')

function record(
  overrides: Partial<ProductDiscount>,
): Pick<Product, 'discount'> {
  return {
    discount: {
      active: true,
      type: 'percent',
      value: 10,
      startsAt: '',
      endsAt: '',
      ...overrides,
    },
  }
}

test('Offer refresh selects the earliest future start or end without changing products', () => {
  const products = [
    record({
      startsAt: '2030-01-02T11:00:00.000Z',
      endsAt: '2030-01-03T12:00:00.000Z',
    }),
    record({
      startsAt: '2030-01-02T13:00:00.000Z',
      endsAt: '2030-01-02T14:00:00.000Z',
    }),
    record({ startsAt: '2030-01-04T00:00:00.000Z' }),
  ]
  const before = structuredClone(products)
  expect(getNextProductDiscountChange(products, now)).toBe(
    Date.parse('2030-01-02T13:00:00.000Z'),
  )
  expect(products).toEqual(before)
})

test('Offer refresh ignores disabled, missing, expired, empty and malformed boundaries', () => {
  expect(
    getNextProductDiscountChange(
      [
        {},
        { discount: null },
        record({ active: false, endsAt: '2030-01-03T00:00:00.000Z' }),
        record({ startsAt: 'invalid', endsAt: '' }),
        record({ endsAt: '2030-01-02T11:59:59.000Z' }),
        record({ startsAt: '2030-01-02T12:00:00.000Z' }),
      ],
      now,
    ),
  ).toBeUndefined()
  expect(getNextProductDiscountChange([], now)).toBeUndefined()
})

test('Offer refresh advances to the next boundary at the exact transition time', () => {
  const products = [
    record({
      startsAt: '2030-01-02T12:00:01.000Z',
      endsAt: '2030-01-02T12:00:02.000Z',
    }),
  ]
  expect(getNextProductDiscountChange(products, now)).toBe(now + 1_000)
  expect(getNextProductDiscountChange(products, now + 1_000)).toBe(now + 2_000)
  expect(getNextProductDiscountChange(products, now + 2_000)).toBeUndefined()
})

test('Offer refresh preserves distant timestamps for the existing capped timer', () => {
  const distant = '2031-01-02T12:00:00.000Z'
  expect(getNextProductDiscountChange([record({ endsAt: distant })], now)).toBe(
    Date.parse(distant),
  )
})

test('El catálogo local revalida una vez al vencer la oferta y vuelve a aplicar el filtro de precio', async ({ page }) => {
  await page.clock.install({ time: new Date('2030-02-01T10:00:00') })
  await page.goto('/tienda')
  await expect(page.locator('.product-card').first()).toBeVisible()
  await page.evaluate(async () => {
    const path = '/src/services/admin-runtime.ts'
    const { adminRuntime } = (await import(path)) as typeof import('../src/services/admin-runtime')
    const saved = adminRuntime().adminService.saveProductDiscount('cedre', {
      type: 'percent', value: 20, active: true, startsAt: '',
      endsAt: '2030-02-01T10:01:00',
    })
    if (saved.kind !== 'saved') throw new Error('No se guardó la oferta de prueba')
  })
  await page.goto('/tienda?marca=atelier-01&max=350')
  const perfume = page.locator('.product-card').filter({
    has: page.getByRole('heading', { name: 'Bois Clair', exact: true }),
  })
  await expect(perfume).toContainText('S/ 312')
  await installCatalogRefreshCounter(page)
  await page.clock.runFor(61_000)
  await expect(perfume).toHaveCount(0)
  await expect(page.locator('.catalog-results')).toHaveAttribute('aria-busy', 'false')
  await settleCatalogRefreshRender(page)
  expect(await catalogRefreshCount(page)).toEqual({ started: 1, completed: 1, revalidation: 'idle' })
  await expect(page).toHaveURL('/tienda?marca=atelier-01&max=350')
})
