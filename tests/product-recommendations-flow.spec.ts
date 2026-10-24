import { expectImportSuccess } from './admin-notice-fixtures'
import { mkdir } from 'node:fs/promises'
import { expect, test, type Locator, type Page } from '@playwright/test'
import type { AdminState } from '../src/services/admin-service'
import {
  importFile,
  importRecord,
  importViewports,
  openImport,
  persistedAdminState,
  reviewFile,
} from './product-import-fixtures'

const output = 'artifacts/recomendaciones-importadas'

async function recommendationNames(section: Locator) {
  return section.locator('.product-card h3').allTextContents()
}

async function assertRecommendations(section: Locator, ownName: string) {
  await expect(
    section.getByRole('heading', { name: 'También te puede gustar' }),
  ).toBeVisible()
  const cards = section.locator('.product-card')
  expect(await cards.count()).toBeGreaterThan(0)
  expect(await cards.count()).toBeLessThanOrEqual(4)
  await expect(cards.filter({ hasText: ownName })).toHaveCount(0)
  const images = cards.locator('img').first()
  await expect(images).toBeVisible()
  await expect
    .poll(() =>
      images.evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0)
}

/** Seed only this test's isolated browser-local snapshot; never a remote API. */
async function replaceBrowserState(page: Page, snapshot: AdminState) {
  snapshot.revision += 1
  await page.evaluate(async (state) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('aroma-infini-admin', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('snapshot', 'readwrite')
      transaction.objectStore('snapshot').put(state, 'current')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
    database.close()
  }, snapshot)
}

test('dos perfumes importados muestran relacionados en la vista previa y en sus fichas publicadas sin seleccionarlos manualmente', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await mkdir(output, { recursive: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const runtimeErrors: string[] = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  await openImport(page)
  const review = await reviewFile(
    page,
    await importFile([
      importRecord({
        slug: 'recomendacion-importada-uno',
        nombre: 'Perfume Importado Uno',
        sku: 'RELACIONADOS-UNO-50',
      }),
      importRecord({
        slug: 'recomendacion-importada-dos',
        nombre: 'Perfume Importado Dos',
        sku: 'RELACIONADOS-DOS-50',
      }),
    ]),
  )
  await expect(review).toContainText('2 filas correctas')
  await review
    .getByRole('button', { name: 'Confirmar e importar 2 productos' })
    .click()
  await expectImportSuccess(page, '2 productos importados')
  const imported = (await persistedAdminState(page)).products.filter((record) =>
    record.product.slug.startsWith('recomendacion-importada-'),
  )
  expect(imported).toHaveLength(2)
  for (const [index, record] of imported.entries()) {
    expect(record.detail.recommendationIds).toEqual([])
    await page.goto(`/admin/productos/${record.product.id}`)
    await page
      .getByLabel('Subir foto principal del producto', { exact: true })
      .setInputFiles(
        index === 0
          ? 'public/images/cedre-960.webp'
          : 'public/images/petale-960.webp',
      )
    await expect(
      page.locator('.admin-product-upload-item').first().locator('img'),
    ).toHaveAttribute('src', /^data:image\/webp;base64,/)
    await page
      .getByRole('button', { name: 'Vista previa', exact: true })
      .click()
    const preview = page.getByRole('dialog', {
      name: 'Vista previa del producto',
    })
    const previewSection = preview.locator('.product-recommendations')
    await previewSection.scrollIntoViewIfNeeded()
    await assertRecommendations(previewSection, record.product.name)
    await page.keyboard.press('Escape')
    const unsaved = (await persistedAdminState(page)).products.find(
      (item) => item.product.id === record.product.id,
    )!
    expect(unsaved.active).toBe(false)
    expect(unsaved.product.image).toBe('')
    expect(unsaved.detail.recommendationIds).toEqual([])
    await page.getByLabel('Producto activo en tienda').check()
    await page.getByRole('button', { name: 'Guardar producto' }).click()
    await expect(page).toHaveURL(/guardado=1/)
  }
  for (const record of imported) {
    await page.goto(`/producto/${record.product.slug}`)
    await expect(
      page.getByRole('heading', { name: record.product.name, level: 1 }),
    ).toBeVisible()
    const section = page.locator('.product-recommendations')
    await section.scrollIntoViewIfNeeded()
    await assertRecommendations(section, record.product.name)
  }
  const second = imported[1]!
  for (const viewport of importViewports) {
    await page.setViewportSize(viewport)
    await page.goto(`/producto/${second.product.slug}`)
    const section = page.locator('.product-recommendations')
    await section.scrollIntoViewIfNeeded()
    await assertRecommendations(section, second.product.name)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width + 1)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    const sectionBounds = await section.boundingBox()
    expect(sectionBounds).not.toBeNull()
    await page.screenshot({
      path: `${output}/ficha-${viewport.name}.png`,
      fullPage: true,
      animations: 'disabled',
    })
    await page.screenshot({
      path: `${output}/relacionados-${viewport.name}.png`,
      fullPage: true,
      clip: sectionBounds!,
      animations: 'disabled',
    })
  }
  const finalSnapshot = await persistedAdminState(page)
  for (const record of imported) {
    const saved = finalSnapshot.products.find(
      (item) => item.product.id === record.product.id,
    )!
    expect(saved.active).toBe(true)
    expect(saved.detail.recommendationIds).toEqual([])
  }
  expect(runtimeErrors).toEqual([])
})

test('la selección manual conserva su orden y filtra borradores y marcas ocultas igual en vista previa y ficha pública', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/admin/productos/cedre')
  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page).toHaveURL(/guardado=1/)
  const snapshot = await persistedAdminState(page)
  const source = snapshot.products.find(
    (record) => record.product.id === 'cedre',
  )!
  source.detail.recommendationIds = ['sillage', 'petale', 'figue']

  async function verifyBoth(expected: string[]) {
    await replaceBrowserState(page, snapshot)
    await page.goto('/producto/bois-clair')
    const publicSection = page.locator('.product-recommendations')
    await publicSection.scrollIntoViewIfNeeded()
    await expect
      .poll(() => recommendationNames(publicSection))
      .toEqual(expected)
    await page.goto('/admin/productos/cedre')
    await page
      .getByRole('button', { name: 'Vista previa', exact: true })
      .click()
    const preview = page.getByRole('dialog', {
      name: 'Vista previa del producto',
    })
    const previewSection = preview.locator('.product-recommendations')
    await previewSection.scrollIntoViewIfNeeded()
    await expect
      .poll(() => recommendationNames(previewSection))
      .toEqual(expected)
    await page.keyboard.press('Escape')
  }

  await verifyBoth(['Vert Silence', 'Pétale Nu', 'Figue Douce'])
  snapshot.products.find((record) => record.product.id === 'sillage')!.active =
    false
  snapshot.brands.find((brand) => brand.id === 'forme')!.active = false
  await verifyBoth(['Figue Douce'])
  snapshot.products.find((record) => record.product.id === 'figue')!.active =
    false
  await verifyBoth([
    'Cèdre Lumière',
    'Bois de Brume',
    'Santal Nuit',
    'Santal Épure',
  ])
})
