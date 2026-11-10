import { expect, test } from './test'
import type { Product, ProductDiscount } from '../src/types/catalog'
import { getNextProductDiscountChange } from '../src/services/product-discounts'

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
