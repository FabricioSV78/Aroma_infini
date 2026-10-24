import { expect, test } from '@playwright/test'
import { getProductRecommendations } from '../src/services/product-recommendations'
import type { Product } from '../src/types/catalog'

function product(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    slug: id,
    name: `Producto ${id}`,
    brandId: 'marca-base',
    image: `/images/${id}.webp`,
    productType: 'perfume',
    family: 'Amaderado',
    olfactoryFamilies: ['amaderado'],
    variants: [
      {
        id: `${id}-50`,
        ml: 50,
        priceCents: 20000,
        stock: 3,
        active: true,
      },
    ],
    ...overrides,
  }
}

function ids(items: Product[]) {
  return items.map((item) => item.id)
}

test('un producto sin relacionados guardados muestra alternativas publicadas sin modificar sus datos', () => {
  const current = product('importado')
  const candidates = [
    current,
    product('alternativa-a'),
    product('alternativa-b'),
  ]
  const recommendationIds: string[] = []
  const original = structuredClone({ current, candidates, recommendationIds })

  expect(
    ids(getProductRecommendations(current, recommendationIds, candidates)),
  ).toEqual(['alternativa-a', 'alternativa-b'])
  expect({ current, candidates, recommendationIds }).toEqual(original)
})

test('respeta la selección manual y su orden, sin completar automáticamente una selección corta', () => {
  const current = product('actual')
  const first = product('primero')
  const second = product('segundo')
  const third = product('tercero')
  const published = [current, first, second, third]

  expect(
    ids(getProductRecommendations(current, ['segundo', 'primero'], published)),
  ).toEqual(['segundo', 'primero'])
  expect(
    ids(getProductRecommendations(current, ['segundo'], published)),
  ).toEqual(['segundo'])
})

test('mantiene una recomendación manual agotada que continúa publicada', () => {
  const current = product('actual')
  const soldOut = product('agotado', {
    variants: [{ id: 'agotado-50', ml: 50, priceCents: 20000, stock: 0 }],
  })

  expect(
    ids(
      getProductRecommendations(
        current,
        ['agotado'],
        [soldOut, product('alternativa-disponible')],
      ),
    ),
  ).toEqual(['agotado'])
})

test('ignora referencias manuales no publicadas y utiliza alternativas si ninguna sigue disponible', () => {
  const current = product('actual')
  const published = [product('alternativa'), product('otra-alternativa')]

  expect(
    ids(
      getProductRecommendations(
        current,
        ['borrador-no-publicado', 'eliminado'],
        published,
      ),
    ),
  ).toEqual(['alternativa', 'otra-alternativa'])

  expect(
    ids(
      getProductRecommendations(
        current,
        ['borrador-no-publicado', 'otra-alternativa'],
        published,
      ),
    ),
  ).toEqual(['otra-alternativa'])
})

test('las alternativas automáticas requieren fotografía y una presentación que realmente pueda comprarse', () => {
  const current = product('actual')
  const candidates = [
    current,
    product('sin-foto', { image: ' ' }),
    product('sin-presentaciones', { variants: [] }),
    product('agotado', {
      variants: [{ id: 'agotado-50', ml: 50, priceCents: 20000, stock: 0 }],
    }),
    product('inactivo', {
      variants: [
        {
          id: 'inactivo-50',
          ml: 50,
          priceCents: 20000,
          stock: 8,
          active: false,
        },
      ],
    }),
    product('sin-precio', {
      variants: [{ id: 'sin-precio-50', ml: 50, priceCents: 0, stock: 8 }],
    }),
    product('precio-negativo', {
      variants: [
        { id: 'precio-negativo-50', ml: 50, priceCents: -100, stock: 8 },
      ],
    }),
    product('ninguna-variante-comprable', {
      variants: [
        { id: 'variante-con-precio', ml: 50, priceCents: 20000, stock: 0 },
        { id: 'variante-con-stock', ml: 100, priceCents: 0, stock: 4 },
      ],
    }),
    product('valido-legado', {
      variants: [
        { id: 'valido-legado-50', ml: 50, priceCents: 20000, stock: 2 },
      ],
    }),
    product('valido-con-variante-agotada', {
      variants: [
        { id: 'valido-agotado-50', ml: 50, priceCents: 20000, stock: 0 },
        { id: 'valido-disponible-100', ml: 100, priceCents: 35000, stock: 1 },
      ],
    }),
  ]

  expect(ids(getProductRecommendations(current, [], candidates))).toEqual([
    'valido-legado',
    'valido-con-variante-agotada',
  ])
})

