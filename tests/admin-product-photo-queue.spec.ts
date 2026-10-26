import { mkdir } from 'node:fs/promises'
import sharp from 'sharp'
import { expect, test, type Page } from '@playwright/test'
import { expectImportSuccess } from './admin-notice-fixtures'
import {
  importFile,
  importRecord,
  importViewports,
  openImport,
  persistedAdminState,
  reviewFile,
} from './product-import-fixtures'

const photos = [
  'public/images/petale-960.webp',
  'public/images/cedre-960.webp',
  'public/images/ambre-960.webp',
  'public/images/sillage-960.webp',
  'public/images/olfactory-cedre.webp',
]

async function importPendingProducts(page: Page, count: number) {
  await openImport(page)
  const before = await persistedAdminState(page)
  const records = Array.from({ length: count }, (_, index) => {
    const ordinal = String(index + 1).padStart(3, '0')
    return [50, 100].map((ml) =>
      importRecord({
        slug: `cola-fotos-${count}-${ordinal}`,
        nombre: `Cola Fotos ${count} ${ordinal}`,
        tamano_ml: ml,
        sku: `COLA-${count}-${ordinal}-${ml}`,
        precio_soles: ml === 50 ? '159.90' : '229.90',
        stock: ml === 50 ? 8 : 3,
      }),
    )
  }).flat()
  const review = await reviewFile(
    page,
    await importFile(records, undefined, `cola-fotos-${count}.xlsx`),
  )
  await review
    .getByRole('button', {
      name: `Confirmar e importar ${count} productos`,
      exact: true,
    })
    .click()
  await expectImportSuccess(page, `${count} productos importados`)
  const stored = await persistedAdminState(page)
  return {
    before,
    stored,
    imported: stored.products.filter(({ product }) =>
      product.slug.startsWith(`cola-fotos-${count}-`),
    ),
  }
}

async function gallerySources(page: Page) {
  return page
    .locator('.admin-product-upload-item > img')
    .evaluateAll((imgs) => imgs.map((img) => img.getAttribute('src') ?? ''))
}

for (const count of [10, 50, 100]) {
  test(`${count} productos Excel reciben SKU de producto y aparecen en la cola de fotos sin alterar presentaciones`, async ({
    page,
  }) => {
    test.setTimeout(90_000)
    const { before, stored, imported } = await importPendingProducts(
      page,
      count,
    )
    expect(imported).toHaveLength(count)
    expect(stored.products).toHaveLength(before.products.length + count)
    expect(stored.revision).toBe(before.revision + 1)
    expect(
      stored.products.filter(({ product }) =>
        before.products.some((record) => record.product.id === product.id),
      ),
    ).toEqual(before.products)
    const productCodes = stored.products.map(({ product }) => product.sku)
    expect(productCodes.every((sku) => /^[1-9]\d{4}$/.test(sku ?? ''))).toBe(
      true,
    )
    expect(new Set(productCodes).size).toBe(stored.products.length)
    for (const record of imported) {
      expect(record.active).toBe(false)
      expect(record.product.image).toBe('')
      expect(record.detail.gallery).toEqual([])
      expect(record.detail.olfactoryImage).toBeNull()
      expect(
        record.product.variants.map(({ ml, stock, priceCents }) => ({
          ml,
          stock,
          priceCents,
        })),
      ).toEqual([
        { ml: 50, stock: 8, priceCents: 15990 },
        { ml: 100, stock: 3, priceCents: 22990 },
      ])
    }
    await page.goto('/admin/productos?visibilidad=pending-images')
    await expect(
      page.getByRole('combobox', { name: 'Fotografías', exact: true }),
    ).toHaveCount(0)
    await expect(
      page.getByRole('combobox', { name: 'Visibilidad', exact: true }),
    ).toHaveValue('pending-images')
    await expect(page.getByRole('search').getByRole('combobox')).toHaveCount(2)
    await expect(page.locator('.admin-filter-result')).toContainText(
      `${count} productos`,
    )
    await page
      .locator('#admin-product-search')
      .fill(imported.at(-1)!.product.sku!)
    await page
      .getByRole('button', { name: 'Aplicar filtros', exact: true })
      .click()
    const rows = page.locator('.admin-table--products tbody tr')
    await expect(rows).toHaveCount(1)
    await expect(rows).toContainText(imported.at(-1)!.product.name)
    await rows
      .getByRole('link', {
        name: `Gestionar fotos de ${imported.at(-1)!.product.name}`,
        exact: true,
      })
      .click()
    await expect(
      page.getByRole('heading', {
        name: `Fotografías de ${imported.at(-1)!.product.name}`,
        level: 1,
      }),
    ).toBeVisible()
    await expect(page.locator('.admin-product-upload-item')).toHaveCount(4)
    await expect(page.locator('.admin-product-upload-item > img')).toHaveCount(
      0,
    )
    await page.reload()
    const reloaded = await persistedAdminState(page)
    expect(reloaded.products.map(({ product }) => product.sku)).toEqual(
      productCodes,
    )
    expect(reloaded.products).toHaveLength(stored.products.length)
  })
}

