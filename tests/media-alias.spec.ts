import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { DEFAULT_OLFACTORY_FAMILIES } from '../src/domain/olfactory-family'
import {
  parseMediaAliasDocument,
  rememberMediaAliases,
  resolveMediaAlias,
} from '../src/services/media-alias-registry'
import { assetSource, assetSourceSet } from '../src/services/asset-source'

function image(path: string, width: number, height: number, number: number) {
  const id = `62000000-0000-4000-8000-${String(number).padStart(12, '0')}`
  const src = `/media/public/dynamic/${id}/${'c'.repeat(64)}/${width}.webp`
  return {
    path,
    asset: { id, src, width, height, variants: [{ src, width, height }] },
  }
}

test('Los alias conservan candidatos y dimensiones exactos para imágenes, videos y vectores', () => {
  expect(readFileSync('src/content/media-default-inventory.json', 'utf8')).toBe(
    readFileSync('public/media-default-inventory.json', 'utf8'),
  )
  const raster = image('/images/cedre-480.webp', 480, 600, 1)
  const logoId = '62000000-0000-4000-8000-000000000002'
  const videoId = '62000000-0000-4000-8000-000000000003'
  const logo = {
    path: '/brand/logo-on-light.svg',
    asset: {
      id: logoId,
      src: `/media/public/dynamic/${logoId}/${'d'.repeat(64)}/vector.svg`,
      width: 774,
      height: 374,
      mimeType: 'image/svg+xml',
      byteSize: 21032,
    },
  }
  const video = {
    path: '/videos/perfume-editorial-mobile.mp4',
    asset: {
      id: videoId,
      src: `/media/public/dynamic/${videoId}/${'e'.repeat(64)}/video.mp4`,
      width: 720,
      height: 900,
      mimeType: 'video/mp4',
      durationMs: 12000,
      byteSize: 3243161,
    },
  }
  try {
    rememberMediaAliases({ items: [raster, logo, video] })
    for (const item of [raster, logo, video]) {
      expect(resolveMediaAlias(item.path)).toBe(item.asset.src)
      expect(
        assetSource(
          item.path,
          'https://static.invalid',
          'https://worker.invalid',
        ),
      ).toBe(`https://worker.invalid${item.asset.src}`)
    }
    expect(
      assetSourceSet(
        '/images/cedre-480.webp 480w, /images/cedre-960.webp 960w',
        'https://static.invalid',
      ),
    ).toBe(
      `${raster.asset.src} 480w, https://static.invalid/images/cedre-960.webp 960w`,
    )
  } finally {
    rememberMediaAliases({ items: [] })
  }
})

test('Una proyección inválida no modifica el mapa anterior ni admite recursos ajenos al inventario', () => {
  const raster = image('/images/cedre-480.webp', 480, 600, 11)
  try {
    rememberMediaAliases({ items: [raster] })
    for (const invalid of [
      { items: [raster, raster] },
      { items: [{ ...raster, path: '/admin/icons/icon-192.png' }] },
      {
        items: [
          { ...raster, path: '/images/hero-v2-silence-desktop-960.webp' },
        ],
      },
      {
        items: [{ ...raster, path: 'https://outside.invalid/cedre-480.webp' }],
      },
      {
        items: [
          {
            ...raster,
            asset: { ...raster.asset, src: 'data:image/webp;base64,AAAA' },
          },
        ],
      },
      { items: [image('/images/cedre-480.webp', 960, 1200, 12)] },
    ]) {
      expect(() => parseMediaAliasDocument(invalid)).toThrow()
      expect(() => rememberMediaAliases(invalid)).toThrow()
      expect(resolveMediaAlias(raster.path)).toBe(raster.asset.src)
    }
  } finally {
    rememberMediaAliases({ items: [] })
  }
})

