import { expectImportSuccess } from './admin-notice-fixtures'
import { mkdir } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import { expect, test } from '@playwright/test'
import {
  importFile,
  importHeaders,
  importRecord,
  importViewports,
  openImport,
  persistedAdminState,
  reviewFile,
  type ImportRecord,
} from './product-import-fixtures'

test('la plantilla definitiva contiene datos de perfumes y oculta los complementos desactivados y las columnas multimedia', async ({
  page,
}) => {
  await openImport(page)
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar plantilla .xlsx' }).click()
  const download = await downloaded
  expect(download.suggestedFilename()).toBe(
    'aroma-infini-plantilla-productos.xlsx',
  )
  await mkdir('artifacts/importacion-excel', { recursive: true })
  await download.saveAs(
    'artifacts/importacion-excel/aroma-infini-plantilla-productos.xlsx',
  )
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(await download.path())
  const products = workbook.getWorksheet('Productos')!
  const columns = products.getRow(1).values as string[]
  expect(columns.filter(Boolean).sort()).toEqual(
    importHeaders
      .filter((column) => !['tipo_producto', 'presentacion'].includes(column))
      .sort(),
  )
  expect(columns.filter(Boolean)).toHaveLength(24)
  expect(products.rowCount).toBe(1)
  for (const retired of [
    'imagen',
    'activo',
    'destacado',
    'tipo',
    'galeria',
    'familia_olfativa_imagen',
  ]) {
    expect(columns).not.toContain(retired)
  }
  const example = workbook.getWorksheet('Ejemplo')!
  expect(columns).not.toContain('tipo_producto')
  expect(columns).not.toContain('presentacion')
  expect(example.rowCount).toBe(3)
  expect(
    JSON.stringify(workbook.getWorksheet('Opciones')!.getSheetValues()),
  ).not.toContain('complemento')
  expect(
    workbook.definedNames.getRanges('opciones_tipo_producto').ranges,
  ).toHaveLength(0)
  const exampleRows: Record<string, string | number>[] = []
  example.eachRow((row, index) => {
    if (index > 1)
      exampleRows.push(
        Object.fromEntries(
          columns
            .slice(1)
            .map((key, offset) => [
              key,
              String(row.getCell(offset + 1).value ?? ''),
            ]),
        ),
      )
  })
  const preview = await reviewFile(
    page,
    await importFile(exampleRows, columns.slice(1), 'ejemplos.xlsx'),
  )
  await expect(
    preview.getByRole('button', { name: /Confirmar e importar [1-9]/ }),
  ).toBeEnabled()
  await expect(preview).toContainText('0 filas con errores')
  expect(workbook.getWorksheet('Guía')?.getRow(1).getCell(1).value).toContain(
    'Completa solo la hoja Productos',
  )
})

test('ignora imágenes, publicación y concentración de archivos anteriores y conserva familias, precios y stock en borradores', async ({
  page,
}) => {
  await openImport(page)
  const preview = await reviewFile(
    page,
    await importFile(
      [
        importRecord({
          imagen: 'https://example.test/no-cargar.webp',
          activo: 'sí',
          tipo: 'Eau de Parfum',
        }),
        importRecord({
          tamano_ml: 100,
          precio_soles: '199,00',
          stock: 3,
          sku: 'PRUEBA-100',
          imagen: 'cedre',
          activo: 'sí',
          tipo: 'Extrait de Parfum',
        }),
      ],
      [...importHeaders, 'imagen', 'activo', 'tipo'],
    ),
  )
  await expect(preview).toContainText('1 producto')
  await expect(preview).toContainText('2 filas correctas')
  await preview
    .getByRole('button', { name: 'Confirmar e importar 1 producto' })
    .click()
  await expectImportSuccess(page, '1 producto importado')
  const state = await persistedAdminState(page)
  const imported = state.products.find(
    (record) => record.product.slug === 'prueba-importacion',
  )!
  expect(imported.active).toBe(false)
  expect(imported.product.image).toBe('')
  expect(imported.detail.gallery).toEqual([])
  expect(imported.detail.olfactoryImage).toBeNull()
  expect(imported.detail).not.toHaveProperty('type')
  expect(
    imported.product.variants.map(({ ml, priceCents, stock }) => ({
      ml,
      priceCents,
      stock,
    })),
  ).toEqual([
    { ml: 50, priceCents: 15990, stock: 8 },
    { ml: 100, priceCents: 19900, stock: 3 },
  ])
  expect(imported.product.olfactoryFamilies).toEqual(['amaderado', 'fresco'])
  await page.goto('/tienda?q=Prueba%20Importaci%C3%B3n')
  await expect(
    page.locator('.product-card', { hasText: 'Prueba Importación' }),
  ).toHaveCount(0)
  await page.goto('/tienda?familia=fresco')
  await expect(
    page.locator('.product-card', { hasText: 'Prueba Importación' }),
  ).toHaveCount(0)
  await page.goto('/producto/prueba-importacion')
  await expect(
    page.getByRole('heading', { name: 'Prueba Importación', level: 1 }),
  ).toHaveCount(0)
})