test('prioriza familias compartidas, después la marca y finalmente el orden estable del catálogo', () => {
  const current = product('actual', {
    olfactoryFamilies: ['amaderado', 'fresco'],
  })
  const published = [
    product('solo-marca', { olfactoryFamilies: ['floral'] }),
    product('una-familia-otra-marca', {
      brandId: 'otra-marca',
      olfactoryFamilies: ['amaderado'],
    }),
    product('una-familia-misma-marca-a', {
      olfactoryFamilies: ['fresco'],
    }),
    product('dos-familias-otra-marca', {
      brandId: 'otra-marca',
      olfactoryFamilies: ['amaderado', 'fresco'],
    }),
    product('una-familia-misma-marca-b', {
      olfactoryFamilies: ['amaderado'],
    }),
  ]

  expect(ids(getProductRecommendations(current, [], published))).toEqual([
    'dos-familias-otra-marca',
    'una-familia-misma-marca-a',
    'una-familia-misma-marca-b',
    'una-familia-otra-marca',
  ])
})

test('no confunde marcas vacías ni deduce familias de un nombre comercial', () => {
  const current = product('actual', {
    name: 'Floral Fresco',
    family: 'Floral',
    brandId: '',
    olfactoryFamilies: [],
  })
  const published = [
    product('primero', {
      brandId: 'otra-marca',
      olfactoryFamilies: ['amaderado'],
    }),
    product('segundo-sin-marca', {
      brandId: '',
      olfactoryFamilies: ['floral', 'fresco'],
    }),
  ]

  expect(ids(getProductRecommendations(current, [], published))).toEqual([
    'primero',
    'segundo-sin-marca',
  ])
})

test('separa perfumes y complementos en las alternativas automáticas', () => {
  const perfume = product('perfume')
  const complement = product('complemento', {
    productType: 'complemento',
    family: '',
    olfactoryFamilies: [],
    variants: [
      {
        id: 'complemento-unidad',
        ml: null,
        label: 'Unidad',
        priceCents: 5000,
        stock: 4,
      },
    ],
  })
  const legacyPerfume = product('perfume-legado', { productType: undefined })
  const anotherComplement = product('otro-complemento', {
    ...complement,
    id: 'otro-complemento',
    slug: 'otro-complemento',
  })
  const published = [perfume, complement, legacyPerfume, anotherComplement]

  expect(ids(getProductRecommendations(perfume, [], published))).toEqual([
    'perfume-legado',
  ])
  expect(ids(getProductRecommendations(complement, [], published))).toEqual([
    'otro-complemento',
  ])
})

test('elimina duplicados y el propio producto y limita los relacionados a cuatro', () => {
  const current = product('actual')
  const published = [
    current,
    product('a'),
    product('a'),
    product('b'),
    product('c'),
    product('d'),
    product('e'),
  ]

  expect(ids(getProductRecommendations(current, [], published))).toEqual([
    'a',
    'b',
    'c',
    'd',
  ])
  expect(
    ids(
      getProductRecommendations(
        current,
        ['actual', 'e', 'e', 'd', 'c', 'b', 'a'],
        published,
      ),
    ),
  ).toEqual(['e', 'd', 'c', 'b'])
})

test('no crea productos de relleno cuando no existen alternativas compatibles', () => {
  const current = product('unico-perfume')
  const accessory = product('accesorio', { productType: 'complemento' })

  expect(getProductRecommendations(current, [], [])).toEqual([])
  expect(getProductRecommendations(current, [], [current, accessory])).toEqual(
    [],
  )
})
