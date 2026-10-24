import { expect, test } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { fourCategoryImages } from '../src/content/category-images'
import { setComplementsEnabled } from './complements-fixtures'

const categoryIds = ['hombre', 'mujer', 'unisex', 'complementos'] as const
const categoryTitles = ['Para él', 'Para ella', 'Unisex', 'Complementos']
const destinations = [
  '/tienda?genero=hombre',
  '/tienda?genero=mujer',
  '/tienda?genero=unisex',
  '/tienda?tipo=complemento',
]
const scenarios = [
  { name: 'monitor', width: 1920, height: 1080, dpr: 2 },
  { name: 'laptop', width: 1366, height: 768, dpr: 2 },
  { name: 'tablet', width: 768, height: 1024, dpr: 2 },
  { name: 'tablet-wide', width: 1023, height: 1024, dpr: 2 },
  { name: 'mobile', width: 390, height: 844, dpr: 3 },
]

function localFile(url: string) {
  return join(process.cwd(), 'public', new URL(url).pathname.replace(/^\//, ''))
}

// Confirmed dimensions of the current source photographs. Provenance lives in
// discovery-assets.json/category-complements-v1.json; tests need no external PNG.
const originalDimensions = [
  { width: 1024, height: 1536 },
  { width: 1536, height: 1024 },
  { width: 1536, height: 1024 },
  { width: 1122, height: 1402 },
]

for (const viewport of scenarios) {
  test(`Las categorías eligen resolución suficiente sin ampliar los originales · ${viewport.name} @${viewport.dpr}x`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.dpr,
      reducedMotion: 'reduce',
      baseURL: 'http://127.0.0.1:5173',
    })
    try {
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      expect(await setComplementsEnabled(page, true)).toBe('saved')
      await page.goto('/')
      await page.evaluate(() => document.fonts.ready)
      const section = page.locator('#descubrir')
      await section.scrollIntoViewIfNeeded()
      await expect(section.locator('.category h3')).toHaveText(categoryTitles)
      expect(
        await section
          .locator('.category')
          .evaluateAll((links) =>
            links.map((link) => link.getAttribute('href')),
          ),
      ).toEqual(destinations)
      const images = section.locator('.category-image img')
      await expect(images).toHaveCount(4)
      expect(
        await images.evaluateAll((images) =>
          images.every(
            (image) => (image as HTMLImageElement).loading === 'lazy',
          ),
        ),
      ).toBe(true)
      await images.evaluateAll(async (images) => {
        await Promise.all(
          images.map(async (element) => {
            const image = element as HTMLImageElement
            image.loading = 'eager'
            await image.decode()
          }),
        )
      })
      const measurements = await images.evaluateAll((images) =>
        images.map((element) => {
          const image = element as HTMLImageElement
          const bounds = image.getBoundingClientRect()
          const frame = image
            .closest('.category-image')!
            .getBoundingClientRect()
          return {
            source: image.currentSrc,
            sourceSet: image.srcset,
            sourceSizes: image.sizes,
            width: bounds.width,
            height: bounds.height,
            frame: {
              x: frame.x,
              y: frame.y,
              width: frame.width,
              height: frame.height,
            },
            fit: getComputedStyle(image).objectFit,
          }
        }),
      )
      const report = []
      for (const [index, measurement] of measurements.entries()) {
        const asset = fourCategoryImages[categoryIds[index]]
        expect(measurement.fit).toBe('cover')
        expect(measurement.sourceSizes).not.toBe('')
        expect(measurement.source).toContain(asset.image)
        expect(measurement.frame.width / measurement.frame.height).toBeCloseTo(
          0.8,
          2,
        )
        if (viewport.width >= 1024) {
          expect(measurement.frame.height).toBeLessThanOrEqual(550)
        }
        expect(measurement.width).toBeCloseTo(measurement.frame.width, 1)
        expect(measurement.height).toBeCloseTo(measurement.frame.height, 1)
        const candidates = measurement.sourceSet.split(',').map((candidate) => {
          const [path, descriptor] = candidate.trim().split(/\s+/)
          return {
            path: new URL(path, 'http://127.0.0.1:5173').href,
            width: Number(descriptor.replace(/w$/, '')),
          }
        })
        expect(candidates.length).toBeGreaterThanOrEqual(3)
        expect(candidates.map((candidate) => candidate.width)).toEqual([
          ...asset.widths,
        ])
        const source = originalDimensions[index]
        const nativeCropWidth = Math.min(source.width, source.height * 0.8)
        for (const candidate of candidates) {
          const metadata = await sharp(localFile(candidate.path)).metadata()
          expect(metadata.width).toBe(candidate.width)
          expect(metadata.width! / metadata.height!).toBeCloseTo(
            asset.width / asset.height,
            2,
          )
          expect(metadata.width!).toBeLessThanOrEqual(
            Math.ceil(nativeCropWidth),
          )
        }
        const current = await sharp(localFile(measurement.source)).metadata()
        expect(
          candidates.some((candidate) => candidate.path === measurement.source),
        ).toBe(true)
        const largest = Math.max(
          ...candidates.map((candidate) => candidate.width),
        )
        const required =
          Math.max(
            measurement.width,
            (measurement.height * current.width!) / current.height!,
          ) * viewport.dpr
        // Some originals cannot supply tablet @2x; select their largest native crop,
        // rather than describing artificially enlarged pixels as higher quality.
        expect(current.width! + 1).toBeGreaterThanOrEqual(
          Math.min(required, largest),
        )
        report.push({
          title: categoryTitles[index],
          requiredPixels: Math.round(required),
          selectedWidth: current.width,
          selectedHeight: current.height,
          largestNativeVariant: largest,
          originalWidth: source.width,
          originalHeight: source.height,
          nativeAssetWidth: asset.width,
          nativeAssetHeight: asset.height,
          sourceSizes: measurement.sourceSizes,
          currentSrc: measurement.source,
        })
      }
      if (viewport.width >= 1024) {
        for (const measurement of measurements) {
          expect(measurement.frame.y).toBeCloseTo(measurements[0].frame.y, 1)
        }
      } else {
        expect(measurements[0].frame.y).toBeCloseTo(measurements[1].frame.y, 1)
        expect(measurements[2].frame.y).toBeCloseTo(measurements[3].frame.y, 1)
        expect(measurements[2].frame.y).toBeGreaterThan(measurements[0].frame.y)
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      expect(errors).toEqual([])
      await mkdir('artifacts/category-image-quality', { recursive: true })
      await writeFile(
        `artifacts/category-image-quality/${viewport.name}-${viewport.dpr}x.json`,
        JSON.stringify(report, null, 2),
      )
      await section.screenshot({
        path: `artifacts/category-image-quality/${viewport.name}-${viewport.dpr}x.png`,
        animations: 'disabled',
        style: '.site-header, .skip-link { visibility: hidden !important; }',
      })
    } finally {
      await context.close()
    }
  })
}