test('cinco fotos se revisan sin publicar, se guardan separadas y Guardar y continuar abre el siguiente pendiente', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const { imported } = await importPendingProducts(page, 2)
  const [first, second] = imported
  await page.goto('/admin/productos?visibilidad=pending-images')
  await page
    .getByRole('link', {
      name: `Gestionar fotos de ${first.product.name}`,
      exact: true,
    })
    .click()
  await page
    .getByLabel('Subir varias fotos del producto', { exact: true })
    .setInputFiles(photos)
  await expect(page.locator('.admin-product-upload-item > img')).toHaveCount(4)
  const originalGallery = await gallerySources(page)
  const familySlot = page.locator('.admin-product-olfactory-slot > img')
  await expect(familySlot).toBeVisible()
  const originalFamily = await familySlot.getAttribute('src')
  // File selection order can differ: the administrator can repair all roles.
  await page
    .getByLabel('Ubicación de foto 5', { exact: true })
    .selectOption('1')
  await expect(
    page.locator('.admin-product-upload-item > img').nth(1),
  ).toHaveAttribute('src', originalFamily!)
  await expect(familySlot).toHaveAttribute('src', originalGallery[1])
  await page
    .getByRole('button', { name: 'Mover foto 2 antes', exact: true })
    .click()
  await expect(
    page.locator('.admin-product-upload-item > img').first(),
  ).toHaveAttribute('src', originalFamily!)
  await page
    .getByLabel('Reemplazar vista 4 del producto', { exact: true })
    .setInputFiles('public/images/iris-960.webp')
  await expect(
    page.locator('.admin-product-upload-item > img').nth(3),
  ).not.toHaveAttribute('src', originalGallery[3])
  const gallery = await gallerySources(page)
  expect(new Set(gallery).size).toBe(4)
  const beforeSave = (await persistedAdminState(page)).products.find(
    ({ product }) => product.id === first.product.id,
  )!
  expect(beforeSave.product.image).toBe('')
  expect(beforeSave.detail.gallery).toEqual([])
  expect(beforeSave.detail.olfactoryImage).toBeNull()
  await page
    .getByRole('button', { name: 'Guardar y continuar', exact: true })
    .click()
  await expect(
    page.getByRole('heading', {
      name: `Fotografías de ${second.product.name}`,
      level: 1,
    }),
  ).toBeVisible()
  const afterSave = (await persistedAdminState(page)).products.find(
    ({ product }) => product.id === first.product.id,
  )!
  expect(afterSave.product.image).toBe(gallery[0])
  expect(afterSave.detail.gallery.map(({ image }) => image)).toEqual(gallery)
  expect(afterSave.detail.olfactoryImage).toMatch(/^data:image\/webp;base64,/)
  expect(gallery).not.toContain(afterSave.detail.olfactoryImage)
  expect(afterSave.product.variants).toEqual(first.product.variants)
  expect(afterSave.product.discount).toEqual(first.product.discount)
  expect(afterSave.active).toBe(false)
  await page.goto(`/admin/productos/${first.product.id}`)
  await page.getByLabel('Producto activo en tienda').check()
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect(page).toHaveURL(/guardado=1/)
  await page.goto(`/producto/${first.product.slug}`)
  await expect(page.locator('.product-gallery-frame')).toHaveCount(4)
  expect(
    await page
      .locator('.product-gallery-frame img')
      .evaluateAll((imgs) => imgs.map((img) => img.getAttribute('src'))),
  ).toEqual(gallery)
  await page
    .getByRole('button', { name: 'Familia olfativa', exact: true })
    .click()
  await expect(page.locator('.olfactory-profile-visual img')).toHaveAttribute(
    'src',
    afterSave.detail.olfactoryImage!,
  )
  await page.goto(`/tienda?q=${encodeURIComponent(first.product.name)}`)
  const card = page
    .locator('.catalog-listing .product-card')
    .filter({ hasText: first.product.name })
  await expect(
    card.locator('.product-image-link > img').first(),
  ).toHaveAttribute('src', gallery[0])
})

