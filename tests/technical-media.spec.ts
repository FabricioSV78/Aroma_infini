import { expect, test } from '@playwright/test'
import { existsSync } from 'node:fs'
import { assetSource, assetSourceSet } from '../src/services/asset-source'
import { imageSource, imageSourceSet } from '../src/services/image-source'
import { getLocalImageVariants } from '../src/content/image-variants'

test('las URLs actuales, fotografías subidas y recursos externos conservan su identidad', () => {
  for (const source of [
    '/images/cedre-480.webp',
    '/videos/perfume-editorial-wide.mp4',
    '/brand/logo-on-light.svg',
    'https://media.example/perfume.webp?v=2',
    'data:image/webp;base64,UklGRg==',
  ]) {
    expect(assetSource(source, undefined)).toBe(source)
  }
  expect(imageSource('cedre', 480)).toBe('/images/cedre-480.webp')
  expect(imageSourceSet('cedre', [480, 960])).toBe(
    '/images/cedre-480.webp 480w, /images/cedre-960.webp 960w',
  )
  expect(imageSource('data:image/webp;base64,UklGRg==')).toBe(
    'data:image/webp;base64,UklGRg==',
  )
  expect(
    imageSourceSet('data:image/webp;base64,UklGRg==', [160, 320]),
  ).toBeUndefined()
  expect(
    imageSourceSet('https://media.example/photo.webp', [160, 320]),
  ).toBeUndefined()
})

test('un origen público futuro sustituye solo claves de medios y conserva prefijos y variantes', () => {
  const base = 'https://media.example/aroma/'
  expect(assetSource('/images/cedre-480.webp', base)).toBe(
    'https://media.example/aroma/images/cedre-480.webp',
  )
  expect(assetSource('/videos/ritual.mp4', base)).toBe(
    'https://media.example/aroma/videos/ritual.mp4',
  )
  expect(assetSource('/brand/logo.svg', base)).toBe(
    'https://media.example/aroma/brand/logo.svg',
  )
  expect(assetSource('/tienda?marca=forme', base)).toBe('/tienda?marca=forme')
  expect(assetSource('https://elsewhere.example/photo.webp', base)).toBe(
    'https://elsewhere.example/photo.webp',
  )
  expect(assetSource('data:image/webp;base64,UklGRg==', base)).toBe(
    'data:image/webp;base64,UklGRg==',
  )
  const sourceSet = '/images/a-480.webp 480w, /images/a-960.webp 960w'
  expect(assetSourceSet(sourceSet, undefined)).toBe(sourceSet)
  expect(assetSourceSet(sourceSet, base)).toBe(
    'https://media.example/aroma/images/a-480.webp 480w, https://media.example/aroma/images/a-960.webp 960w',
  )
  expect(
    assetSourceSet(
      'data:image/webp;base64,UklGRg== 1x, https://elsewhere.example/photo.webp 2x',
      base,
    ),
  ).toBe(
    'data:image/webp;base64,UklGRg== 1x, https://elsewhere.example/photo.webp 2x',
  )
})

test('una configuración inválida no cambia las rutas locales ni introduce credenciales', () => {
  const source = '/images/cedre-480.webp'
  for (const base of [
    'not-a-url',
    'http://media.example',
    'https://user:password@media.example',
    'https://media.example/?token=private',
    'https://media.example/#section',
  ]) {
    expect(assetSource(source, base)).toBe(source)
  }
})

test('las miniaturas registradas existen y una imagen administrativa desconocida no recibe variantes inventadas', () => {
  for (const family of ['ambre', 'cedre', 'neroli', 'petale', 'sillage']) {
    const source = `/images/olfactory-${family}.webp`
    const variants = getLocalImageVariants(source)!
    expect(variants.map((v) => v.width)).toEqual([160, 320, 960])
    for (const variant of variants)
      expect(existsSync(`public${variant.src}`)).toBe(true)
    const sourceSet = imageSourceSet(source, [160, 320])!
    expect(sourceSet).toContain(`olfactory-${family}-thumb-160.webp 160w`)
    expect(sourceSet).toContain(`olfactory-${family}-thumb-320.webp 320w`)
    expect(sourceSet).not.toContain('960w')
  }
  expect(imageSourceSet('/images/foto-subida.webp', [160, 320])).toBeUndefined()
})

test('los círculos del recomendador cargan miniaturas sin modificar su tamaño ni la imagen editorial', async ({
  page,
}) => {
  await page.goto('/')
  const section = page.locator('#encuentra-tu-perfume')
  await section.scrollIntoViewIfNeeded()
  const image = section.locator('.finder-entry-option img').first()
  await expect(image).toBeVisible()
  await expect(image).toHaveAttribute('srcset', /thumb-160\.webp 160w/)
  await expect
    .poll(() => image.evaluate((node: HTMLImageElement) => node.currentSrc))
    .toMatch(/thumb-(160|320)\.webp$/)
  expect(
    await image.evaluate((node: HTMLImageElement) => node.clientWidth),
  ).toBeLessThanOrEqual(64)
})
