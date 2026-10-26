import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import {
  importFile,
  importRecord,
  importViewports,
  openImport,
  persistedAdminState,
  reviewFile,
} from './product-import-fixtures'

const imageFiles = [
  'public/images/petale-960.webp',
  'public/images/cedre-960.webp',
  'public/images/ambre-960.webp',
  'public/images/sillage-960.webp',
]

async function gallerySources(page: Page) {
  return page
    .locator('.admin-product-upload-item > img')
    .evaluateAll((images) =>
      images.map((image) => image.getAttribute('src') ?? ''),
    )
}

async function importWithoutImages(page: Page) {
  await openImport(page)
  const preview = await reviewFile(
    page,
    await importFile([
      importRecord({
        slug: 'cuatro-fotografias',
        nombre: 'Cuatro Fotografías',
        sku: 'CUATRO-050',
      }),
      importRecord({
        slug: 'cuatro-fotografias',
        nombre: 'Cuatro Fotografías',
        tamano_ml: 100,
        precio_soles: '219.90',
        stock: 4,
        sku: 'CUATRO-100',
      }),
    ]),
  )
  await preview
    .getByRole('button', {
      name: 'Confirmar e importar 1 producto',
      exact: true,
    })
    .click()
  await page
    .locator('.admin-notice-dialog')
    .getByRole('button', { name: 'Cerrar', exact: true })
    .click()
  await page
    .getByRole('link', { name: /pendientes|Subir fotos/i })
    .first()
    .click()
  await page
    .locator('.admin-table--products tbody tr', {
      hasText: 'Cuatro Fotografías',
    })
    .getByRole('link', { name: /Subir fotos/ })
    .click()
}

test('un producto importado recibe cuatro fotos juntas y conserva galería, principal, borrador y publicación', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await importWithoutImages(page)
  await expect(page.getByLabel(/Encuadre de foto/)).toHaveCount(0)
  const bulk = page.getByLabel('Subir varias fotos del producto', {
    exact: true,
  })
  await expect(bulk).toHaveAttribute('multiple', '')
  await bulk.setInputFiles(imageFiles)
  const gallery = page.locator('.admin-product-upload-item')
  await expect(gallery.locator(':scope > img')).toHaveCount(4)
  await expect(
    page.getByRole('button', { name: 'Guardar producto', exact: true }),
  ).toBeEnabled()
  const sources = await gallerySources(page)
  expect(new Set(sources).size).toBe(4)
  expect(
    sources.every((source) => source.startsWith('data:image/webp;base64,')),
  ).toBe(true)
  await expect(page.getByLabel(/Encuadre de foto/)).toHaveCount(0)

  await page.getByRole('button', { name: 'Vista previa', exact: true }).click()
  const productPreview = page.getByRole('dialog', {
    name: 'Vista previa del producto',
  })
  await expect(productPreview.locator('.product-gallery-frame')).toHaveCount(4)
  await expect(
    productPreview.locator('.product-gallery-frame.is-active img'),
  ).toHaveAttribute('src', sources[0])
  for (let index = 0; index < sources.length; index += 1) {
    await productPreview.locator('.product-thumbnail').nth(index).click()
    await expect(
      productPreview.locator('.product-gallery-frame.is-active img'),
    ).toHaveAttribute('src', sources[index])
  }
  await page.keyboard.press('Escape')
  const beforeSaving = (await persistedAdminState(page)).products.find(
    (record) => record.product.slug === 'cuatro-fotografias',
  )!
  expect(beforeSaving.active).toBe(false)
  expect(beforeSaving.product.image).toBe('')
  expect(beforeSaving.detail.gallery).toEqual([])

  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect(page).toHaveURL(/guardado=1/)
  const draft = (await persistedAdminState(page)).products.find(
    (record) => record.product.slug === 'cuatro-fotografias',
  )!
  expect(draft.active).toBe(false)
  expect(draft.product.image).toBe(sources[0])
  expect(draft.detail.gallery.map((view) => view.image)).toEqual(sources)
  expect(draft.detail.gallery.every((view) => view.framing === 'full')).toBe(
    true,
  )
  await page.goto('/producto/cuatro-fotografias')
  await expect(
    page.getByRole('heading', { name: 'Cuatro Fotografías', level: 1 }),
  ).toHaveCount(0)
  await page.goto(`/admin/productos/${draft.product.id}`)
  await expect(page.locator('.admin-product-upload-item > img')).toHaveCount(4)
  expect(await gallerySources(page)).toEqual(sources)
  await page.getByLabel('Producto activo en tienda').check()
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect(page).toHaveURL(/guardado=1/)
  await page.goto('/producto/cuatro-fotografias')
  await expect(
    page.getByRole('heading', { name: 'Cuatro Fotografías', level: 1 }),
  ).toBeVisible()
  await expect(page.locator('.product-gallery-frame')).toHaveCount(4)
  expect(
    await page
      .locator('.product-gallery-frame img')
      .evaluateAll((images) =>
        images.map((image) => image.getAttribute('src')),
      ),
  ).toEqual(sources)
})

