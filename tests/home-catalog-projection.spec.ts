import { expect, test } from '@playwright/test'
import {
  DEFAULT_OLFACTORY_FAMILIES,
  getProductOlfactoryFamilies,
  replaceOlfactoryFamilies,
} from '../src/domain/olfactory-family'
import { localStorefrontRepository } from '../src/services/storefront-repository'
import { getFinderOptions } from '../src/services/fragrance-matching'
import {
  getHomeBrandProfiles,
  parseBrandPreviews,
  parseHomeCatalogContext,
} from '../src/services/public-home-catalog'
import { CatalogReadError } from '../src/services/supabase-storefront'
import {
  adminService,
  createAdminProductDetail,
} from '../src/services/admin-service'
import { getBestsellingProducts } from '../src/services/home-service'
import { publicHomeCatalogFixture } from './public-home-catalog-fixture'

function id(value: number) {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`
}

function fixture() {
  replaceOlfactoryFamilies([...DEFAULT_OLFACTORY_FAMILIES])
  const snapshot = structuredClone(localStorefrontRepository.peekSnapshot())
  const brandIds = new Map(
    snapshot.brands.map((brand, index) => [brand.id, id(index + 1000)]),
  )
  snapshot.brands = snapshot.brands.map((brand) => ({
    ...brand,
    id: brandIds.get(brand.id)!,
  }))
  snapshot.products = snapshot.products.map((record, index) => ({
    ...record,
    product: {
      ...record.product,
      id: id(index + 1),
      sku: String(10000 + index),
      brandId: brandIds.get(record.product.brandId) ?? '',
      productType: record.product.productType ?? 'perfume',
      image: '/images/petale-960.webp',
      discount: record.product.discount ?? null,
      olfactoryFamilies: getProductOlfactoryFamilies(record.product),
      variants: record.product.variants.map((variant, variantIndex) => ({
        ...variant,
        active: variant.active !== false,
        id: id(10000 + index * 100 + variantIndex),
      })),
    },
    detail: {
      ...record.detail,
      olfactoryImage: null,
      gallery: [
        {
          image: '/images/petale-960.webp',
          alt: 'Fixture',
          framing: 'full' as const,
        },
      ],
      recommendationIds: [],
    },
  }))
  const metadata = {
    brands: snapshot.brands,
    features: snapshot.features,
    featuredBrandId: null,
    olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
  }
  return { snapshot, metadata }
}

test('Minimal Home profiles preserve finder labels, ordering, counts and brand profiles exactly', () => {
  const { snapshot, metadata } = fixture()
  // Repeated normalized occasions must retain the last exact label, while
  // editorial brand families retain their first occurrence and three-item cap.
  snapshot.products[0].detail.occasion = 'dIARIO; Noche'
  snapshot.products[1].detail.occasion = 'Diario'
  snapshot.products[2].detail.occasion = 'dIARIO; Noche'
  snapshot.products[0].product.family = 'Por definir · Floral · fresco'
  snapshot.products[1].product.family = 'Floral · Ámbar'
  const projected = parseHomeCatalogContext(
    publicHomeCatalogFixture(metadata, snapshot.products),
  )
  expect(projected.finderOptions).toEqual(getFinderOptions(snapshot))
  expect(projected.brandProfiles).toEqual(
    getHomeBrandProfiles(
      snapshot.brands,
      [...snapshot.products]
        .sort((a, b) => a.popularity - b.popularity)
        .map(({ product }) => product),
    ),
  )
  expect(projected.records.map(({ product }) => product.id)).toEqual(
    [...snapshot.products]
      .sort((a, b) => a.popularity - b.popularity)
      .slice(0, 4)
      .map(({ product }) => product.id),
  )
})

test('Removing public products refreshes finder options and brand vocabulary without local fallback', () => {
  const { snapshot, metadata } = fixture()
  snapshot.products = snapshot.products.slice(4)
  const result = parseHomeCatalogContext(
    publicHomeCatalogFixture(metadata, snapshot.products),
  )
  expect(result.finderOptions).toEqual(getFinderOptions(snapshot))
  const empty = parseHomeCatalogContext(publicHomeCatalogFixture(metadata, []))
  expect(empty.records).toEqual([])
  expect(empty.finderOptions.availableCount).toBe(0)
  expect(
    Object.values(empty.brandProfiles).every((values) => !values.length),
  ).toBe(true)
})

test('Home projections reject malformed or oversized profiles and invalid finder brand references', () => {
  const { snapshot, metadata } = fixture()
  const value = publicHomeCatalogFixture(metadata, snapshot.products)
  for (const profile of [
    { ...value.profiles[0], intensity: 'Invented' },
    { ...value.profiles[0], finderAvailable: 'true' },
    { ...value.profiles[0], brandId: id(900000) },
    { ...value.profiles[0], olfactoryFamilies: ['unknown-family'] },
  ]) {
    expect(() =>
      parseHomeCatalogContext({ ...value, profiles: [profile] }),
    ).toThrow(CatalogReadError)
  }
  expect(() =>
    parseHomeCatalogContext({
      ...value,
      profiles: Array(10001).fill(value.profiles[0]),
    }),
  ).toThrow(CatalogReadError)
  expect(() =>
    parseHomeCatalogContext({
      ...value,
      items: [...value.items, value.items[0]],
    }),
  ).toThrow(CatalogReadError)
})

test('Brand profiles visit each product once and retain exact first-three ordering', () => {
  const brands = Array.from({ length: 1000 }, (_, index) => ({
    id: id(index + 1),
    name: `Brand ${index}`,
    slug: `brand-${index}`,
  }))
  let visits = 0
  const profiles = Array.from({ length: 10000 }, (_, index) => ({
    get brandId() {
      visits++
      return brands[index % 999].id
    },
    family:
      index < 999
        ? 'Por definir · Floral · fresco'
        : 'Floral · Ámbar · pendiente · Verde',
  }))
  const result = getHomeBrandProfiles(brands, profiles)
  expect(visits).toBe(profiles.length)
  expect(result[brands[0].id]).toEqual(['Floral', 'fresco', 'Ámbar'])
  expect(result[brands[998].id]).toEqual(['Floral', 'fresco', 'Ámbar'])
  expect(result[brands[999].id]).toEqual([])
})

test('Brand previews keep empty brands and validate image references', () => {
  const { snapshot } = fixture()
  const source = {
    brands: snapshot.brands.slice(0, 2).map((brand, index) => ({
      ...brand,
      previewImage: index === 0 ? '/images/petale-960.webp' : null,
    })),
    mediaAssets: [],
  }
  expect(parseBrandPreviews(source).map((brand) => brand.previewImage)).toEqual(
    ['/images/petale-960.webp', undefined],
  )
  expect(() =>
    parseBrandPreviews({
      ...source,
      brands: [
        { ...source.brands[0], previewImage: 'data:image/webp;base64,AA' },
      ],
    }),
  ).toThrow(CatalogReadError)
})

test('Home local conserva cuatro perfumes aunque un complemento tenga prioridad inicial', () => {
  adminService.reset()
  try {
    const expected = getBestsellingProducts().map((product) => product.id)
    expect(expected).toHaveLength(4)
    const product = {
      id: 'qa-home-accessory',
      slug: 'qa-home-accessory',
      name: 'QA Home accessory',
      productType: 'complemento' as const,
      brandId: '',
      family: '',
      olfactoryFamilies: [],
      image: '/images/petale-960.webp',
      discount: null,
      variants: [
        {
          id: 'qa-home-accessory-unit',
          ml: null,
          label: 'Unidad',
          priceCents: 8000,
          stock: 4,
          active: true,
        },
      ],
    }
    const detail = createAdminProductDetail(product, 'Temporary QA accessory.')
    detail.gallery = [
      { image: product.image, alt: product.name, framing: 'full' },
    ]
    expect(
      adminService.saveProduct({
        product,
        detail,
        gender: null,
        active: true,
        popularity: 0,
        newest: 0,
        lowStockThreshold: 2,
      }).kind,
    ).toBe('saved')
    expect(
      adminService.saveStoreFeatures({ complementsEnabled: true }).kind,
    ).toBe('saved')
    expect(
      localStorefrontRepository
        .peekSnapshot()
        .products.some((record) => record.product.id === product.id),
    ).toBe(true)
    expect(getBestsellingProducts().map((item) => item.id)).toEqual(expected)
  } finally {
    adminService.reset()
  }
})