test('El arranque espera un único catálogo público y conserva la composición responsive sin pedir archivos locales', async ({
  page,
  baseURL,
}) => {
  const desktop = [480, 780, 1024].map((width, index) =>
    image(
      `/images/account-selection-v1-portrait-${width}.webp`,
      width,
      width * 1.5,
      21 + index,
    ),
  )
  const mobile = [960, 1536].map((width, index) =>
    image(
      `/images/account-selection-v1-wide-${width}.webp`,
      width,
      width / 3,
      24 + index,
    ),
  )
  const logoId = '62000000-0000-4000-8000-000000000026'
  const logo = {
    path: '/brand/logo-on-light.svg',
    asset: {
      id: logoId,
      src: `/media/public/dynamic/${logoId}/${'f'.repeat(64)}/vector.svg`,
      width: 774,
      height: 374,
      mimeType: 'image/svg+xml',
      byteSize: 21032,
    },
  }
  const aboutDesktop = [480, 960, 1536].map((width, index) =>
    image(
      `/images/editorial-essential-v3-${width}.webp`,
      width,
      (width * 9) / 16,
      31 + index,
    ),
  )
  const aboutMobile = [480, 780].map((width, index) =>
    image(
      `/images/editorial-essential-v3-mobile-${width}.webp`,
      width,
      Math.round(width * 1.1),
      34 + index,
    ),
  )
  const story = image('/images/olfactory-santal.webp', 960, 1200, 36)
  const items = [
    ...desktop,
    ...mobile,
    ...aboutDesktop,
    ...aboutMobile,
    story,
    logo,
  ]
  let aliasesRead = 0
  const localImages: string[] = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (
      request.resourceType() === 'image' &&
      /^(?:\/images\/(?:account-selection|editorial-essential|olfactory-santal)|\/brand\/logo-)/.test(
        path,
      )
    )
      localImages.push(path)
  })
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  }
  await page.route(
    'https://abcdefghijklmnopqrst.supabase.co/**',
    async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: cors })
        return
      }
      const operation = new URL(route.request().url()).pathname
        .split('/')
        .at(-1)
      const json =
        operation === 'public_media_aliases'
          ? (aliasesRead++, { items })
          : operation === 'site_media_document'
            ? { items: [] }
            : operation === 'site_settings'
              ? { version: 0, data: null }
              : operation === 'catalog_brands'
                ? []
                : operation === 'catalog_settings'
                  ? {
                      features: { complementsEnabled: false },
                      featuredBrandId: null,
                      olfactoryFamilies: DEFAULT_OLFACTORY_FAMILIES,
                      homeAnnouncement: null,
                      homeVersion: 0,
                    }
                  : null
      await route.fulfill({ json, headers: cors })
    },
  )
  await page.route('**/media/public/dynamic/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const original = items.find((item) => item.asset.src === path)
    if (!original) {
      await route.abort()
      return
    }
    await route.fulfill({
      path: resolve('public', original.path.slice(1)),
      contentType: original.path.endsWith('.svg')
        ? 'image/svg+xml'
        : 'image/webp',
    })
  })
  await page.goto('/iniciar-sesion')
  const portrait = page.locator('.auth-editorial img')
  await expect(portrait).toHaveAttribute(
    'src',
    new URL(desktop[2].asset.src, baseURL).href,
  )
  await expect(portrait).toHaveAttribute('width', '1024')
  await expect(portrait).toHaveAttribute('height', '1536')
  await expect(page.locator('.auth-editorial source')).toHaveAttribute(
    'media',
    '(max-width: 760px)',
  )
  await expect(page.locator('.brand-logo').first()).toHaveAttribute(
    'src',
    new URL(logo.asset.src, baseURL).href,
  )
  await page.evaluate(async () => {
    const modulePath = '/src/services/builtin-media-service.ts'
    const { builtinMediaService } = await import(modulePath)
    await Promise.all(
      Array.from({ length: 8 }, () => builtinMediaService.load()),
    )
  })
  expect(aliasesRead).toBe(1)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect
    .poll(() =>
      portrait.evaluate((element) => (element as HTMLImageElement).currentSrc),
    )
    .toMatch(new RegExp(mobile.map((item) => item.asset.id).join('|')))
  expect(localImages).toEqual([])
  await page.goto('/nosotros')
  const about = page.locator('.about-hero-media img')
  await expect
    .poll(() =>
      about.evaluate((image) => (image as HTMLImageElement).currentSrc),
    )
    .toMatch(new RegExp(aboutMobile.map((item) => item.asset.id).join('|')))
  await expect
    .poll(() =>
      about.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    )
    .toBeGreaterThan(0)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390)
  expect(localImages).toEqual([])
  await page.evaluate(() => document.fonts.ready)
  await mkdir('artifacts/public-media-review', { recursive: true })
  const managed = await page.screenshot({
    path: 'artifacts/public-media-review/390-about-managed.png',
    animations: 'disabled',
  })
  await page.evaluate(async () => {
    const aliasesPath = '/src/services/media-alias-registry.ts'
    const sitePath = '/src/services/site-media-service.ts'
    const { rememberMediaAliases } = await import(aliasesPath)
    const { siteMediaService } = await import(sitePath)
    rememberMediaAliases({ items: [] })
    siteMediaService.confirm({ items: [] })
  })
  await expect(about).toHaveAttribute(
    'src',
    '/images/editorial-essential-v3-1536.webp',
  )
  await about.evaluate((image) => (image as HTMLImageElement).decode())
  const fallback = await page.screenshot({
    path: 'artifacts/public-media-review/390-about-fallback.png',
    animations: 'disabled',
  })
  expect(createHash('sha256').update(managed).digest('hex')).toBe(
    createHash('sha256').update(fallback).digest('hex'),
  )
})
