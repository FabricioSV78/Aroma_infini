import { expect, test } from './test'
import {
  parseSiteMediaDocument,
  resolveSiteMedia,
} from '../src/domain/site-media-slots'
import { siteMediaDefaults } from '../src/content/site-media-defaults'

function managedImage() {
  const id = '51000000-0000-4000-8000-000000000001'
  const prefix = `/media/public/dynamic/${id}/${'5'.repeat(64)}`
  return {
    id,
    src: `${prefix}/780.webp`,
    width: 780,
    height: 858,
    variants: [
      { src: `${prefix}/480.webp`, width: 480, height: 528 },
      { src: `${prefix}/780.webp`, width: 780, height: 858 },
    ],
  }
}

test('El catálogo conserva las composiciones originales de Nosotros y acceso', () => {
  const empty = parseSiteMediaDocument({ items: [] })
  expect(resolveSiteMedia(empty, 'about.hero.mobile')).toEqual({
    src: '/images/editorial-essential-v3-mobile-780.webp',
    srcSet:
      '/images/editorial-essential-v3-mobile-480.webp 480w, /images/editorial-essential-v3-mobile-780.webp 780w',
    width: 780,
    height: 858,
    alt: siteMediaDefaults['about.hero.mobile'].alt,
  })
  expect(resolveSiteMedia(empty, 'auth.customer.mobile')).toMatchObject({
    width: 1536,
    height: 512,
    alt: '',
  })
  expect(resolveSiteMedia(empty, 'identity.logo').src).toBe(
    '/brand/logo-on-light.svg',
  )
  expect(resolveSiteMedia(empty, 'seo.catalog')).toMatchObject({
    width: 1448,
    height: 1086,
  })
})

test('Una ubicación solo publica candidatos verificados y no acepta identidades contradictorias', () => {
  const asset = managedImage()
  const item = {
    slot: 'about.hero.mobile',
    alt: 'Una nueva portada',
    version: 2,
    assetId: asset.id,
    asset,
  }
  const document = parseSiteMediaDocument({ items: [item] })
  expect(resolveSiteMedia(document, 'about.hero.mobile')).toMatchObject({
    src: asset.src,
    srcSet: `${asset.variants[0].src} 480w, ${asset.src} 780w`,
    alt: 'Una nueva portada',
  })
  for (const invalid of [
    { items: [item, item] },
    { items: [{ ...item, assetId: 'other-asset' }] },
    { items: [{ ...item, slot: 'unrecognised.slot' }] },
    {
      items: [
        {
          ...item,
          asset: { ...asset, src: 'https://outside.invalid/photo.webp' },
        },
      ],
    },
    { items: [{ ...item, asset: { ...asset, variants: [] } }] },
    {
      items: [
        {
          ...item,
          asset: {
            id: asset.id,
            src: asset.src.replace('/780.webp', '/vector.svg'),
            width: 780,
            height: 858,
            byteSize: 100,
            mimeType: 'image/svg+xml',
          },
        },
      ],
    },
  ])
    expect(() => parseSiteMediaDocument(invalid)).toThrow()
  const cleared = parseSiteMediaDocument({
    items: [{ ...item, version: 3, assetId: null, asset: null }],
  })
  expect(resolveSiteMedia(cleared, 'about.hero.mobile')).toEqual(
    siteMediaDefaults['about.hero.mobile'],
  )
})

test('Nosotros conserva tamaños y breakpoint al actualizar la portada compartida', async ({
  page,
}) => {
  await page.goto('/nosotros')
  const hero = page.locator('.about-hero-media img')
  const source = page.locator('.about-hero-media source')
  await expect(source).toHaveAttribute('media', '(max-width: 767px)')
  await expect(hero).toHaveAttribute('width', '1536')
  await expect(hero).toHaveAttribute('height', '864')
  await expect(hero).toHaveAttribute(
    'sizes',
    '(max-width: 767px) calc(100vw - 32px), (max-width: 1680px) calc(100vw - 80px), 1680px',
  )
  await expect(hero).toHaveAttribute(
    'srcset',
    siteMediaDefaults['about.hero.desktop'].srcSet,
  )
  const asset = managedImage()
  await page.evaluate(async (asset) => {
    const modulePath = '/src/services/site-media-service.ts'
    const { siteMediaService } = await import(modulePath)
    siteMediaService.confirm({
      items: [
        {
          slot: 'about.hero.mobile',
          alt: 'Nueva portada móvil',
          version: 2,
          assetId: asset.id,
          asset,
        },
      ],
    })
  }, asset)
  await expect(source).toHaveAttribute(
    'srcset',
    `${asset.variants[0].src} 480w, ${asset.src} 780w`,
  )
  await expect(hero).toHaveAttribute(
    'src',
    siteMediaDefaults['about.hero.desktop'].src,
  )
  await expect(hero).toHaveAttribute('width', '1536')
  await expect(source).toHaveAttribute(
    'sizes',
    '(max-width: 767px) calc(100vw - 32px), 100vw',
  )
})

test('El acceso mantiene su fotografía panorámica móvil y su retrato de escritorio', async ({
  page,
}) => {
  await page.goto('/iniciar-sesion')
  const image = page.locator('.auth-editorial img')
  const source = page.locator('.auth-editorial source')
  await expect(source).toHaveAttribute('media', '(max-width: 760px)')
  await expect(source).toHaveAttribute(
    'srcset',
    siteMediaDefaults['auth.customer.mobile'].srcSet,
  )
  await expect(source).toHaveAttribute(
    'sizes',
    '(max-width: 392px) 360px, (max-width: 472px) calc(100vw - 32px), 440px',
  )
  await expect(image).toHaveAttribute(
    'srcset',
    siteMediaDefaults['auth.customer.desktop'].srcSet,
  )
  await expect(image).toHaveAttribute('width', '1024')
  await expect(image).toHaveAttribute('height', '1536')
  await expect(image).toHaveAttribute('alt', '')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() =>
      image.evaluate((element) => (element as HTMLImageElement).currentSrc),
    )
    .toContain('/images/account-selection-v1-wide-')
})