test('archivos inválidos no reemplazan fotos ni modifican el producto guardado', async ({
  page,
}) => {
  await page.goto('/admin/productos/cedre/fotos')
  await expect(
    page.getByRole('heading', { name: 'Fotografías de Bois Clair' }),
  ).toBeVisible()
  const original = (await persistedAdminState(page)).products.find(
    ({ product }) => product.id === 'cedre',
  )!
  const before = await gallerySources(page)
  const invalidFiles = [
    {
      file: {
        name: 'no-es-imagen.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('No es una fotografía'),
      },
      error: /JPG|PNG|WebP|AVIF/,
    },
    {
      file: {
        name: 'demasiado-grande.webp',
        mimeType: 'image/webp',
        buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
      },
      error: /20 MB/,
    },
    {
      file: {
        name: 'danada.webp',
        mimeType: 'image/webp',
        buffer: Buffer.from('archivo dañado'),
      },
      error: /abrir la imagen|otro archivo/,
    },
    {
      file: {
        name: 'pequena.webp',
        mimeType: 'image/webp',
        buffer: await sharp({
          create: { width: 64, height: 80, channels: 3, background: '#ddd' },
        })
          .webp()
          .toBuffer(),
      },
      error: /800|1000|resolución/,
    },
  ]
  for (const { file, error } of invalidFiles) {
    await page
      .getByLabel('Reemplazar foto principal del producto', { exact: true })
      .setInputFiles(file)
    await expect(page.locator('.admin-notice-dialog')).toContainText(error)
    await page.keyboard.press('Escape')
    expect(await gallerySources(page)).toEqual(before)
    expect(
      (await persistedAdminState(page)).products.find(
        ({ product }) => product.id === 'cedre',
      ),
    ).toEqual(original)
  }
})

