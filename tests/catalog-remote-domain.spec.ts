import { expect, test } from '@playwright/test'
import { DEFAULT_OLFACTORY_FAMILIES } from '../src/domain/olfactory-family'
import {
  CatalogReadError,
  createSupabaseStorefrontRepository,
  parseCatalogImage,
  parseCatalogProductRecord,
} from '../src/services/supabase-storefront'
import { localStorefrontRepository } from '../src/services/storefront-repository'
import { getVariantPrice } from '../src/services/product-discounts'

function id(value: number) {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`
}

function product(value = 1) {
  return {
    product: {
      id: id(value),
      sku: '10000',
      slug: `perfume-${value}`,
      name: 'Perfume de prueba',
      brandId: id(500),
      productType: 'perfume',
      image: '/images/perfume.webp',
      family: 'Floral',
      olfactoryFamilies: ['floral'],
      variants: [
        {
          id: id(value + 1000),
          sku: null,
          ml: 50,
          label: null,
          priceCents: 12000,
          stock: 2,
          active: true,
        },
      ],
      discount: null,
    },
    detail: {
      shortDescription: 'Descripción de prueba',
      description: 'Detalle de prueba',
      olfactoryImage: null,
      notes: { top: [], heart: [], base: [] },
      intensityLevel: null,
      intensity: null,
      occasion: '',
      season: '',
      gallery: [
        { image: '/images/perfume.webp', alt: 'Perfume', framing: 'full' },
      ],
      recommendationIds: [],
    },
    gender: 'unisex',
    popularity: value,
    newest: value,
  }
}

const settings = {
  olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
  features: { complementsEnabled: false },
  featuredBrandId: null,
}
const brand = { id: id(500), name: 'Marca de prueba', slug: 'marca-de-prueba' }

function repository(
  overrides: Partial<
    Parameters<typeof createSupabaseStorefrontRepository>[0]
  > = {},
) {
  return createSupabaseStorefrontRepository({
    editorial: localStorefrontRepository.peekSnapshot,
    subscribeEditorial: () => () => {},
    readPage: async () => ({ items: [product()], total: 1 }),
    readBrands: async () => [brand],
    readSettings: async () => settings,
    ...overrides,
  })
}

test('El catálogo remoto parte vacío y nunca reutiliza productos del snapshot local', async () => {
  const store = repository({
    readPage: async () => ({ items: [], total: 0 }),
    readBrands: async () => [],
  })
  expect(store.peekSnapshot().products).toEqual([])
  expect(store.peekSnapshot().brands).toEqual([])
  const snapshot = await store.readSnapshot()
  expect(snapshot.products).toEqual([])
  expect(snapshot.brands).toEqual([])
  expect(snapshot.content.featuredBrandId).toBeNull()
})

test('Las páginas remotas se combinan antes de publicar una caché completa', async () => {
  const offsets: number[] = []
  const store = repository({
    readPage: async (limit, offset) => {
      expect(limit).toBe(100)
      offsets.push(offset)
      return {
        items: Array.from({ length: offset === 0 ? 100 : 1 }, (_, index) =>
          product(offset + index + 1),
        ),
        total: 101,
      }
    },
  })
  const result = await store.readSnapshot()
  expect(offsets).toEqual([0, 100])
  expect(result.products).toHaveLength(101)
  expect(result.products[100].product.id).toBe(id(101))
})

test('Mil productos públicos se leen con cuatro páginas concurrentes, orden estable y una sola publicación completa', async () => {
  const offsets: number[] = []
  const gates = new Map<number, () => void>()
  let active = 0,
    maximum = 0,
    publications = 0
  const store = repository({
    readPage: async (_limit, offset) => {
      offsets.push(offset)
      maximum = Math.max(maximum, ++active)
      if (offset)
        await new Promise<void>((resolve) => {
          gates.set(offset, resolve)
        })
      active--
      return {
        items: Array.from({ length: 100 }, (_, index) =>
          product(offset + index + 1),
        ),
        total: 1000,
      }
    },
  })
  store.subscribe(() => {
    publications++
  })
  const result = store.readSnapshot()
  await expect.poll(() => offsets).toEqual([0, 100, 200, 300, 400])
  expect(store.peekSnapshot().products).toEqual([])
  for (const offset of [400, 300, 200, 100]) gates.get(offset)!()
  await expect.poll(() => offsets.length).toBe(9)
  expect(store.peekSnapshot().products).toEqual([])
  for (const offset of [800, 700, 600, 500]) gates.get(offset)!()
  await expect.poll(() => offsets.length).toBe(10)
  gates.get(900)!()
  const snapshot = await result
  expect(maximum).toBe(4)
  expect(publications).toBe(1)
  expect(snapshot.products.map(({ product }) => product.id)).toEqual(
    Array.from({ length: 1000 }, (_, index) => id(index + 1)),
  )
})

test('Invalidar una oleada pública pendiente descarta todas sus páginas y no inicia otra oleada antigua', async () => {
  const offsets: number[] = []
  const gates = new Map<number, () => void>()
  let fresh = false
  const store = repository({
    readPage: async (_limit, offset) => {
      offsets.push(offset)
      if (fresh) return { items: [product(999)], total: 1 }
      if (offset)
        await new Promise<void>((resolve) => {
          gates.set(offset, resolve)
        })
      return {
        items: Array.from({ length: 100 }, (_, index) =>
          product(offset + index + 1),
        ),
        total: 1000,
      }
    },
  })
  const old = store.readSnapshot()
  await expect.poll(() => offsets.length).toBe(5)
  fresh = true
  store.invalidate()
  const current = await store.readSnapshot()
  for (const offset of [400, 300, 200, 100]) gates.get(offset)!()
  expect(await old).toBe(current)
  expect(offsets).toEqual([0, 100, 200, 300, 400, 0])
  expect(
    store.peekSnapshot().products.map(({ product }) => product.id),
  ).toEqual([id(999)])
})

test('Una primera página truncada falla antes de iniciar lecturas adicionales', async () => {
  const offsets: number[] = []
  const store = repository({
    readPage: async (_limit, offset) => {
      offsets.push(offset)
      return { items: [product()], total: 10000 }
    },
  })
  await expect(store.readSnapshot()).rejects.toThrow(CatalogReadError)
  expect(offsets).toEqual([0])
  expect(store.peekSnapshot().products).toEqual([])
})

test('Solicitudes simultáneas comparten la lectura y una invalidación exige datos nuevos', async () => {
  let requests = 0
  const store = repository({
    readPage: async () => {
      requests += 1
      return { items: [product(requests)], total: 1 }
    },
  })
  const [first, second] = await Promise.all([
    store.readSnapshot(),
    store.readSnapshot(),
  ])
  expect(first).toBe(second)
  expect(requests).toBe(1)
  expect(await store.readSnapshot()).toBe(first)
  store.invalidate()
  expect((await store.readSnapshot()).products[0].product.id).toBe(id(2))
  expect(requests).toBe(2)
})

test('Un fallo de red vencida la caché se propaga y retira los datos anteriores', async () => {
  let instant = 0
  let failed = false
  const store = repository({
    now: () => instant,
    readPage: async () => {
      if (failed) throw new Error('remote failed')
      return { items: [product()], total: 1 }
    },
  })
  await store.readSnapshot()
  expect(store.peekSnapshot().products).toHaveLength(1)
  instant = 5001
  failed = true
  await expect(store.readSnapshot()).rejects.toThrow(CatalogReadError)
  expect(store.peekSnapshot().products).toEqual([])
})

test('Una respuesta iniciada antes de invalidar no repone un snapshot antiguo', async () => {
  let release: (() => void) | undefined
  let requests = 0
  const store = repository({
    readPage: async () => {
      requests += 1
      const version = requests
      if (version === 1)
        await new Promise<void>((resolve) => {
          release = resolve
        })
      return { items: [product(version)], total: 1 }
    },
  })
  const previous = store.readSnapshot()
  store.invalidate()
  const fresh = await store.readSnapshot()
  release?.()
  const delayed = await previous
  expect(fresh.products[0].product.id).toBe(id(2))
  expect(delayed.products[0].product.id).toBe(id(2))
  expect(store.peekSnapshot().products[0].product.id).toBe(id(2))
})

test('Metadata invalidada en vuelo vuelve a leer antes de resolver a sus consumidores', async () => {
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let reads = 0
  const store = repository({
    readSettings: async () => {
      const revision = ++reads
      if (revision === 1) await held
      return { ...settings, features: { complementsEnabled: revision === 2 } }
    },
  })
  const previous = store.readMetadata()
  store.invalidate()
  release()
  expect((await previous).features.complementsEnabled).toBe(true)
  expect(reads).toBe(2)
  expect(store.peekSnapshot().features.complementsEnabled).toBe(true)
})

test('Metadata anterior se une a la lectura vigente sin duplicarla ni reponer su versión', async () => {
  let releaseOld!: () => void
  let releaseNew!: () => void
  const old = new Promise<void>((resolve) => {
    releaseOld = resolve
  })
  const fresh = new Promise<void>((resolve) => {
    releaseNew = resolve
  })
  let reads = 0
  const store = repository({
    readSettings: async () => {
      const revision = ++reads
      await (revision === 1 ? old : fresh)
      return { ...settings, features: { complementsEnabled: revision === 2 } }
    },
  })
  const previous = store.readMetadata()
  store.invalidate()
  const current = store.readMetadata()
  releaseNew()
  const confirmed = await current
  releaseOld()
  expect(await previous).toBe(confirmed)
  expect(reads).toBe(2)
  expect(store.peekSnapshot().features.complementsEnabled).toBe(true)
})

test('Se rechaza una paginación inconsistente o con productos repetidos', async () => {
  const store = repository({
    readPage: async (_limit, offset) => ({
      items: offset === 0 ? [product()] : [],
      total: 101,
    }),
  })
  await expect(store.readSnapshot()).rejects.toThrow(CatalogReadError)
  const duplicate = repository({
    readPage: async () => ({ items: [product(), product()], total: 2 }),
  })
  await expect(duplicate.readSnapshot()).rejects.toThrow(CatalogReadError)
})

test('El límite de lectura no muestra silenciosamente un catálogo truncado', async () => {
  const store = repository({
    readPage: async () => ({ items: [], total: 10001 }),
  })
  await expect(store.readSnapshot()).rejects.toThrow(CatalogReadError)
})

test('Las referencias rechazan imágenes temporales, protocolos inseguros y rutas relativas ascendentes', () => {
  for (const source of [
    'data:image/webp;base64,abc',
    'blob:https://ejemplo.invalid/id',
    'javascript:alert(1)',
    'http://ejemplo.invalid/foto.webp',
    '/images/../secret.webp',
  ]) {
    expect(() => parseCatalogImage(source)).toThrow(CatalogReadError)
  }
  expect(parseCatalogImage('/images/perfume.webp')).toBe('/images/perfume.webp')
  expect(parseCatalogImage('https://media.ejemplo.invalid/foto.webp')).toBe(
    'https://media.ejemplo.invalid/foto.webp',
  )
})

test('Un borrador administrativo puede carecer de fotos y stock sin entrar en lectura pública', () => {
  const draft = product()
  draft.product.image = ''
  draft.product.variants[0].stock = 0
  draft.detail.gallery = []
  expect(parseCatalogProductRecord(draft, true).product.image).toBe('')
  expect(() => parseCatalogProductRecord(draft)).toThrow(CatalogReadError)
})

test('El catálogo público rechaza clasificaciones desconocidas y Complementos deshabilitado', async () => {
  const invalid = product()
  invalid.product.olfactoryFamilies = ['inventada']
  expect(() => parseCatalogProductRecord(invalid)).toThrow(CatalogReadError)
  const accessory = product()
  accessory.product.productType = 'complemento'
  const store = repository({
    readPage: async () => ({ items: [accessory], total: 1 }),
  })
  await expect(store.readSnapshot()).rejects.toThrow(CatalogReadError)
})

test('El precio calculado por SQL conserva la oferta aunque el dispositivo tenga otra fecha', () => {
  const original = product()
  const quoted = parseCatalogProductRecord({
    ...original,
    product: {
      ...original.product,
      discount: {
        active: true,
        type: 'percent',
        value: 20,
        startsAt: '2026-10-01T00:00:00.000Z',
        endsAt: '2026-10-30T00:00:00.000Z',
      },
      variants: original.product.variants.map((variant) => ({
        ...variant,
        finalPriceCents: 9600,
      })),
    },
  })
  for (const clock of [new Date('2020-01-01'), new Date('2040-01-01')]) {
    expect(
      getVariantPrice(quoted.product, quoted.product.variants[0], clock),
    ).toEqual({
      originalCents: 12000,
      finalCents: 9600,
      discountCents: 2400,
      discountActive: true,
    })
  }
})

test('Una cotización pública sin rebaja no recupera una oferta vencida al atrasar el reloj', () => {
  const original = product()
  const quoted = parseCatalogProductRecord({
    ...original,
    product: {
      ...original.product,
      variants: original.product.variants.map((variant) => ({
        ...variant,
        finalPriceCents: 12000,
      })),
    },
  })
  expect(
    getVariantPrice(
      quoted.product,
      quoted.product.variants[0],
      new Date('2020-01-01'),
    ),
  ).toMatchObject({
    finalCents: 12000,
    discountCents: 0,
    discountActive: false,
  })
})

test('La cotización del DTO rechaza precios negativos, cero, fraccionarios o superiores al habitual', () => {
  for (const finalPriceCents of [
    -1,
    0,
    12001,
    100.5,
    Number.NaN,
    '9600',
    null,
  ]) {
    const original = product()
    expect(() =>
      parseCatalogProductRecord({
        ...original,
        product: {
          ...original.product,
          variants: original.product.variants.map((variant) => ({
            ...variant,
            finalPriceCents,
          })),
        },
      }),
    ).toThrow(CatalogReadError)
  }
})

test('El DTO administrativo ignora cotizaciones derivadas y permite recalcular la vista previa del borrador', () => {
  const original = product()
  const draft = parseCatalogProductRecord(
    {
      ...original,
      product: {
        ...original.product,
        discount: {
          active: true,
          type: 'percent',
          value: 10,
          startsAt: '',
          endsAt: '',
        },
        variants: original.product.variants.map((variant) => ({
          ...variant,
          finalPriceCents: 9600,
        })),
      },
    },
    true,
  )
  expect(draft.product.variants[0].finalPriceCents).toBeUndefined()
  expect(
    getVariantPrice(draft.product, draft.product.variants[0]).finalCents,
  ).toBe(10800)
})

test('Invalidar conserva el snapshot confirmado y deja al consumidor solicitar su lectura acotada', async () => {
  let requests = 0
  let release: (() => void) | undefined
  let notified = 0
  const store = repository({
    readPage: async () => {
      const version = ++requests
      if (version > 1)
        await new Promise<void>((resolve) => {
          release = resolve
        })
      return { items: [product(version)], total: 1 }
    },
  })
  await store.readSnapshot()
  store.subscribe(() => {
    notified += 1
  })
  store.invalidate()
  expect(requests).toBe(1)
  expect(store.peekSnapshot().products[0].product.id).toBe(id(1))
  expect(notified).toBe(0)
  const refresh = store.readSnapshot()
  expect(requests).toBe(2)
  release?.()
  await refresh
  expect(store.peekSnapshot().products[0].product.id).toBe(id(2))
  expect(notified).toBe(1)
})

test('Los cambios editoriales notifican sin iniciar lecturas repetidas de catálogo', async () => {
  let requests = 0
  let changed: (() => void) | undefined
  const store = repository({
    subscribeEditorial: (listener) => {
      changed = listener
      return () => {}
    },
    readPage: async () => {
      requests += 1
      return { items: [product()], total: 1 }
    },
  })
  await store.readSnapshot()
  changed?.()
  changed?.()
  expect(requests).toBe(1)
})
