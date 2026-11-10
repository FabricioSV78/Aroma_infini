import { expect, test } from '@playwright/test'
import {
  inspectRasterHeader,
  isManagedMediaSource,
  MEDIA_ORIGINAL_MAX_PIXELS,
  parseManagedMediaAsset,
  parseManagedMediaPath,
  productMediaWidths,
  validOriginalImageDimensions,
} from '../src/domain/media'
import {
  assetSource,
  assetSourceSet,
  mediaApiBaseUrl,
} from '../src/services/asset-source'
import { imageSource, imageSourceSet } from '../src/services/image-source'
import {
  getManagedMedia,
  rememberManagedAssets,
  registerManagedMedia,
} from '../src/services/media-registry'

function asset(value = 1, width = 1600) {
  const id = `10000000-0000-4000-8000-${value.toString(16).padStart(12, '0')}`
  const prefix = `/media/public/dynamic/${id}/${'a'.repeat(64)}`
  return {
    id,
    src: `${prefix}/${width}.webp`,
    width,
    height: Math.round(width * 1.25),
    variants: productMediaWidths(width).map((width) => ({
      src: `${prefix}/${width}.webp`,
      width,
      height: Math.round(width * 1.25),
    })),
  }
}

test('Los anchos responden al tamaño real, sin ampliar una fuente de 800 o 1100 px', () => {
  expect(productMediaWidths(800)).toEqual([480, 800])
  expect(productMediaWidths(960)).toEqual([480, 960])
  expect(productMediaWidths(1100)).toEqual([480, 960, 1100])
  expect(productMediaWidths(1600)).toEqual([480, 960, 1600])
  expect(productMediaWidths(1601)).toEqual([])
  expect(productMediaWidths(Number.NaN)).toEqual([])
})

test('Una fotografía y sus candidatos comparten UUID, hash y dimensiones verificadas', () => {
  const supplied = asset()
  const parsed = parseManagedMediaAsset(supplied)
  expect(parsed).toEqual(supplied)
  expect(parsed).not.toBe(supplied)
  expect(parseManagedMediaPath(parsed.src)).toEqual({
    id: parsed.id,
    hash: 'a'.repeat(64),
    width: 1600,
    src: parsed.src,
  })
  expect(isManagedMediaSource(parsed.src)).toBe(true)
})

test('No se aceptan URLs externas, data, blob, traversal, firmas temporales ni nombres arbitrarios', () => {
  for (const source of [
    'https://external.invalid/file.webp',
    '//external.invalid/file.webp',
    'data:image/webp;base64,AA==',
    'blob:https://shop.invalid/temporary',
    '/media/public/dynamic/../file.webp',
    `${asset().src}?token=temporary`,
    `${asset().src}#fragment`,
    asset().src.replace('/1600.webp', '/01.webp'),
  ]) {
    expect(parseManagedMediaPath(source)).toBeNull()
    expect(() => parseManagedMediaAsset({ ...asset(), src: source })).toThrow()
  }
})

test('Los manifiestos rechazan candidatos ausentes, repetidos, ajenos o de mayor resolución', () => {
  const supplied = asset()
  for (const invalid of [
    { ...supplied, variants: [] },
    { ...supplied, variants: supplied.variants.slice(0, 2) },
    {
      ...supplied,
      variants: [
        supplied.variants[0],
        supplied.variants[0],
        supplied.variants[2],
      ],
    },
    {
      ...supplied,
      variants: [
        ...supplied.variants.slice(0, 2),
        { ...supplied.variants[2], width: 2000 },
      ],
    },
    {
      ...supplied,
      variants: [
        { ...supplied.variants[0], height: 300 },
        ...supplied.variants.slice(1),
      ],
    },
    {
      ...supplied,
      variants: [
        { ...supplied.variants[0], src: asset(2).variants[0].src },
        ...supplied.variants.slice(1),
      ],
    },
    { ...supplied, width: 1599 },
    { ...supplied, id: asset(2).id },
  ])
    expect(() => parseManagedMediaAsset(invalid)).toThrow()
})

test('El manifiesto administrado conserva los límites preparados, separados del original', () => {
  const original = asset(9991)
  expect(
    parseManagedMediaPath(original.src.replace('/1600.webp', '/2305.webp')),
  ).toBeNull()
  expect(() =>
    parseManagedMediaAsset({
      ...original,
      height: 2500,
      variants: original.variants.map((v) => ({
        ...v,
        height: Math.round((v.width * 2500) / 1600),
      })),
    }),
  ).toThrow()
})