test('una galería parcial conserva su contador y progreso al volver desde Productos', async ({
  page,
}) => {
  const { imported } = await importPendingProducts(page, 2)
  const record = imported[0]
  await page.goto(`/admin/productos/${record.product.id}/fotos`)
  await page
    .getByLabel('Subir varias fotos del producto', { exact: true })
    .setInputFiles(photos.slice(0, 1))
  await expect(page.locator('.admin-product-upload-item > img')).toHaveCount(1)
  await page.getByRole('button', { name: 'Guardar fotos', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/productos(?:\?|$)/)
  await page.goto(
    `/admin/productos?q=${encodeURIComponent(record.product.name)}`,
  )
  const row = page.locator('.admin-table--products tbody tr')
  await expect(row).toHaveCount(1)
  await expect(row).toContainText(/1\s*\/\s*5|1 de 5/)
  await row
    .getByRole('link', {
      name: `Gestionar fotos de ${record.product.name}`,
      exact: true,
    })
    .click()
  await expect(page.locator('.admin-product-upload-item > img')).toHaveCount(1)
  await expect(page.locator('.admin-product-olfactory-slot > img')).toHaveCount(
    0,
  )
  await page.reload()
  await expect(page.locator('.admin-product-upload-item > img')).toHaveCount(1)
  expect(
    (await persistedAdminState(page)).products.find(
      ({ product }) => product.id === record.product.id,
    )!.product.variants,
  ).toEqual(record.product.variants)
})

test('un complemento solo tiene cuatro fotografías y no exige imagen olfativa', async ({
  page,
}) => {
  await openImport(page)
  const preview = await reviewFile(
    page,
    await importFile([
      importRecord({
        slug: 'atomizador-cola-fotos',
        nombre: 'Atomizador Cola Fotos',
        tipo_producto: 'complemento',
        marca: '',
        genero: '',
        familia: '',
        familia_olfativa: '',
        notas_salida: '',
        notas_corazon: '',
        notas_fondo: '',
        intensidad: '',
        ocasion: '',
        temporada: '',
        tamano_ml: '',
        presentacion: 'Unidad',
        sku: 'ATOMIZADOR-COLA',
      }),
    ]),
  )
  await preview
    .getByRole('button', {
      name: 'Confirmar e importar 1 producto',
      exact: true,
    })
    .click()
  await expectImportSuccess(page, '1 producto importado')
  const record = (await persistedAdminState(page)).products.find(
    ({ product }) => product.slug === 'atomizador-cola-fotos',
  )!
  await page.goto(`/admin/productos/${record.product.id}/fotos`)
  await expect(page.locator('.admin-product-upload-item')).toHaveCount(4)
  await expect(page.locator('.admin-product-olfactory-slot')).toHaveCount(0)
  await page
    .getByLabel('Subir varias fotos del producto', { exact: true })
    .setInputFiles(photos.slice(0, 4))
  await expect(page.locator('.admin-product-upload-item > img')).toHaveCount(4)
  await page.getByRole('button', { name: 'Guardar fotos', exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/productos(?:\?|$)/)
  const saved = (await persistedAdminState(page)).products.find(
    ({ product }) => product.id === record.product.id,
  )!
  expect(saved.detail.gallery).toHaveLength(4)
  expect(saved.detail.olfactoryImage).toBeNull()
  expect(saved.product.variants).toEqual(record.product.variants)
  await page.goto(
    `/admin/productos?q=${encodeURIComponent(record.product.name)}`,
  )
  await expect(page.locator('.admin-table--products tbody tr')).toHaveCount(1)
  await expect(page.locator('.admin-table--products tbody tr')).toContainText(
    '4/4 fotos',
  )
})

test('arrastrar cinco archivos y reordenar una foto conserva roles y protege cambios sin guardar', async ({
  page,
}) => {
  const { imported } = await importPendingProducts(page, 2)
  const record = imported[0]
  await page.goto(`/admin/productos/${record.product.id}/fotos`)
  await page.locator('.admin-product-photos').evaluate(
    async (zone, paths) => {
      const transfer = new DataTransfer()
      for (const path of paths) {
        const response = await fetch(path)
        transfer.items.add(
          new File([await response.blob()], path.split('/').at(-1)!, {
            type: 'image/webp',
          }),
        )
      }
      zone.dispatchEvent(
        new DragEvent('drop', {
          bubbles: true,
          cancelable: true,
          dataTransfer: transfer,
        }),
      )
    },
    photos.map((path) => path.replace('public', '')),
  )
  await expect(page.locator('.admin-product-upload-item > img')).toHaveCount(4)
  await expect(page.locator('.admin-product-olfactory-slot > img')).toHaveCount(
    1,
  )
  const before = await gallerySources(page)
  await page.locator('.admin-product-upload-grid').evaluate((grid) => {
    const transfer = new DataTransfer()
    grid
      .querySelectorAll('img')[3]
      .dispatchEvent(
        new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }),
      )
    grid.querySelectorAll('.admin-product-upload-item')[0].dispatchEvent(
      new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      }),
    )
  })
  expect(await gallerySources(page)).toEqual([before[3], ...before.slice(0, 3)])
  await page.getByRole('link', { name: 'Marcas', exact: true }).click()
  await expect(page.locator('.admin-notice-dialog')).toContainText(
    '¿Salir sin guardar?',
  )
  await page
    .locator('.admin-notice-dialog')
    .getByRole('button', { name: 'Seguir editando', exact: true })
    .click()
  await expect(page).toHaveURL(`/admin/productos/${record.product.id}/fotos`)
  expect(await gallerySources(page)).toEqual([before[3], ...before.slice(0, 3)])
  expect(
    (await persistedAdminState(page)).products.find(
      ({ product }) => product.id === record.product.id,
    )!.detail.gallery,
  ).toEqual([])
})

test('gestión rápida de fotografías conserva cinco espacios y acciones alcanzables en cuatro pantallas', async ({
  page,
}) => {
  await mkdir('artifacts/product-photo-queue', { recursive: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/admin/productos/cedre/fotos')
  await expect(
    page.getByRole('heading', { name: 'Fotografías de Bois Clair' }),
  ).toBeVisible()
  for (const viewport of importViewports) {
    await page.setViewportSize(viewport)
    await expect(page.locator('.admin-product-upload-item')).toHaveCount(4)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    await page
      .getByRole('button', { name: 'Guardar fotos', exact: true })
      .scrollIntoViewIfNeeded()
    const actions = page.getByRole('button', {
      name: /^Guardar fotos$|^Guardar y continuar$/,
    })
    expect(
      await actions.evaluateAll((buttons) =>
        buttons.every((button) => {
          const bounds = button.getBoundingClientRect()
          return (
            bounds.left >= 0 &&
            bounds.right <= innerWidth + 1 &&
            bounds.height >= 40
          )
        }),
      ),
    ).toBe(true)
    await page.screenshot({
      path: `artifacts/product-photo-queue/editor-${viewport.name}.png`,
      fullPage: true,
      animations: 'disabled',
    })
  }
})
