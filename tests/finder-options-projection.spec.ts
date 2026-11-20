import { expect, test } from './test'
import { createFragranceFinderService } from '../src/services/fragrance-finder-service'
import {
  getFinderOptions,
  recommendFragrances,
} from '../src/services/fragrance-matching'
import { getHomeFinderOptions } from '../src/services/public-home-catalog'
import {
  localStorefrontRepository,
  type StorefrontSnapshot,
} from '../src/services/storefront-repository'
import { publicHomeCatalogFixture } from './public-home-catalog-fixture'
import { getProductOlfactoryFamilies } from '../src/domain/olfactory-family'

function representativeSnapshot(count: number): StorefrontSnapshot {
  const initial = localStorefrontRepository.peekSnapshot()
  return {
    ...initial,
    products: Array.from({ length: count }, (_, index) => {
      const record = structuredClone(
        initial.products[index % initial.products.length],
      )
      record.product.id = `finder-${index}`
      record.product.slug = `finder-${index}`
      record.product.name += ` ${index}`
      record.product.olfactoryFamilies = getProductOlfactoryFamilies(
        record.product,
      )
      record.product.variants = record.product.variants.map(
        (variant, position) => ({
          ...variant,
          id: `finder-${index}-${position}`,
        }),
      )
      record.popularity = index
      if (index % 13 === 0) record.product.brandId = ''
      if (index % 17 === 0) record.product.productType = 'complemento'
      if (index % 19 === 0)
        record.product.variants = record.product.variants.map((variant) => ({
          ...variant,
          stock: 0,
        }))
      return record
    }),
  }
}

function compactProjection(snapshot: StorefrontSnapshot) {
  const projection = publicHomeCatalogFixture(
    { brands: snapshot.brands },
    snapshot.products,
  )
  // Match the existing SQL projection: retain first and last occurrences of
  // each profile, preserving the ordering and last-label-wins option semantics.
  const bounds = new Map<string, { first: number; last: number }>()
  projection.profiles.forEach((profile, ordinal) => {
    const key = JSON.stringify(profile)
    const previous = bounds.get(key)
    bounds.set(key, { first: previous?.first ?? ordinal, last: ordinal })
  })
  const ordinals = new Set(
    [...bounds.values()].flatMap((value) => [value.first, value.last]),
  )
  return {
    ...projection,
    finderAvailableCount: projection.profiles.filter(
      (profile) => profile.finderAvailable,
    ).length,
    profiles: projection.profiles.filter((_, ordinal) => ordinals.has(ordinal)),
  }
}

for (const count of [15, 1000, 3000]) {
  test(`las opciones compactas equivalen al catálogo completo de ${count} productos sin sus fotografías ni variantes`, async ({ baseURL }, testInfo) => {
    const snapshot = representativeSnapshot(count)
    const projection = compactProjection(snapshot)
    const expected = getFinderOptions(snapshot)
    expect(
      getHomeFinderOptions(
        projection.profiles,
        projection.finderAvailableCount,
      ),
    ).toEqual(expected)

    let fullReads = 0
    let profileReads = 0
    const service = createFragranceFinderService(
      {
        async readSnapshot() {
          fullReads++
          return snapshot
        },
      },
      async () => {
        profileReads++
        return getHomeFinderOptions(
          projection.profiles,
          projection.finderAvailableCount,
        )
      },
    )
    expect(await service.getOptions()).toEqual(expected)
    expect({ fullReads, profileReads }).toEqual({
      fullReads: 0,
      profileReads: 1,
    })
    const answers = {
      family: ['floral'],
      occasion: ['diario'],
      budget: '50000',
    }
    expect(await service.recommend(answers)).toEqual(
      recommendFragrances(snapshot, answers),
    )
    expect(fullReads).toBe(1)

    const fullBytes = Buffer.byteLength(JSON.stringify(snapshot.products))
    const profileBytes = Buffer.byteLength(JSON.stringify(projection))
    if (count >= 1000) expect(profileBytes).toBeLessThan(fullBytes / 10)
    await testInfo.attach(`finder-options-${count}.json`, {
      contentType: 'application/json',
      body: JSON.stringify({
        harnessBaseURL: baseURL,
        count,
        fullBytes,
        profileBytes,
        previousProductPages: Math.ceil(count / 100),
        projectedReads: 1,
        availableCount: expected.availableCount,
      }),
    })
  })
}

test('un error de opciones compactas se conserva sin descargar el catálogo como fallback', async () => {
  let fullReads = 0
  const service = createFragranceFinderService(
    {
      async readSnapshot() {
        fullReads++
        return representativeSnapshot(1000)
      },
    },
    async () => {
      throw new Error('options-offline')
    },
  )
  await expect(service.getOptions()).rejects.toThrow('options-offline')
  expect(fullReads).toBe(0)
})

test('un catálogo nuevo sin perfumes conserva el estado vacío de las opciones', async () => {
  const snapshot = representativeSnapshot(15)
  snapshot.products = snapshot.products.map((record) => ({
    ...record,
    product: { ...record.product, productType: 'complemento' },
  }))
  const projection = compactProjection(snapshot)
  expect(
    getHomeFinderOptions(projection.profiles, projection.finderAvailableCount),
  ).toEqual(getFinderOptions(snapshot))
  expect(projection.finderAvailableCount).toBe(0)
})

test('la inyección local conserva una lectura actual al abrir y otra al recomendar', async () => {
  const snapshot = representativeSnapshot(15)
  let reads = 0
  const service = createFragranceFinderService({
    async readSnapshot() {
      reads++
      return snapshot
    },
  })
  expect(await service.getOptions()).toEqual(getFinderOptions(snapshot))
  expect(await service.recommend({ budget: '50000' })).toEqual(
    recommendFragrances(snapshot, { budget: '50000' }),
  )
  expect(reads).toBe(2)
})
