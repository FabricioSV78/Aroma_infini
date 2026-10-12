import { expect, test } from '@playwright/test'
import { adminService } from '../src/services/admin-service'
import { localStorefrontRepository } from '../src/services/storefront-repository'
import { createFragranceFinderService } from '../src/services/fragrance-finder-service'
import {
  availableFinderVariants,
  getFinderOptions,
  profileParts,
  recommendFragrances,
} from '../src/services/fragrance-matching'

test.afterEach(() => adminService.reset())
const snapshot = () => localStorefrontRepository.peekSnapshot()

test('Real catalog preferences produce an available presentation and grounded reasons', () => {
  const result = recommendFragrances(snapshot(), {
    family: 'amaderado',
    occasion: 'diario',
    intensity: 'moderada',
    budget: '40000',
  })
  expect(result.kind).toBe('matches')
  expect(result.matches.map((match) => match.product.name)).toEqual([
    'Bois Clair',
  ])
  expect(result.matches[0].variant).toMatchObject({ ml: 50, priceCents: 39000 })
  expect(result.matches[0].reasons).toHaveLength(4)
  expect(result.matches[0].differences).toEqual([])
  expect(
    getFinderOptions(snapshot()).families.map((option) => option.value),
  ).not.toContain('ambar')
})

test('Aroma and budget are hard limits; partial matches explain their differences', () => {
  expect(
    recommendFragrances(snapshot(), { family: 'floral', budget: '40000' }).kind,
  ).toBe('empty')
  const partial = recommendFragrances(snapshot(), {
    family: 'floral',
    intensity: 'intensa',
    occasion: 'noche',
    budget: '50000',
  })
  expect(partial.kind).toBe('partial')
  expect(partial.matches).toHaveLength(2)
  for (const match of partial.matches) {
    expect(match.product.family).toContain('Floral')
    expect(match.variant.priceCents).toBeLessThanOrEqual(50000)
    expect(match.differences).toHaveLength(2)
    expect(match.complete).toBe(false)
  }
  expect(
    recommendFragrances(snapshot(), { family: 'inexistente' }).matches,
  ).toEqual([])
})

test('No invented recommendations for no preferences, no stock or invalid budgets', () => {
  expect(
    recommendFragrances(snapshot(), {
      family: '',
      occasion: '',
      intensity: '',
      budget: '',
    }).kind,
  ).toBe('preferences')
  expect(recommendFragrances(snapshot(), { budget: '50000' }).kind).toBe(
    'budget',
  )
  expect(recommendFragrances(snapshot(), { budget: 'invalid' }).kind).toBe(
    'empty',
  )
  expect(
    recommendFragrances({ ...snapshot(), products: [] }, { family: 'floral' })
      .kind,
  ).toBe('unavailable')
  const variant = snapshot().products[0].product.variants[0]
  expect(
    availableFinderVariants([
      { ...variant, active: false },
      { ...variant, stock: 0 },
      { ...variant, priceCents: -1 },
      { ...variant, ml: 0 },
      { ...variant, priceCents: NaN },
    ]),
  ).toEqual([])
})

test('Matching uses whole normalized labels and stable ties', () => {
  expect(profileParts('Por definir · Pendiente · N/A · —')).toEqual([])
  expect(
    profileParts('Cítrico · fresco; Diario / oficina | Pendiente').map(
      (part) => part.value,
    ),
  ).toEqual(['citrico', 'fresco', 'diario', 'oficina'])
  const first = recommendFragrances(snapshot(), { occasion: 'diario' })
  expect(
    recommendFragrances(
      { ...snapshot(), products: [...snapshot().products].reverse() },
      { occasion: 'diario' },
    ),
  ).toEqual(first)
  expect(recommendFragrances(snapshot(), { occasion: 'dia' }).matches).toEqual(
    [],
  )
})

test('The service rereads admin edits, publication and variant availability at submission', async () => {
  const service = createFragranceFinderService(localStorefrontRepository)
  await service.getOptions()
  const record = adminService
    .getSnapshot()
    .products.find((record) => record.product.name === 'Bois Clair')!
  expect(
    adminService.saveProduct({
      ...record,
      product: {
        ...record.product,
        family: 'Nuevo perfil · fresco',
        variants: record.product.variants.map((variant) => ({
          ...variant,
          stock: 0,
        })),
      },
    }).kind,
  ).toBe('saved')
  expect(
    (
      await service.recommend({
        family: 'amaderado',
        occasion: 'diario',
        budget: '40000',
      })
    ).matches,
  ).toEqual([])
  expect(adminService.setProductActive(record.product.id, false).kind).toBe(
    'saved',
  )
  expect(
    (await service.getOptions()).families.map((option) => option.value),
  ).not.toContain('nuevo perfil')
})

test('Repositories can be replaced and errors propagate to the interface', async () => {
  let reads = 0
  const service = createFragranceFinderService({
    async readSnapshot() {
      reads++
      return snapshot()
    },
  })
  await service.getOptions()
  await service.recommend({ family: 'floral' })
  expect(reads).toBe(2)
  const broken = createFragranceFinderService({
    async readSnapshot() {
      throw new Error('offline')
    },
  })
  await expect(broken.getOptions()).rejects.toThrow('offline')
  await expect(broken.recommend({ family: 'floral' })).rejects.toThrow(
    'offline',
  )
})
