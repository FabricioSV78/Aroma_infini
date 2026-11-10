import { expect, test } from '@playwright/test'
import {
  createDefaultHomeContent,
  normalizeHomeContent,
  upgradeLegacyHeroContent,
  validateHomeContent,
} from '../src/content/home-editor'
import {
  getHeroFallback,
  isHeroDestination,
  orderedHeroContent,
  resolveHeroDestination,
} from '../src/domain/hero-content'
import {
  parseHomeDocument,
  publicHomeContent,
} from '../src/services/home-content-service'
import type { Product } from '../src/types/catalog'

const product: Product = {
  id: 'bc000000-0000-4000-8000-000000000001',
  slug: 'hawas-ice',
  name: 'Hawas Ice',
  brandId: 'fixture-brand',
  image: 'fixture-image',
  family: 'Fixture',
  variants: [],
}
const catalog = { products: [product], complementsEnabled: false }

test('campaign ordering retains source identity and original visual fallbacks', () => {
  const slides = createDefaultHomeContent().hero
  expect(
    orderedHeroContent(slides).map((slide) => slide.fallbackIndex),
  ).toEqual([0, 1, 3, 4, 2])
  slides[0].order = 9
  slides[1].published = false
  expect(orderedHeroContent(slides, true).map((slide) => slide.id)).toEqual([
    'campaign-3',
    'campaign-4',
    'campaign-2',
    'campaign-0',
  ])
  expect(getHeroFallback(slides[3].fallbackIndex).image).toBe('hero-v4-amber')
})

test('product destinations use their stable ID and current public slug', () => {
  const destination = { type: 'product' as const, productId: product.id }
  expect(resolveHeroDestination(destination, catalog)).toEqual({
    href: '/producto/hawas-ice',
    warning: null,
  })
  expect(
    resolveHeroDestination(destination, {
      ...catalog,
      products: [{ ...product, slug: 'hawas-ice-new-slug' }],
    }).href,
  ).toBe('/producto/hawas-ice-new-slug')
  expect(
    resolveHeroDestination(destination, { ...catalog, products: [] }),
  ).toMatchObject({ href: null, warning: expect.any(String) })
  expect(
    resolveHeroDestination(destination, {
      ...catalog,
      products: [{ ...product, slug: '//foreign.invalid' }],
    }).href,
  ).toBeNull()
})

test('category and public page destinations respect feature visibility and the internal allowlist', () => {
  expect(
    resolveHeroDestination({ type: 'category', category: 'hombre' }, catalog)
      .href,
  ).toBe('/tienda?genero=hombre')
  expect(
    resolveHeroDestination(
      { type: 'category', category: 'complementos' },
      catalog,
    ),
  ).toMatchObject({ href: null, warning: expect.any(String) })
  expect(
    resolveHeroDestination(
      { type: 'category', category: 'complementos' },
      { ...catalog, complementsEnabled: true },
    ).href,
  ).toBe('/tienda?tipo=complemento')
  expect(
    resolveHeroDestination({ type: 'page', page: '/contacto' }, catalog).href,
  ).toBe('/contacto')
  expect(isHeroDestination({ type: 'page', page: '/admin' })).toBe(false)
  expect(
    isHeroDestination({ type: 'page', page: 'https://foreign.invalid' }),
  ).toBe(false)
  expect(isHeroDestination({ type: 'shop', href: 'javascript:alert(1)' })).toBe(
    false,
  )
})

test('hidden incomplete campaigns can be saved while published media and text are validated', () => {
  const content = createDefaultHomeContent()
  const campaign = content.hero[0]
  Object.assign(campaign, {
    published: false,
    mediaType: 'video',
    fallbackIndex: null,
    title: '',
    eyebrow: '',
    description: '',
    cta: '',
    alt: '',
  })
  expect(validateHomeContent(content)).toBeNull()
  campaign.published = true
  expect(validateHomeContent(content)).toContain('Título')
  campaign.showText = false
  campaign.showButton = false
  expect(validateHomeContent(content)).toContain('video y su portada')
  campaign.mediaType = 'image'
  campaign.alt = 'Fixture image'
  expect(validateHomeContent(content)).toContain('una imagen')
})

test('the exact legacy shape upgrades without accepting unknown campaign fields', () => {
  const content = createDefaultHomeContent()
  const legacy = content.hero.map(
    ({ eyebrow, title, description, cta, alt, desktopImage, mobileImage }) => ({
      eyebrow,
      title,
      description,
      cta,
      alt,
      desktopImage,
      mobileImage,
    }),
  )
  expect(upgradeLegacyHeroContent(legacy)).toEqual(content.hero)
  const malformed = legacy.map((slide, index) =>
    index ? slide : { ...slide, unsafeVideo: 'https://foreign.invalid' },
  )
  expect(upgradeLegacyHeroContent(malformed)).toEqual(malformed)
  expect(() =>
    parseHomeDocument({
      content: { ...content, hero: malformed },
      media: { hombre: null, mujer: null, unisex: null, complementos: null },
      mediaAssets: [],
      version: 1,
    }),
  ).toThrow()
})

test('an explicitly empty public Hero remains empty and administrative publication still requires a campaign', () => {
  const content = createDefaultHomeContent()
  content.hero = []
  expect(normalizeHomeContent(content).hero).toEqual([])
  expect(validateHomeContent(content)).toContain('entre una y diez')
  const fixture = {
    content,
    media: { hombre: null, mujer: null, unisex: null, complementos: null },
    mediaAssets: [],
    version: 1,
  }
  expect(
    parseHomeDocument(fixture, null, { publicDocument: true }).content.hero,
  ).toEqual([])
  expect(() => parseHomeDocument(fixture)).toThrow()
})

test('confirming an administrative publication does not copy hidden campaigns into the public cache', () => {
  const content = createDefaultHomeContent()
  content.hero[0].published = false
  content.hero[0].title = 'Private upcoming campaign'
  const document = parseHomeDocument({
    content,
    media: { hombre: null, mujer: null, unisex: null, complementos: null },
    mediaAssets: [],
    version: 900,
  })
  expect(publicHomeContent.confirm(document)).toBe(true)
  expect(publicHomeContent.peek().content.hero).toHaveLength(4)
  expect(JSON.stringify(publicHomeContent.peek())).not.toContain(
    'Private upcoming campaign',
  )
  expect(document.content.hero).toHaveLength(5)
})
