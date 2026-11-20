import { expect, test } from './test'
import {
  localStorefrontRepository,
  type StorefrontSnapshot,
} from '../src/services/storefront-repository'
import { parseFinderCatalogContext } from '../src/services/remote-fragrance-finder'
import { recommendFragrances } from '../src/services/fragrance-matching'
import {
  DEFAULT_OLFACTORY_FAMILIES,
  replaceOlfactoryFamilies,
} from '../src/domain/olfactory-family'
import type { FinderAnswers } from '../src/types/fragrance-finder'
import { getProductOlfactoryFamilies } from '../src/domain/olfactory-family'
import { parseCatalogProduct } from '../src/services/supabase-storefront'

const uuid = (kind: number, index: number) =>
  `f019000${kind}-0000-4000-8000-${String(index + 1).padStart(12, '0')}`

export function finderScaleSnapshot(count: number): StorefrontSnapshot {
  const initial = localStorefrontRepository.peekSnapshot()
  const brands = initial.brands.map((brand, index) => ({
    id: uuid(1, index),
    name: brand.name,
    slug: brand.slug,
  }))
  return {
    ...initial,
    brands,
    products: Array.from({ length: count }, (_, index) => {
      const record = structuredClone(
        initial.products[index % initial.products.length],
      )
      const originalBrand = initial.brands.findIndex(
        (brand) => brand.id === record.product.brandId,
      )
      record.product.id = uuid(2, index)
      record.product.sku = String(10000 + index)
      record.product.slug = `finder-volume-${index}`
      record.product.name += ` ${String(index).padStart(5, '0')}`
      record.product.brandId =
        index % 13 === 0 ? '' : brands[Math.max(0, originalBrand)].id
      record.product.productType = index % 17 === 0 ? 'complemento' : 'perfume'
      record.product.image = '/images/finder-volume.webp'
      record.product.olfactoryFamilies = getProductOlfactoryFamilies(
        record.product,
      )
      record.product.discount ??= null
      record.product.variants = record.product.variants.map(
        (variant, position) => ({
          ...variant,
          id: uuid(3, index * 3 + position),
          active: true,
          finalPriceCents: variant.priceCents,
          ...(index % 19 === 0 ? { stock: 0 } : {}),
        }),
      )
      // The legacy local seed omits nullable DTO fields. The remote canonical
      // path parses them before ranking; compare two actual public Products.
      if (record.product.productType === 'perfume' && record.product.brandId)
        record.product = parseCatalogProduct(record.product, true)
      record.detail.description =
        'Descripción comercial que no participa en la recomendación. '.repeat(
          30,
        )
      record.detail.shortDescription =
        'Texto de ficha que no participa en el cálculo.'
      record.detail.notes = {
        top: ['Bergamota', 'Limón'],
        heart: ['Rosa', 'Jazmín'],
        base: ['Cedro', 'Almizcle'],
      }
      record.detail.gallery = [0, 1, 2, 3].map((position) => ({
        image: `/images/finder-secondary-${position}.webp`,
        alt: `Fotografía ${position} de ${record.product.name}`,
        framing: 'full',
      }))
      record.popularity = index
      return record
    }),
  }
}

export function finderCompactFixture(snapshot: StorefrontSnapshot) {
  const brandIds = new Set(snapshot.brands.map((brand) => brand.id))
  const items = snapshot.products
    .filter(
      ({ product }) =>
        product.productType === 'perfume' &&
        brandIds.has(product.brandId) &&
        product.variants.some(
          (variant) =>
            variant.active !== false &&
            variant.stock > 0 &&
            variant.priceCents > 0 &&
            (variant.ml ?? 0) > 0,
        ),
    )
    .map(({ product, detail }) => ({
      product: structuredClone(product),
      detail: {
        occasion: detail.occasion,
        intensityLevel: detail.intensityLevel,
        intensity: detail.intensity,
      },
    }))
  return {
    items,
    total: items.length,
    brands: snapshot.brands,
    olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
    mediaAssets: [],
  }
}

const answers: FinderAnswers[] = [
  {},
  { budget: '' },
  { family: ['floral'] },
  { occasion: ['diario'] },
  {
    family: ['amaderado', 'floral'],
    occasion: ['diario', 'encuentros'],
    intensity: ['suave', 'moderada'],
    budget: '50000',
  },
  {
    family: ['floral'],
    intensity: ['intensa'],
    occasion: ['noche'],
    budget: '50000',
  },
  { family: ['inexistente'], budget: '100000' },
  { budget: '50000' },
  { budget: '40000' },
  { budget: 'invalid' },
  { budget: '-1' },
  { family: [], occasion: [], intensity: [] },
]

