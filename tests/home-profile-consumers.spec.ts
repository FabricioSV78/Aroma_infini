import { expect, test } from './test'
import { getFinderOptionsFromProfiles } from '../src/services/fragrance-matching'
import {
  getHomeBrandProfiles,
  getHomeFinderOptions,
} from '../src/services/public-home-catalog'
import type { Brand, ProductDetail } from '../src/types/catalog'

const brands: Brand[] = [
  { id: 'one', name: 'One', slug: 'one' },
  { id: 'two', name: 'Two', slug: 'two' },
]
interface Profile {
  brandId: string
  family: string
  olfactoryFamilies: string[]
  occasion: string
  intensity: ProductDetail['intensity']
  finderAvailable: boolean
}
const finder = (rows: Profile[]) =>
  getFinderOptionsFromProfiles(
    rows
      .filter((p) => p.finderAvailable)
      .map((p) => ({
        product: { family: p.family, olfactoryFamilies: p.olfactoryFamilies },
        detail: { occasion: p.occasion, intensity: p.intensity },
      })),
  )
function compact(rows: Profile[]) {
  const groups = new Map<string, { first: number; last: number }>()
  rows.forEach((p, i) => {
    const k = JSON.stringify(p),
      g = groups.get(k)
    if (g) g.last = i
    else groups.set(k, { first: i, last: i })
  })
  const kept = new Set([...groups.values()].flatMap((g) => [g.first, g.last]))
  return rows.filter((_, i) => kept.has(i))
}
test('first/last compact profiles preserve the actual brand and finder consumers at 10,000 products', () => {
  const pool: Profile[] = Array.from({ length: 60 }, (_, i) => ({
    brandId: i % 2 ? 'one' : 'two',
    family: ['Floral · Verde', 'Ámbar · Cítrico', 'Verde · Floral'][i % 3],
    olfactoryFamilies: i % 3 ? ['floral', 'verde'] : ['ambar'],
    occasion: ['Oficina', 'OFICINA', 'Diario · Noche', 'diario · noche'][i % 4],
    intensity: ['Suave', 'Moderada', 'Intensa'][
      i % 3
    ] as ProductDetail['intensity'],
    finderAvailable: i % 7 !== 0,
  }))
  let seed = 47
  const rows = Array.from({ length: 10000 }, () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return pool[seed % pool.length]
  })
  const smaller = compact(rows)
  expect(smaller.length).toBeLessThanOrEqual(120)
  expect(getHomeBrandProfiles(brands, smaller)).toEqual(
    getHomeBrandProfiles(brands, rows),
  )
  expect(
    getHomeFinderOptions(smaller, rows.filter((p) => p.finderAvailable).length),
  ).toEqual(finder(rows))
})
test('retaining only the first occurrence would break last-label-wins; keeping both is required', () => {
  const a: Profile = {
    brandId: 'one',
    family: 'Floral',
    olfactoryFamilies: ['floral'],
    occasion: 'Oficina',
    intensity: 'Suave',
    finderAvailable: true,
  }
  const b = { ...a, occasion: 'OFICINA' },
    rows = [a, b, a]
  expect(finder(rows)).not.toEqual(finder([a, b]))
  expect(getHomeFinderOptions(compact(rows), rows.length)).toEqual(finder(rows))
})
