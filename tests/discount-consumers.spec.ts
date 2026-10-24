import { expect, test } from '@playwright/test'
import { brands, products } from '../src/mocks/home'
import { getProductDetail } from '../src/mocks/product-details'
import { resolveSeoPage } from '../src/seo/seo-config'
import { buildSeoStructuredData } from '../src/seo/structured-data'
import { queryCatalog, readCatalogQuery } from '../src/services/catalog-service'
import { recommendFragrances } from '../src/services/fragrance-matching'
import { localStorefrontRepository } from '../src/services/storefront-repository'
import type { Product } from '../src/types/catalog'

const activeDiscount = {
  active: true,
  type: 'percent' as const,
  value: 10,
  startsAt: '',
  endsAt: '',
}

test('Catalog price filters and ordering use the final in-stock price', () => {
  const regular: Product = {
    ...products[0],
    id: 'regular',
    variants: [{ id: 'regular-50', ml: 50, priceCents: 39000, stock: 2 }],
  }
  const discounted: Product = {
    ...products[1],
    id: 'discounted',
    variants: [
      { id: 'discounted-30', ml: 30, priceCents: 20000, stock: 0 },
      { id: 'discounted-50', ml: 50, priceCents: 50000, stock: 2 },
    ],
    discount: { ...activeDiscount, value: 25 },
  }
  const run = (params: string) =>
    queryCatalog(
      readCatalogQuery(new URLSearchParams(params), brands),
      [regular, discounted],
      [],
      brands,
    )

  expect(run('max=380').items.map((product) => product.id)).toEqual([
    'discounted',
  ])
  expect(run('max=200').total).toBe(0)
  expect(run('orden=precio-asc').items.map((product) => product.id)).toEqual([
    'discounted',
    'regular',
  ])
  expect(run('orden=precio-desc').items.map((product) => product.id)).toEqual([
    'regular',
    'discounted',
  ])
  discounted.discount = { ...activeDiscount, active: false, value: 25 }
  expect(run('max=380').total).toBe(0)
})

test('Finder budget uses the discounted presentation and explains its final price', () => {
  const snapshot = localStorefrontRepository.peekSnapshot()
  const saleSnapshot = {
    ...snapshot,
    products: snapshot.products.map((record) =>
      record.product.id === 'petale'
        ? {
            ...record,
            product: {
              ...record.product,
              discount: activeDiscount,
            },
          }
        : record,
    ),
  }
  const answers = { family: ['floral'], budget: '40000' }
  const result = recommendFragrances(saleSnapshot, answers)
  expect(result.matches.map((match) => match.product.id)).toEqual(['petale'])
  expect(result.matches[0].variant.priceCents).toBe(42000)
  expect(result.matches[0].reasons.join(' ')).toContain('378')

  saleSnapshot.products.find(
    (record) => record.product.id === 'petale',
  )!.product.discount = { ...activeDiscount, active: false }
  expect(recommendFragrances(saleSnapshot, answers).kind).toBe('empty')
})

test('SEO offers expose final prices only for purchasable presentations', () => {
  const product: Product = {
    ...products[1],
    variants: [
      { id: 'petale-30', ml: 30, priceCents: 30000, stock: 0 },
      { id: 'petale-50', ml: 50, priceCents: 50000, stock: 2 },
    ],
    discount: { ...activeDiscount, value: 20 },
  }
  const config = resolveSeoPage('/producto/petale-nu', '', {
    product,
    brand: brands[1],
    detail: getProductDetail(products[1]),
  })
  const schema = buildSeoStructuredData(config, 'https://aroma.example', true)
  const productNode = schema?.['@graph'].find(
    (node) => node['@type'] === 'Product',
  )
  const offer = productNode?.offers as Record<string, unknown>
  expect(offer.lowPrice).toBe('400.00')
  expect(offer.highPrice).toBe('400.00')
  expect(offer.offerCount).toBe(1)
  expect(offer.availability).toBe('https://schema.org/InStock')

  product.discount = { ...activeDiscount, active: false, value: 20 }
  const inactiveConfig = resolveSeoPage('/producto/petale-nu', '', {
    product,
    brand: brands[1],
    detail: getProductDetail(products[1]),
  })
  const inactiveSchema = buildSeoStructuredData(
    inactiveConfig,
    'https://aroma.example',
    true,
  )
  const inactiveProductNode = inactiveSchema?.['@graph'].find(
    (node) => node['@type'] === 'Product',
  )
  expect(
    (inactiveProductNode?.offers as Record<string, unknown>).lowPrice,
  ).toBe('500.00')
})