test('rechaza fórmulas, cabeceras incompletas y archivos de ejemplo sin importar ningún producto parcial', async ({
  page,
}) => {
  await openImport(page)
  const invalidCases: { overrides: ImportRecord; message: string }[] = [
    {
      overrides: { precio_soles: '159.999' },
      message: 'Precio: indica soles positivos con máximo dos decimales.',
    },
    {
      overrides: { familia_olfativa: 'Marina' },
      message: 'Familia olfativa: usa una opción de la hoja Guía.',
    },
    {
      overrides: { familia_olfativa: 'Floral' },
      message: 'La familia olfativa no coincide con el perfil aromático breve.',
    },
    {
      overrides: { descuento_tipo: 'fixed', descuento_valor: 160 },
      message: 'sin dejar en cero',
    },
  ]
  for (const item of invalidCases) {
    const preview = await reviewFile(
      page,
      await importFile([importRecord(item.overrides)]),
    )
    await expect(preview).toContainText(item.message)
    await expect(
      preview.getByRole('button', { name: /Confirmar e importar/ }),
    ).toBeDisabled()
    await preview.getByRole('button', { name: 'Cerrar', exact: true }).click()
  }
  const formulaWorkbook = new ExcelJS.Workbook()
  const sheet = formulaWorkbook.addWorksheet('Productos')
  sheet.addRow([...importHeaders])
  sheet.addRow(importHeaders.map((key) => importRecord()[key] ?? ''))
  sheet.getRow(2).getCell(importHeaders.indexOf('precio_soles') + 1).value = {
    formula: '100+20',
    result: 120,
  }
  const preview = await reviewFile(page, {
    name: 'formula.xlsx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(await formulaWorkbook.xlsx.writeBuffer()),
  })
  await expect(preview).toContainText('usa texto o número, sin fórmulas')
  await expect(
    preview.getByRole('button', { name: /Confirmar e importar/ }),
  ).toBeDisabled()
  await preview.getByRole('button', { name: 'Cerrar', exact: true }).click()
  await page
    .getByLabel('Archivo Excel .xlsx (máx. 5 MB)')
    .setInputFiles(await importFile([], ['slug', 'nombre']))
  await expect(page.locator('.admin-notice-dialog')).toContainText(
    'Faltan columnas obligatorias',
  )
  await page
    .locator('.admin-notice-dialog')
    .getByRole('button', { name: 'Entendido' })
    .click()
  const exampleOnly = new ExcelJS.Workbook()
  exampleOnly.addWorksheet('Ejemplo').addRow([...importHeaders])
  await page.getByLabel('Archivo Excel .xlsx (máx. 5 MB)').setInputFiles({
    name: 'solo-ejemplo.xlsx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(await exampleOnly.xlsx.writeBuffer()),
  })
  await expect(page.locator('.admin-notice-dialog')).toContainText(
    'no contiene una hoja de productos',
  )
})