test('añadir varias fotos rellena espacios y conserva las existentes, su orden y sus encuadres guardados', async ({
  page,
}) => {
  await page.goto('/admin/productos/cedre')
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect(page).toHaveURL(/guardado=1/)
  const originalRecord = (await persistedAdminState(page)).products.find(
    (record) => record.product.id === 'cedre',
  )!
  const retainedViews = [
    originalRecord.detail.gallery[0],
    originalRecord.detail.gallery[2],
  ]
  await page.goto('/admin/productos/cedre')
  const gallery = page.locator('.admin-product-upload-item')
  await expect(gallery).toHaveCount(4)
  await gallery
    .nth(1)
    .getByRole('button', { name: 'Quitar', exact: true })
    .click()
  await gallery
    .nth(2)
    .getByRole('button', { name: 'Quitar', exact: true })
    .click()
  const originals = await gallerySources(page)
  await expect(gallery).toHaveCount(4)
  await expect(
    page.getByRole('button', { name: 'Añadir otra foto', exact: true }),
  ).toHaveCount(0)
  await expect(gallery.last()).toContainText('Sin imagen')
  await page
    .getByLabel('Subir varias fotos del producto', { exact: true })
    .setInputFiles(imageFiles.slice(2))
  await expect(gallery.locator(':scope > img')).toHaveCount(4)
  const sources = await gallerySources(page)
  expect(sources.slice(0, 2)).toEqual(originals)
  expect(new Set(sources).size).toBe(4)
  await page
    .getByRole('button', { name: 'Mover foto 4 antes', exact: true })
    .click()
  const reordered = [sources[0], sources[1], sources[3], sources[2]]
  expect(await gallerySources(page)).toEqual(reordered)
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect(page).toHaveURL(/guardado=1/)
  const saved = (await persistedAdminState(page)).products.find(
    (record) => record.product.id === 'cedre',
  )!
  expect(saved.detail.gallery.map((view) => view.image)).toEqual([
    ...retainedViews.map((view) => view.image),
    sources[3],
    sources[2],
  ])
  expect(
    saved.detail.gallery
      .slice(0, 2)
      .map(({ image, framing }) => ({ image, framing })),
  ).toEqual(retainedViews.map(({ image, framing }) => ({ image, framing })))
  expect(saved.product.image).toBe(originalRecord.product.image)
  expect(
    saved.detail.gallery.slice(2).every((view) => view.framing === 'full'),
  ).toBe(true)
  await page.goto('/admin/productos/cedre')
  await expect(page.locator('.admin-product-upload-item > img')).toHaveCount(4)
  expect(await gallerySources(page)).toEqual(reordered)
  await expect(page.getByLabel(/Encuadre de foto/)).toHaveCount(0)
})

test('un lote con una imagen inválida o demasiados archivos no incorpora fotos parciales ni sobrescribe', async ({
  page,
}) => {
  await page.goto('/admin/productos/nuevo')
  const bulk = page.getByLabel('Subir varias fotos del producto', {
    exact: true,
  })
  await bulk.setInputFiles([
    {
      name: 'petale-960.webp',
      mimeType: 'image/webp',
      buffer: await readFile(imageFiles[0]),
    },
    {
      name: 'archivo-invalido.webp',
      mimeType: 'image/webp',
      buffer: Buffer.from('Este archivo no contiene una fotografía válida.'),
    },
  ])
  await expect(page.locator('.admin-notice-dialog')).toContainText(
    'archivo-invalido.webp',
  )
  await page
    .locator('.admin-notice-dialog')
    .getByRole('button', { name: 'Entendido' })
    .click()
  await expect(page.locator('.admin-product-upload-item')).toHaveCount(4)
  await expect(page.locator('.admin-product-olfactory-slot')).toHaveCount(1)
  expect(await gallerySources(page)).toEqual([])
  await bulk.setInputFiles([...imageFiles, imageFiles[0], imageFiles[1]])
  await expect(page.locator('.admin-notice-dialog')).toContainText(/5|cinco/)
  await page
    .locator('.admin-notice-dialog')
    .getByRole('button', { name: 'Entendido' })
    .click()
  expect(await gallerySources(page)).toEqual([])
  await expect(page.locator('.admin-product-upload-item')).toHaveCount(4)
  await bulk.setInputFiles(imageFiles.slice(0, 2))
  await expect(page.locator('.admin-product-upload-item > img')).toHaveCount(2)
  const sources = await gallerySources(page)
  await bulk.setInputFiles(imageFiles)
  await expect(page.locator('.admin-notice-dialog')).toContainText(/3|tres/)
  await page
    .locator('.admin-notice-dialog')
    .getByRole('button', { name: 'Entendido' })
    .click()
  expect(await gallerySources(page)).toEqual(sources)
})