for (const image of [
  { width: 1920, height: 2400, expectedWidth: 1600, expectedHeight: 2000 },
  { width: 800, height: 1000, expectedWidth: 800, expectedHeight: 1000 },
]) {
  test(`Las fotos de categorías subidas conservan detalle hasta el tamaño útil disponible · ${image.width}px`, async ({
    page,
  }) => {
    const buffer = await sharp({
      create: {
        width: image.width,
        height: image.height,
        channels: 3,
        background: '#e5dccd',
      },
    })
      .png()
      .toBuffer()
    await page.goto('/admin/home')
    const sources = await page.evaluate(
      async ({ bytes }) => {
        const path = '/src/features/admin/prepareImageFile.ts'
        const { prepareImageFile, homeImagePresets, productImagePreset } =
          (await import(
            path
          )) as typeof import('../src/features/admin/prepareImageFile')
        const file = new File([Uint8Array.from(bytes)], 'categoria.png', {
          type: 'image/png',
        })
        return {
          category: await prepareImageFile(file, homeImagePresets.complementos),
          product: await prepareImageFile(file, productImagePreset),
        }
      },
      { bytes: [...buffer] },
    )
    const category = await sharp(
      Buffer.from(sources.category.split(',')[1], 'base64'),
    ).metadata()
    const product = await sharp(
      Buffer.from(sources.product.split(',')[1], 'base64'),
    ).metadata()
    expect(category.width).toBe(image.expectedWidth)
    expect(category.height).toBe(image.expectedHeight)
    expect(product.width).toBe(800)
    expect(product.height).toBe(1000)
    if (image.width === 1920) {
      const result = await page.evaluate(async (categoryPhoto) => {
        const path = '/src/services/admin-service.ts'
        const { adminService, hydrateAdminStore } = (await import(
          path
        )) as typeof import('../src/services/admin-service')
        await hydrateAdminStore()
        const snapshot = adminService.getSnapshot()
        const saved = adminService.saveHome(
          { ...snapshot.homeMedia, complementos: categoryPhoto },
          snapshot.homeContent,
        )
        const enabled = adminService.saveStoreFeatures({
          complementsEnabled: true,
        })
        await adminService.flush()
        return { saved: saved.kind, enabled: enabled.kind }
      }, sources.category)
      expect(result).toEqual({ saved: 'saved', enabled: 'saved' })
      await page.goto('/')
      const uploaded = page.locator('#descubrir .category-image img').nth(3)
      await uploaded.scrollIntoViewIfNeeded()
      await expect(uploaded).toHaveAttribute('src', sources.category)
      await expect(uploaded).not.toHaveAttribute('srcset')
      const decoded = await uploaded.evaluate(
        async (image: HTMLImageElement) => {
          await image.decode()
          return { width: image.naturalWidth, height: image.naturalHeight }
        },
      )
      expect(decoded).toEqual({ width: 1600, height: 2000 })
    }
  })
}