test('un fallo de persistencia permite reintentar el guardado sin añadir productos duplicados', async ({
  page,
}) => {
  await openImport(page)
  const file = await importFile([
    importRecord({
      slug: 'guardado-pendiente',
      nombre: 'Guardado Pendiente',
      sku: 'GUARDADO-50',
    }),
  ])
  const preview = await reviewFile(page, file)
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put
    let fail = true
    IDBObjectStore.prototype.put = function (
      ...args: Parameters<typeof original>
    ) {
      if (fail) {
        fail = false
        throw new DOMException(
          'Fallo de almacenamiento intencional en prueba local',
          'QuotaExceededError',
        )
      }
      return Reflect.apply(original, this, args)
    }
  })
  await preview
    .getByRole('button', {
      name: 'Confirmar e importar 1 producto',
      exact: true,
    })
    .click()
  await expect(preview).not.toBeVisible()
  await expect(page.locator('.admin-notice-dialog')).toContainText(
    'No se pudieron guardar los cambios',
  )
  await expect(
    page.getByLabel('Archivo Excel .xlsx (máx. 5 MB)'),
  ).toBeDisabled()
  await expect(
    page
      .locator('.admin-notice-dialog')
      .getByRole('button', { name: 'Reintentar guardado', exact: true }),
  ).toBeFocused()
  await page
    .locator('.admin-notice-dialog')
    .getByRole('button', { name: 'Revisar después' })
    .click()
  await page.getByRole('link', { name: 'Marcas', exact: true }).click()
  await page
    .locator('.admin-notice-dialog')
    .getByRole('button', { name: 'Seguir editando' })
    .click()
  await expect(page).toHaveURL('/admin/productos')
  await expect(
    page.getByRole('button', { name: 'Reintentar guardado', exact: true }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Reintentar guardado', exact: true })
    .click()
  await expectImportSuccess(page, '1 producto importado')
  await expect(page.getByLabel('Archivo Excel .xlsx (máx. 5 MB)')).toBeEnabled()
  const persisted = await persistedAdminState(page)
  expect(
    persisted.products.filter(
      (record) => record.product.slug === 'guardado-pendiente',
    ),
  ).toHaveLength(1)
  await page.reload()
  await page.getByText('Importar productos con Excel', { exact: true }).click()
  const retriedFile = await reviewFile(page, file)
  await expect(
    retriedFile.getByRole('button', {
      name: 'Confirmar e importar 0 productos',
      exact: true,
    }),
  ).toBeDisabled()
  expect((await persistedAdminState(page)).products).toEqual(persisted.products)
})