test.afterEach(() => replaceOlfactoryFamilies(DEFAULT_OLFACTORY_FAMILIES))

for (const count of [15, 1000, 3000]) {
  test(`el DTO compacto de ${count} productos conserva exactamente los resultados del recomendador`, async ({ baseURL }, testInfo) => {
    const snapshot = finderScaleSnapshot(count)
    const dto = finderCompactFixture(snapshot)
    const parsed = parseFinderCatalogContext(dto)
    for (const answer of answers)
      expect(recommendFragrances(parsed, answer)).toEqual(
        recommendFragrances(snapshot, answer),
      )
    const bytesBefore = Buffer.byteLength(JSON.stringify(snapshot.products))
    const bytesAfter = Buffer.byteLength(JSON.stringify(dto))
    expect(bytesAfter).toBeLessThan(bytesBefore / 2)
    await testInfo.attach(`finder-recommendation-${count}.json`, {
      contentType: 'application/json',
      body: JSON.stringify({
        harnessBaseURL: baseURL,
        products: count,
        eligible: dto.total,
        bytesBefore,
        bytesAfter,
        productRequestsBefore: Math.ceil(count / 100),
        requestsAfter: 1,
        answerCases: answers.length,
      }),
    })
  })
}

test('la proyección mantiene ofertas actuales, futuras y vencidas y desempates de presentaciones', () => {
  const snapshot = finderScaleSnapshot(30)
  for (const [index, { product }] of snapshot.products.entries()) {
    product.discount = {
      active: true,
      type: index % 2 ? 'fixed' : 'percent',
      value: index % 2 ? 1000 : 10,
      startsAt: index % 3 === 0 ? '2099-01-01T00:00:00Z' : '',
      endsAt: index % 3 === 1 ? '2000-01-01T00:00:00Z' : '',
    }
    product.variants = product.variants.map((variant) => ({
      ...variant,
      finalPriceCents:
        index % 3 === 2
          ? variant.priceCents -
            (index % 2 ? 1000 : Math.round(variant.priceCents / 10))
          : variant.priceCents,
    }))
  }
  const compact = parseFinderCatalogContext(finderCompactFixture(snapshot))
  for (const answer of answers)
    expect(recommendFragrances(compact, answer)).toEqual(
      recommendFragrances(snapshot, answer),
    )
})

test('familias inactivas y etiquetas normalizadas conservan las reglas del matcher', () => {
  const snapshot = finderScaleSnapshot(30),
    dto = finderCompactFixture(snapshot)
  const definitions = DEFAULT_OLFACTORY_FAMILIES.map((family) => ({
    ...family,
    active: family.value !== 'floral',
  }))
  dto.olfactoryFamilies = definitions
  replaceOlfactoryFamilies(definitions)
  const compact = parseFinderCatalogContext(dto)
  for (const answer of answers)
    expect(recommendFragrances(compact, answer)).toEqual(
      recommendFragrances(snapshot, answer),
    )
})

test('una respuesta incompleta o ajena al contrato se rechaza, sin inventar campos de ficha', () => {
  const dto = finderCompactFixture(finderScaleSnapshot(30))
  const cases = [
    { ...dto, total: dto.total + 1 },
    { ...dto, items: [...dto.items, dto.items[0]], total: dto.total + 1 },
    { ...dto, brands: [] },
    {
      ...dto,
      items: [
        {
          ...dto.items[0],
          detail: { intensity: 'Intensa', intensityLevel: 1, occasion: '' },
        },
      ],
      total: 1,
    },
    {
      ...dto,
      items: [
        {
          ...dto.items[0],
          product: { ...dto.items[0].product, productType: 'complemento' },
        },
      ],
      total: 1,
    },
    {
      ...dto,
      items: [
        {
          ...dto.items[0],
          product: {
            ...dto.items[0].product,
            variants: dto.items[0].product.variants.map((variant) => ({
              ...variant,
              stock: 0,
            })),
          },
        },
      ],
      total: 1,
    },
    {
      ...dto,
      items: [
        {
          ...dto.items[0],
          product: {
            ...dto.items[0].product,
            image:
              '/media/public/dynamic/00000000-0000-4000-8000-000000000001/' +
              'a'.repeat(64) +
              '/800.webp',
          },
        },
      ],
      total: 1,
    },
  ]
  for (const value of cases)
    expect(() => parseFinderCatalogContext(value)).toThrow()
})

test('el DTO válido vacío produce unavailable sin productos ni pedidos de ejemplo', () => {
  const dto = finderCompactFixture(finderScaleSnapshot(0))
  expect(
    recommendFragrances(parseFinderCatalogContext(dto), { budget: '40000' }),
  ).toEqual({ kind: 'unavailable', matches: [] })
})