test('la preparación compartida bloquea cambios de fotos, guardado, vista previa y navegación accidental', async ({
  page,
}) => {
  await page.goto('/admin/productos/cedre')
  await page
    .locator('.admin-product-upload-item')
    .last()
    .getByRole('button', { name: 'Quitar', exact: true })
    .click()
  await page.evaluate(() => {
    const original = window.createImageBitmap
    const gate = new Promise<void>((resolve) => {
      window.addEventListener('release-bulk-images', () => resolve(), {
        once: true,
      })
    })
    Object.defineProperty(window, 'createImageBitmap', {
      configurable: true,
      value: async (...args: unknown[]) => {
        await gate
        return Reflect.apply(original, window, args)
      },
    })
  })
  const bulk = page.getByLabel('Subir varias fotos del producto', {
    exact: true,
  })
  await bulk.setInputFiles(imageFiles.slice(0, 1))
  await expect(bulk).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Guardar producto', exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Vista previa', exact: true }),
  ).toBeDisabled()
  await expect(page.getByLabel('Foto predefinida (opcional)')).toHaveCount(0)
  await expect(
    page.getByLabel('Reemplazar foto principal del producto', { exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByLabel('Subir imagen del perfil olfativo', { exact: true }),
  ).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Mover foto 2 antes', exact: true }),
  ).toBeDisabled()
  await expect(
    page
      .locator('.admin-product-upload-item')
      .first()
      .getByRole('button', { name: 'Quitar', exact: true }),
  ).toBeDisabled()
  await page.getByRole('link', { name: 'Marcas', exact: true }).click()
  await page
    .locator('.admin-notice-dialog')
    .getByRole('button', { name: 'Seguir editando' })
    .click()
  await expect(page).toHaveURL('/admin/productos/cedre')
  await page.evaluate(() =>
    window.dispatchEvent(new Event('release-bulk-images')),
  )
  await expect(page.locator('.admin-product-upload-item > img')).toHaveCount(4)
  await expect(
    page.getByRole('button', { name: 'Guardar producto', exact: true }),
  ).toBeEnabled()
  await expect(
    page.getByRole('button', { name: 'Vista previa', exact: true }),
  ).toBeEnabled()
})

test('la selección múltiple se abre con teclado y el editor conserva proporciones en cuatro pantallas', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await importWithoutImages(page)
  await page.getByRole('button', { name: 'Subir fotos', exact: true }).focus()
  const chooserPromise = page.waitForEvent('filechooser')
  await page.keyboard.press('Enter')
  const chooser = await chooserPromise
  expect(chooser.isMultiple()).toBe(true)
  await chooser.setFiles(imageFiles)
  await expect(page.locator('.admin-product-upload-item > img')).toHaveCount(4)
  for (const viewport of importViewports) {
    await page.setViewportSize(viewport)
    await page.locator('#product-photos-title').scrollIntoViewIfNeeded()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    await expect(page.getByLabel(/Encuadre de foto/)).toHaveCount(0)
    const controls = page.locator(
      '.admin-product-photo-controls button, .admin-product-photo-order button',
    )
    expect(
      await controls.evaluateAll((elements) =>
        elements.every((element) => {
          const bounds = element.getBoundingClientRect()
          return (
            bounds.left >= 0 &&
            bounds.right <= innerWidth + 1 &&
            bounds.height >= 32
          )
        }),
      ),
    ).toBe(true)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    const photoBounds = await page
      .locator('.admin-product-upload-area')
      .boundingBox()
    expect(photoBounds).not.toBeNull()
    await page.screenshot({
      path: `artifacts/product-bulk-images/photos-${viewport.name}.png`,
      fullPage: true,
      clip: photoBounds!,
      animations: 'disabled',
      // Keep the viewport's sticky actions out of this document-space crop.
      style: '.admin-editor-actions { visibility: hidden !important; }',
    })
    await page
      .getByRole('button', { name: 'Vista previa', exact: true })
      .click()
    const preview = page.getByRole('dialog', {
      name: 'Vista previa del producto',
    })
    await expect(preview.locator('.product-gallery-frame')).toHaveCount(4)
    expect(
      await preview.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        return (
          bounds.left >= 0 &&
          bounds.right <= innerWidth + 1 &&
          bounds.top >= 0 &&
          bounds.bottom <= innerHeight + 1
        )
      }),
    ).toBe(true)
    await page.screenshot({
      path: `artifacts/product-bulk-images/preview-${viewport.name}.png`,
      animations: 'disabled',
    })
    await page.keyboard.press('Escape')
  }
})