test('importar, subir y gestionar fotografías, previsualizar y publicar conserva variantes y filtros reales', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await openImport(page)
  const preview = await reviewFile(
    page,
    await importFile([
      importRecord({ slug: 'imagen-pendiente', nombre: 'Imagen Pendiente' }),
      importRecord({
        slug: 'imagen-pendiente',
        nombre: 'Imagen Pendiente',
        tamano_ml: 100,
        stock: 3,
        sku: 'PRUEBA-100',
        precio_soles: '199.00',
      }),
    ]),
  )
  await preview
    .getByRole('button', { name: 'Confirmar e importar 1 producto' })
    .click()
  await expectImportSuccess(page, '1 producto importado')
  await page
    .getByRole('link', { name: /pendientes|Subir fotos/i })
    .first()
    .click()
  await expect(page).toHaveURL(/visibilidad=pending-images/)
  const product = page.locator('.admin-table--products tbody tr', {
    hasText: 'Imagen Pendiente',
  })
  await expect(product).toContainText('Pendiente de fotos')
  await product
    .getByRole('link', { name: /Subir fotos|Editar/ })
    .first()
    .click()
  await expect(page.getByLabel('Stock de presentación 50 ml')).toHaveValue('8')
  await expect(page.getByLabel('Stock de presentación 100 ml')).toHaveValue('3')
  await page.getByLabel('Producto activo en tienda').check()
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(/imagen|foto/)
  await page.getByLabel('Producto activo en tienda').uncheck()
  await page
    .getByLabel('Subir foto principal del producto', { exact: true })
    .setInputFiles('public/images/petale-960.webp')
  const gallery = page.locator('.admin-product-upload-item')
  await expect(gallery.first().locator('img')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  const principal = await gallery.first().locator('img').getAttribute('src')
  await page
    .getByRole('button', { name: 'Añadir otra foto', exact: true })
    .click()
  await page
    .getByLabel('Subir vista 2 del producto', { exact: true })
    .setInputFiles('public/images/cedre-960.webp')
  await expect(gallery.nth(1).locator('img')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  const secondary = await gallery.nth(1).locator('img').getAttribute('src')
  expect(secondary).not.toBe(principal)
  await page
    .getByRole('button', { name: 'Mover foto 2 antes', exact: true })
    .click()
  await expect(gallery.first().locator('img')).toHaveAttribute(
    'src',
    secondary!,
  )
  await page
    .getByRole('button', { name: 'Mover foto 1 después', exact: true })
    .click()
  await expect(gallery.first().locator('img')).toHaveAttribute(
    'src',
    principal!,
  )
  await page
    .getByLabel('Reemplazar vista 2 del producto', { exact: true })
    .setInputFiles('public/images/ambre-960.webp')
  await expect(gallery.nth(1).locator('img')).not.toHaveAttribute(
    'src',
    secondary!,
  )
  await gallery
    .nth(1)
    .getByRole('button', { name: 'Quitar', exact: true })
    .click()
  await expect(gallery).toHaveCount(1)
  await page
    .getByRole('button', { name: 'Añadir otra foto', exact: true })
    .click()
  await page
    .getByLabel('Subir vista 2 del producto', { exact: true })
    .setInputFiles('public/images/cedre-960.webp')
  await expect(gallery.nth(1).locator('img')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  await page
    .getByLabel('Subir imagen del perfil olfativo', { exact: true })
    .setInputFiles('public/images/ambre-960.webp')
  await expect(
    page.getByRole('img', {
      name: 'Vista previa de la imagen del perfil olfativo',
    }),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await page.getByRole('button', { name: 'Quitar imagen', exact: true }).click()
  await expect(
    page.getByRole('img', {
      name: 'Vista previa de la imagen del perfil olfativo',
    }),
  ).toHaveCount(0)
  await page
    .getByLabel('Subir imagen del perfil olfativo', { exact: true })
    .setInputFiles('public/images/petale-960.webp')
  await expect(
    page.getByRole('img', {
      name: 'Vista previa de la imagen del perfil olfativo',
    }),
  ).toBeVisible()
  for (const viewport of importViewports) {
    await page.setViewportSize(viewport)
    await page
      .getByRole('button', { name: 'Vista previa', exact: true })
      .click()
    const productPreview = page.getByRole('dialog', {
      name: 'Vista previa del producto',
    })
    await expect(productPreview).toBeVisible()
    await expect(productPreview).toContainText('Imagen Pendiente')
    expect(
      await productPreview.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return (
          rect.left >= 0 &&
          rect.right <= innerWidth + 1 &&
          rect.top >= 0 &&
          rect.bottom <= innerHeight + 1
        )
      }),
    ).toBe(true)
    await page.screenshot({
      path: `artifacts/importacion-excel/producto-vista-previa-${viewport.name}.png`,
      animations: 'disabled',
    })
    await page.keyboard.press('Escape')
  }
  const unsaved = (await persistedAdminState(page)).products.find(
    (record) => record.product.slug === 'imagen-pendiente',
  )!
  expect(unsaved.active).toBe(false)
  expect(unsaved.product.image).toBe('')
  expect(unsaved.detail.gallery).toEqual([])
  await page.getByLabel('Producto activo en tienda').check()
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect(page).toHaveURL(/guardado=1/)
  await page.goto('/tienda?familia=fresco&q=Imagen%20Pendiente')
  await expect(
    page.locator('.product-card', { hasText: 'Imagen Pendiente' }),
  ).toHaveCount(1)
  await page.goto('/producto/imagen-pendiente')
  await expect(
    page.getByRole('heading', { name: 'Imagen Pendiente', level: 1 }),
  ).toBeVisible()
  await expect(
    page.locator('.product-gallery-frame.is-active img'),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await expect(page.locator('.product-kind')).toContainText(
    'Amaderado · Fresco',
  )
  const published = (await persistedAdminState(page)).products.find(
    (record) => record.product.slug === 'imagen-pendiente',
  )!
  expect(published.active).toBe(true)
  expect(published.detail.gallery).toHaveLength(2)
  expect(published.detail.olfactoryImage).toMatch(/^data:image\/webp;base64,/)
})
