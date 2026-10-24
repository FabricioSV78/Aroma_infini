import { expect, test } from '@playwright/test'
import {
  getEditorialPrimaryFamily,
  getOlfactoryFamilyLabel,
  getProductOlfactoryFamilies,
  getProductOlfactoryFamily,
  isOlfactoryFamily,
  OLFACTORY_FAMILIES,
  parseOlfactoryFamily,
  parseOlfactoryFamilies,
  validateProductOlfactoryClassification,
} from '../src/domain/olfactory-family'
import {
  getFinderOptions,
  recommendFragrances,
} from '../src/services/fragrance-matching'
import { localStorefrontRepository } from '../src/services/storefront-repository'
import type { StorefrontSnapshot } from '../src/services/storefront-repository'

test('The taxonomy accepts complete known names, but not descriptions or product names', () => {
  expect(OLFACTORY_FAMILIES.map(({ value }) => value)).toEqual([
    'amaderado',
    'floral',
    'verde',
    'ambar',
    'citrico',
    'aromatico',
    'fresco',
    'gourmand',
  ])
  expect(getOlfactoryFamilyLabel('citrico')).toBe('Cítrica')
  expect(parseOlfactoryFamily('  CÍTRICA ')).toBe('citrico')
  expect(parseOlfactoryFamily('Amaderado')).toBe('amaderado')
  expect(parseOlfactoryFamily('Amaderado · fresco')).toBeUndefined()
  expect(parseOlfactoryFamily('Bois Clair')).toBeUndefined()
  expect(isOlfactoryFamily('citrico')).toBe(true)
  expect(isOlfactoryFamily('cítrica')).toBe(false)
})

test('Legacy profiles use only their recorded first family; null clears classification', () => {
  expect(getEditorialPrimaryFamily('Amaderado · fresco')).toBe('amaderado')
  expect(getEditorialPrimaryFamily('Notas amaderadas · fresco')).toBeUndefined()
  expect(getProductOlfactoryFamily({ family: 'Amaderado · fresco' })).toBe(
    'amaderado',
  )
  expect(
    getProductOlfactoryFamily({
      family: 'Amaderado · fresco',
      olfactoryFamily: 'floral',
    }),
  ).toBe('floral')
  expect(
    getProductOlfactoryFamily({
      family: 'Amaderado · fresco',
      olfactoryFamily: null,
    }),
  ).toBeUndefined()
})

test('Multiple confirmed families override legacy classification and reject invalid values', () => {
  expect(parseOlfactoryFamilies('Amaderada, Fresca')).toEqual([
    'amaderado',
    'fresco',
  ])
  expect(parseOlfactoryFamilies('Floral, Floral')).toBeNull()
  expect(parseOlfactoryFamilies('Floral, Marina')).toBeNull()
  expect(parseOlfactoryFamilies('')).toEqual([])
  const product = {
    family: 'Amaderado · fresco',
    olfactoryFamily: 'amaderado' as const,
    olfactoryFamilies: ['amaderado', 'fresco'] as ['amaderado', 'fresco'],
  }
  expect(getProductOlfactoryFamilies(product)).toEqual([
    'amaderado',
    'fresco',
  ])
  expect(getProductOlfactoryFamily(product)).toBe('amaderado')
  expect(validateProductOlfactoryClassification(product)).toBeNull()
  expect(
    getProductOlfactoryFamilies({
      family: 'Amaderado · fresco',
      olfactoryFamily: 'amaderado',
      olfactoryFamilies: [],
    }),
  ).toEqual([])
  expect(
    validateProductOlfactoryClassification({
      ...product,
      olfactoryFamilies: ['floral'] as ['floral'],
      olfactoryFamily: 'floral',
    }),
  ).toContain('perfil aromático breve')
  expect(
    validateProductOlfactoryClassification({
      ...product,
      olfactoryFamilies: ['amaderado', 'amaderado'] as [
        'amaderado',
        'amaderado',
      ],
    }),
  ).toContain('sin repetir')
})

test('The finder can recommend by a secondary confirmed family', () => {
  const original = localStorefrontRepository.peekSnapshot()
  const record = original.products.find(
    ({ product }) => product.id === 'cedre',
  )!
  const snapshot: StorefrontSnapshot = {
    ...original,
    products: [
      {
        ...record,
        product: {
          ...record.product,
          olfactoryFamilies: ['amaderado', 'fresco'],
        },
      },
    ],
  }
  expect(getFinderOptions(snapshot).families.map(({ value }) => value)).toEqual([
    'amaderado',
    'fresco',
  ])
  const results = recommendFragrances(snapshot, { family: ['fresco'] })
  expect(results.matches.map(({ product }) => product.id)).toEqual(['cedre'])
  expect(results.matches[0].reasons).toContain('Perfil fresco.')
})

test('The finder follows the canonical family, never a stale editorial descriptor', () => {
  const original = localStorefrontRepository.peekSnapshot()
  const record = original.products.find(
    ({ product }) => product.id === 'cedre',
  )!
  const snapshot: StorefrontSnapshot = {
    ...original,
    products: [
      {
        ...record,
        product: { ...record.product, olfactoryFamily: 'floral' },
      },
    ],
  }
  expect(getFinderOptions(snapshot).families).toEqual([
    { value: 'floral', label: 'Floral' },
  ])
  expect(
    recommendFragrances(snapshot, { family: ['amaderado'] }).matches,
  ).toEqual([])
  expect(
    recommendFragrances(snapshot, { family: ['floral'] }).matches.map(
      (match) => match.product.id,
    ),
  ).toEqual(['cedre'])

  snapshot.products[0].product.olfactoryFamily = null
  expect(getFinderOptions(snapshot).families).toEqual([])
  expect(recommendFragrances(snapshot, { family: ['floral'] }).matches).toEqual(
    [],
  )
})
