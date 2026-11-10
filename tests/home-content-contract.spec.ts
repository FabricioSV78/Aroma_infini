import { expect, test } from '@playwright/test'
import {
  createDefaultHomeContent,
  normalizeHomeContent,
} from '../src/content/home-editor'
import type { ManagedMediaAsset } from '../src/domain/media'
import {
  parseHomeDocument,
  publicHomeContent,
} from '../src/services/home-content-service'
import type { HomeContent, HomeMedia } from '../src/types/home'

interface Fixture {
  media: HomeMedia
  content: HomeContent
  version: number
  mediaAssets: ManagedMediaAsset[]
}

function document(version = 1): Fixture {
  const content = createDefaultHomeContent()
  content.featuredBrandId = null
  // SQL deliberately accepts any bounded vocabulary, including no overrides.
  content.finder.familyVisuals = {}
  return {
    version,
    media: { hombre: null, mujer: null, unisex: null, complementos: null },
    content,
    mediaAssets: [],
  }
}

function image(index: number): ManagedMediaAsset {
  const id = `aa000000-0000-4000-8000-${String(index).padStart(12, '0')}`
  const source = (width: number) =>
    `/media/public/dynamic/${id}/${'a'.repeat(64)}/${width}.webp`
  return {
    id,
    src: source(1600),
    width: 1600,
    height: 2000,
    variants: [
      { src: source(480), width: 480, height: 600 },
      { src: source(960), width: 960, height: 1200 },
      { src: source(1600), width: 1600, height: 2000 },
    ],
  }
}

test('Remote SQL content retains an empty visual vocabulary and exact saved legacy copy', () => {
  const fixture = document()
  fixture.content.hero[0].cta = 'Ver destacados'
  fixture.content.hero[1].alt =
    'Frasco verde sobre un bloque de vidrio entre reflejos de luz'
  const parsed = parseHomeDocument(fixture)
  expect(parsed.content).toEqual(fixture.content)
  expect(parsed.content.finder.familyVisuals).toEqual({})
  // Browser-local legacy migrations remain available only in their own mode.
  const local = normalizeHomeContent(fixture.content)
  expect(local.hero[0].cta).not.toBe('Ver destacados')
  expect(local.hero[1].alt).not.toBe(fixture.content.hero[1].alt)
  expect(Object.keys(local.finder.familyVisuals)).not.toHaveLength(0)
})

test('Unconfigured Home alone uses built-in defaults without importing local content', () => {
  const parsed = parseHomeDocument(
    { version: 0, media: null, content: null, mediaAssets: [] },
    'brand-from-central-settings',
  )
  expect(parsed.version).toBe(0)
  expect(parsed.content.featuredBrandId).toBe('brand-from-central-settings')
  expect(parsed.media).toEqual({
    hombre: null,
    mujer: null,
    unisex: null,
    complementos: null,
  })
  expect(parsed.content.finder.familyVisuals).not.toEqual({})
})

test('A large bounded SQL content projection can include all 100 verified manifests', () => {
  const fixture = document()
  for (let index = 1; index <= 100; index++) {
    const asset = image(index)
    fixture.mediaAssets.push(asset)
    fixture.content.finder.familyVisuals[`family-${index}`] = {
      description: 'x'.repeat(90),
      image: asset.src,
    }
  }
  for (const [step, count] of [
    ['family', 500],
    ['occasion', 500],
    ['intensity', 150],
  ] as const) {
    for (let index = 0; index < count; index++) {
      fixture.content.finder.optionLabels[step][
        `option-${index}-${'x'.repeat(80)}`
      ] = 'x'.repeat(60)
    }
  }
  expect(JSON.stringify(fixture).length).toBeGreaterThan(256_000)
  // The stored representation has UUID references, not expanded source paths
  // or public manifests. The SQL suite separately enforces its byte ceiling.
  const stored = structuredClone(fixture.content)
  fixture.mediaAssets.forEach((asset, index) => {
    stored.finder.familyVisuals[`family-${index + 1}`].image = asset.id
  })
  expect(
    new TextEncoder().encode(JSON.stringify(stored)).byteLength,
  ).toBeLessThan(256 * 1024)
  expect(parseHomeDocument(fixture).content).toEqual(fixture.content)
})

test('Oversized projected documents still fail explicitly before registration', () => {
  const fixture = document()
  fixture.content.film.description = 'x'.repeat(1024 * 1024)
  expect(() => parseHomeDocument(fixture)).toThrow(/No pudimos verificar/)
})

test('Remote parsing still rejects missing, duplicated and unreferenced manifests', () => {
  const asset = image(501)
  const fixture = document()
  fixture.content.finder.familyVisuals.custom = {
    description: '',
    image: asset.src,
  }
  expect(() => parseHomeDocument(fixture)).toThrow(/No pudimos verificar/)
  fixture.mediaAssets = [asset, asset]
  expect(() => parseHomeDocument(fixture)).toThrow(/No pudimos verificar/)
  fixture.mediaAssets = [asset, image(502)]
  expect(() => parseHomeDocument(fixture)).toThrow(/No pudimos verificar/)
  fixture.mediaAssets = [asset]
  expect(
    parseHomeDocument(fixture).content.finder.familyVisuals.custom.image,
  ).toBe(asset.src)
})

test('Remote mode preserves the SQL shape while retaining validation of unknown fields and invalid choices', () => {
  const fixture = document()
  const withUnknown = {
    ...fixture,
    content: { ...fixture.content, unknown: true },
  }
  expect(() => parseHomeDocument(withUnknown)).toThrow(/No pudimos verificar/)
  fixture.content.finder.enabledOptions.family = ['floral', 'floral']
  expect(() => parseHomeDocument(fixture)).toThrow(/No pudimos verificar/)
})

test('Delayed metadata and Home reads cannot downgrade confirmed content or reset it to version zero', () => {
  const current = document(1000)
  current.content.announcement.deliveryText = 'Current announcement'
  expect(publicHomeContent.confirm(parseHomeDocument(current))).toBe(true)
  publicHomeContent.metadata(
    { deliveryText: 'Delayed announcement', freeShippingLabel: 'Old' },
    999,
  )
  expect(publicHomeContent.peek().version).toBe(1000)
  expect(publicHomeContent.peek().content.announcement.deliveryText).toBe(
    'Current announcement',
  )
  expect(publicHomeContent.confirm(parseHomeDocument(document(999)))).toBe(
    false,
  )
  expect(
    publicHomeContent.confirm(
      parseHomeDocument({
        version: 0,
        media: null,
        content: null,
        mediaAssets: [],
      }),
    ),
  ).toBe(false)
  publicHomeContent.metadata(null, 0)
  expect(publicHomeContent.peek().content.announcement.deliveryText).toBe(
    'Current announcement',
  )
})

test('Newer metadata wins an in-flight Home race until a matching full document arrives', () => {
  const current = document(1001)
  current.content.announcement.deliveryText = 'Metadata revision 1001'
  publicHomeContent.metadata(current.content.announcement, 1001)
  expect(publicHomeContent.confirm(parseHomeDocument(document(1000)))).toBe(
    false,
  )
  expect(publicHomeContent.peek().content.announcement.deliveryText).toBe(
    'Metadata revision 1001',
  )
  expect(publicHomeContent.confirm(parseHomeDocument(current))).toBe(true)
  expect(publicHomeContent.peek().version).toBe(1001)
  publicHomeContent.metadata(null, 1000)
  expect(publicHomeContent.peek().content.announcement.deliveryText).toBe(
    'Metadata revision 1001',
  )
})