test('Las URLs administradas usan el origen Worker y no se redirigen con la migración de estáticos', () => {
  const image = asset().src
  expect(
    assetSource(image, 'https://static.invalid', 'https://media.invalid'),
  ).toBe(`https://media.invalid${image}`)
  expect(assetSource(image, 'https://static.invalid', undefined)).toBe(image)
  expect(assetSource('/images/existing.webp', 'https://static.invalid')).toBe(
    'https://static.invalid/images/existing.webp',
  )
  expect(assetSourceSet(`${image} 1600w`, 'https://static.invalid')).toBe(
    `${image} 1600w`,
  )
  expect(mediaApiBaseUrl('https://media.invalid')).toBe('https://media.invalid')
  expect(mediaApiBaseUrl('http://127.0.0.1:8787', true)).toBe(
    'http://127.0.0.1:8787',
  )
  expect(mediaApiBaseUrl('http://127.0.0.1:8787', false)).toBeNull()
  for (const address of [
    'https://user:password@media.invalid',
    'https://media.invalid/path',
    'https://media.invalid?secret=x',
    'http://public.invalid',
    'javascript:alert(1)',
  ])
    expect(mediaApiBaseUrl(address, true)).toBeNull()
})

test('srcset contiene sólo candidatos reales y no supone que existe 960 px para un original de 800 px', () => {
  const media = registerManagedMedia(asset(3, 800))
  expect(imageSource(media.src)).toBe(media.src)
  expect(imageSource(media.src, 960)).toBe(media.src)
  expect(imageSource(media.src, 320)).toBe(media.variants[0].src)
  expect(imageSourceSet(media.src, [480, 960, 1600])).toBe(
    `${media.variants[0].src} 480w, ${media.src} 800w`,
  )
  expect(imageSourceSet(asset(4).src, [480, 960])).toBeUndefined()
  const large = registerManagedMedia(asset(5))
  expect(imageSourceSet(large.src, [480, 960])).toBe(
    `${large.variants[0].src} 480w, ${large.variants[1].src} 960w, ${large.src} 1600w`,
  )
})

test('El registro conserva candidatos únicos para diez y cincuenta productos sin fabricar relaciones', () => {
  for (const count of [10, 50]) {
    const values = Array.from({ length: count * 5 }, (_, index) =>
      asset(count * 1000 + index),
    )
    rememberManagedAssets(values)
    for (const value of values) {
      expect(getManagedMedia(value.src)).toEqual(value)
      expect(imageSourceSet(value.src, [480, 960])).toContain(' 480w, ')
    }
  }
})

test('Un manifiesto inválido no registra parcialmente otras imágenes y una identidad inmutable no cambia', () => {
  const untouched = asset(9001)
  expect(() =>
    rememberManagedAssets([untouched, { ...asset(9002), variants: [] }]),
  ).toThrow()
  expect(getManagedMedia(untouched.src)).toBeUndefined()
  const value = registerManagedMedia(asset(9003))
  expect(() =>
    registerManagedMedia({ ...value, variants: value.variants.slice(1) }),
  ).toThrow()
  expect(getManagedMedia(value.src)).toEqual(value)
})

function png(width: number, height: number) {
  const header = new Uint8Array(24)
  header.set([137, 80, 78, 71, 13, 10, 26, 10], 0)
  header.set([73, 72, 68, 82], 12)
  new DataView(header.buffer).setUint32(16, width)
  new DataView(header.buffer).setUint32(20, height)
  return header
}

test('La inspección de cabecera detecta dimensiones de PNG, JPEG y WebP antes de decodificar', () => {
  expect(inspectRasterHeader(png(1600, 2000))).toEqual({
    mime: 'image/png',
    width: 1600,
    height: 2000,
    animated: false,
  })
  const jpeg = new Uint8Array([
    255, 216, 255, 192, 0, 17, 8, 7, 208, 6, 64, 3, 1, 17, 0, 2, 17, 0, 3, 17,
    0,
  ])
  expect(inspectRasterHeader(jpeg)).toEqual({
    mime: 'image/jpeg',
    width: 1600,
    height: 2000,
    animated: false,
  })
  const webp = new Uint8Array(30)
  webp.set([...new TextEncoder().encode('RIFF')], 0)
  new DataView(webp.buffer).setUint32(4, 22, true)
  webp.set([...new TextEncoder().encode('WEBPVP8X')], 8)
  new DataView(webp.buffer).setUint32(16, 10, true)
  webp.set([63, 6, 0, 207, 7, 0], 24)
  expect(inspectRasterHeader(webp)).toEqual({
    mime: 'image/webp',
    width: 1600,
    height: 2000,
    animated: false,
  })
  webp[20] = 2
  expect(inspectRasterHeader(webp)?.animated).toBe(true)
})

test('Cabeceras corruptas y descompresiones desproporcionadas se rechazan antes del bitmap', () => {
  expect(inspectRasterHeader(new Uint8Array(100))).toBeNull()
  expect(inspectRasterHeader(png(1000, 1000).slice(0, 20))).toBeNull()
  expect(validOriginalImageDimensions(5000, 8000)).toBe(true)
  expect(5000 * 8000).toBe(MEDIA_ORIGINAL_MAX_PIXELS)
  expect(validOriginalImageDimensions(5001, 8000)).toBe(false)
  expect(validOriginalImageDimensions(13000, 1)).toBe(false)
  expect(validOriginalImageDimensions(0, 1000)).toBe(false)
  expect(validOriginalImageDimensions(Number.NaN, 1000)).toBe(false)
})
