import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import { expect, test, type Page } from './test'
import { expectImportSuccess } from './admin-notice-fixtures'
import {
  importRecord,
  openImport,
  persistedAdminState,
  reviewFile,
  type ImportRecord,
} from './product-import-fixtures'

const output = 'artifacts/admin-functional-audit-2026-11-10/excel'
const prefix = 'qa-aroma-20261110-'

function recordsFor(count: number, mixed: boolean): ImportRecord[] {
  const tag = mixed ? 'mixed' : 'valid'
  const records: ImportRecord[] = []
  for (let index = 0; index < count; index++) {
    for (const variant of [0, 1]) {
      const price = ((10000 + index * 100 + variant * 2200 + 99) / 100).toFixed(
        2,
      )
      records.push(
        importRecord({
          slug: `${prefix}${tag}-${count}-${index + 1}`,
          nombre: `QA-AROMA ${tag} ${count} Ñandú ${index + 1}`,
          descripcion:
            'Fragancia QA: bergamota, cedro y té blanco. Sólo prueba aislada.',
          resumen: 'QA-AROMA · edición de prueba',
          sku: `QA-AROMA-${tag}-${count}-${index + 1}-${variant ? 100 : 50}`,
          tamano_ml: variant ? 100 : 50,
          precio_soles: variant ? price.replace('.', ',') : price,
          stock: index % 7 === 0 ? 0 : index + variant + 1,
          ...(index % 3 === 0
            ? {
                descuento_tipo: 'percentage',
                descuento_valor: 10,
                descuento_activo: 'sí',
                descuento_inicio: '2020-01-01T00:00:00Z',
                descuento_fin: '2100-01-01T00:00:00Z',
              }
            : index % 3 === 1
              ? {
                  descuento_tipo: 'fixed',
                  descuento_valor: '5.25',
                  descuento_activo: 'no',
                }
              : {}),
        }),
      )
    }
  }
  if (mixed) {
    records[(count - 6) * 2 + 1].descripcion = ''
    records[(count - 5) * 2].precio_soles = '99.999'
    records[(count - 4) * 2].sku = 'QA-AROMA-DUPLICADO'
    records[(count - 3) * 2].sku = 'qa-aroma-duplicado'
    records[(count - 2) * 2].marca = 'QA-AROMA Marca inexistente'
    records[(count - 2) * 2 + 1].marca = 'QA-AROMA Marca inexistente'
    records[(count - 1) * 2].slug = 'bois-clair'
    records[(count - 1) * 2 + 1].slug = 'bois-clair'
  }
  return records
}

/** Exercise the exact workbook downloaded by the application, including lists. */
async function officialFile(page: Page, records: ImportRecord[], name: string) {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar plantilla .xlsx' }).click()
  const download = await pending
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile((await download.path())!)
  const sheet = workbook.getWorksheet('Productos')!
  const columns = (sheet.getRow(1).values as string[]).slice(1)
  expect(columns).toContain('sku')
  expect(columns).toContain('familia_olfativa')
  for (const unsupported of [
    'imagen',
    'galeria',
    'familia_olfativa_imagen',
    'url',
    'destacado',
    'tipo',
  ])
    expect(columns).not.toContain(unsupported)
  for (const record of records)
    sheet.addRow(columns.map((key) => record[key] ?? ''))
  expect(workbook.model.media ?? []).toHaveLength(0)
  expect(
    records.every((record) =>
      Object.values(record).every(
        (value) => !/^https?:\/\//i.test(String(value)),
      ),
    ),
  ).toBe(true)
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
  await mkdir(output, { recursive: true })
  await writeFile(`${output}/${name}`, buffer)
  return {
    name,
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer,
  }
}

for (const count of [10, 50, 100, 500]) {
  for (const mixed of [false, true]) {
    test(`QA-AROMA Excel oficial ${count} productos ${mixed ? 'con errores parciales' : 'válidos'} conserva datos y no duplica`, async ({
      page,
    }, info) => {
      test.setTimeout(120_000)
      await openImport(page)
      const initial = await persistedAdminState(page)
      const records = recordsFor(count, mixed)
      const tag = mixed ? 'mixed' : 'valid'
      const file = await officialFile(
        page,
        records,
        `QA-AROMA-${count}-${tag}.xlsx`,
      )
      const started = performance.now()
      const preview = await reviewFile(page, file)
      const valid = mixed ? count - 6 : count
      await expect(preview).toContainText(`${valid * 2} filas correctas`)
      await expect(preview).toContainText(`${mixed ? 12 : 0} filas con errores`)
      const previewMs = Math.round(performance.now() - started)
      if (count * 2 > 25) {
        const pagination = preview.getByRole('navigation', {
          name: 'Páginas de la vista previa',
        })
        await pagination
          .getByRole('button', { name: 'Siguiente', exact: true })
          .click()
        await expect(pagination).toContainText('Página 2')
        await expect(
          preview.locator('.admin-product-import__rows > li').first(),
        ).toContainText('Fila 27')
        await pagination
          .getByRole('button', { name: 'Anterior', exact: true })
          .click()
      }
      if (mixed) {
        await preview
          .getByRole('button', { name: 'Con errores (12)', exact: true })
          .click()
        await expect(
          preview.locator('.admin-product-import__rows > li'),
        ).toHaveCount(12)
        const messages = await preview
          .locator('.admin-product-import__rows')
          .innerText()
        for (const expected of [
          'Falta descripcion',
          'Precio:',
          'SKU',
          'La marca no existe',
          'slug ya existe',
        ])
          expect(messages).toContain(expected)
        await preview
          .getByRole('button', {
            name: `Correctas (${valid * 2})`,
            exact: true,
          })
          .click()
      }
      const saving = performance.now()
      await preview
        .getByRole('button', {
          name: `Confirmar e importar ${valid} productos`,
          exact: true,
        })
        .click()
      await expectImportSuccess(page, `${valid} productos importados`)
      const importMs = Math.round(performance.now() - saving)
      const saved = await persistedAdminState(page)
      const imported = saved.products.filter(({ product }) =>
        product.slug.startsWith(`${prefix}${tag}-${count}-`),
      )
      expect(imported).toHaveLength(valid)
      expect(
        saved.products.filter(
          ({ product }) => !product.slug.startsWith(prefix),
        ),
      ).toEqual(initial.products)
      expect(new Set(imported.map(({ product }) => product.id)).size).toBe(
        valid,
      )
      expect(
        new Set(
          imported.flatMap(({ product }) =>
            product.variants.map(({ id }) => id),
          ),
        ).size,
      ).toBe(valid * 2)
      for (const record of imported) {
        const index = Number(record.product.slug.split('-').at(-1)) - 1
        expect(record.active).toBe(false)
        expect(record.product.image).toBe('')
        expect(record.detail.gallery).toHaveLength(0)
        expect(record.detail.olfactoryImage).toBeNull()
        expect(record.product.olfactoryFamilies).toEqual([
          'amaderado',
          'fresco',
        ])
        for (const [
          variantIndex,
          variant,
        ] of record.product.variants.entries()) {
          expect(variant.priceCents).toBe(
            10000 + index * 100 + variantIndex * 2200 + 99,
          )
          expect(variant.stock).toBe(
            index % 7 === 0 ? 0 : index + variantIndex + 1,
          )
          expect(variant.sku).toBe(
            String(records[index * 2 + variantIndex].sku).toUpperCase(),
          )
        }
      }
      await page.reload()
      await page
        .getByText('Importar productos con Excel', { exact: true })
        .click()
      const retry = await reviewFile(page, file)
      await expect(
        retry.getByRole('button', {
          name: 'Confirmar e importar 0 productos',
          exact: true,
        }),
      ).toBeDisabled()
      expect((await persistedAdminState(page)).products).toEqual(saved.products)
      await retry.getByRole('button', { name: 'Cerrar', exact: true }).click()
      await page.goto('/tienda?q=QA-AROMA')
      await expect(page.locator('.product-card')).toHaveCount(0)
      const report = {
        status: 'passed',
        environment:
          'isolated Chrome and real IndexedDB; no hosted persistence',
        candidateProducts: count,
        spreadsheetRows: records.length,
        importedProducts: valid,
        importedVariants: valid * 2,
        rejectedProducts: mixed ? 6 : 0,
        invalidRows: mixed ? 12 : 0,
        previewMs,
        importMs,
        xlsxBytes: file.buffer.length,
        xlsxSha256: createHash('sha256').update(file.buffer).digest('hex'),
        reimportAddedProducts: 0,
        originalRecordsUnchanged: true,
        imageOrUrlCells: 0,
      }
      await writeFile(
        `${output}/result-${count}-${tag}.json`,
        JSON.stringify(report, null, 2),
      )
      await info.attach(`QA-AROMA-${count}-${tag}`, {
        body: JSON.stringify(report),
        contentType: 'application/json',
      })
    })
  }
}

test('QA-AROMA Excel vacío, corrupto e incompatible comunica errores sin cambiar registros', async ({
  page,
}) => {
  await openImport(page)
  const before = await persistedAdminState(page)
  const cases = [
    { name: 'QA-AROMA-corrupto.xlsx', buffer: Buffer.from('not an XLSX file') },
    {
      name: 'QA-AROMA-incompatible.csv',
      buffer: Buffer.from('nombre,stock\nQA-AROMA,1'),
    },
  ]
  for (const file of cases) {
    await page
      .getByLabel('Archivo Excel .xlsx (máx. 5 MB)')
      .setInputFiles({ ...file, mimeType: 'application/octet-stream' })
    await expect(page.locator('.admin-notice-dialog')).toContainText(
      'No se pudo leer el Excel',
    )
    await page
      .locator('.admin-notice-dialog')
      .getByRole('button', { name: 'Entendido', exact: true })
      .click()
  }
  const empty = await officialFile(page, [], 'QA-AROMA-vacio.xlsx')
  await page.getByLabel('Archivo Excel .xlsx (máx. 5 MB)').setInputFiles(empty)
  await expect(page.locator('.admin-notice-dialog')).toContainText(
    'La hoja no contiene productos',
  )
  expect((await persistedAdminState(page)).products).toEqual(before.products)
})

test('QA-AROMA vista previa de 500 productos mantiene acciones y paginación en cuatro pantallas', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await openImport(page)
  const file = await officialFile(
    page,
    recordsFor(500, false),
    'QA-AROMA-500-responsive.xlsx',
  )
  const preview = await reviewFile(page, file)
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [768, 1024],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height })
    const pagination = preview.getByRole('navigation', {
      name: 'Páginas de la vista previa',
    })
    await expect(preview).toContainText('1000 filas correctas')
    await expect(
      preview.locator('.admin-product-import__rows > li'),
    ).toHaveCount(25)
    await expect(pagination).toContainText('Página 1 de 40')
    await expect(
      preview.getByRole('button', {
        name: 'Confirmar e importar 500 productos',
        exact: true,
      }),
    ).toBeEnabled()
    expect(
      await preview.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    ).toBe(true)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    await preview.screenshot({
      path: `${output}/preview-500-${width}.png`,
      animations: 'disabled',
    })
    await pagination
      .getByRole('button', { name: 'Siguiente', exact: true })
      .click()
    await expect(pagination).toContainText('Página 2 de 40')
    await expect(
      preview.locator('.admin-product-import__rows > li').first(),
    ).toContainText('Fila 27')
    await pagination
      .getByRole('button', { name: 'Anterior', exact: true })
      .click()
    await expect(pagination).toContainText('Página 1 de 40')
  }
  await page.keyboard.press('Escape')
  await expect(preview).not.toBeVisible()
})

test('QA-AROMA filas vacías se ignoran y los formatos inesperados no se convierten silenciosamente', async ({
  page,
}) => {
  await openImport(page)
  const rows = Array.from({ length: 4 }, (_, index) =>
    importRecord({
      slug: `${prefix}format-${index + 1}`,
      nombre: `QA-AROMA Formato ${index + 1}`,
      sku: index === 0 ? '0000123' : `QA-AROMA-FORMAT-${index + 1}`,
    }),
  )
  const file = await officialFile(page, rows, 'QA-AROMA-formatos.xlsx')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(`${output}/${file.name}`)
  const sheet = workbook.getWorksheet('Productos')!
  const headers = (sheet.getRow(1).values as string[]).slice(1)
  sheet.getRow(3).getCell(headers.indexOf('stock') + 1).value = {
    richText: [{ text: '8' }],
  }
  sheet.getRow(4).getCell(headers.indexOf('precio_soles') + 1).value = {
    formula: '100+20',
    result: 120,
  }
  sheet.getRow(5).getCell(headers.indexOf('genero') + 1).value =
    'categoria-inexistente'
  sheet.spliceRows(3, 0, [])
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
  await writeFile(`${output}/${file.name}`, buffer)
  const preview = await reviewFile(page, { ...file, buffer })
  await expect(preview).toContainText('1 fila correcta')
  await expect(preview).toContainText('3 filas con errores')
  await expect(preview).toContainText('usa texto o número, sin fórmulas')
  await expect(preview).toContainText('Género: usa hombre, mujer o unisex.')
  await expect(preview.locator('.admin-product-import__rows > li')).toHaveCount(
    4,
  )
  await preview
    .getByRole('button', {
      name: 'Confirmar e importar 1 producto',
      exact: true,
    })
    .click()
  await expectImportSuccess(page, '1 producto importado')
  const saved = (await persistedAdminState(page)).products.filter(
    ({ product }) => product.slug.startsWith(`${prefix}format-`),
  )
  expect(saved).toHaveLength(1)
  expect(saved[0].product.variants[0].sku).toBe('0000123')
})
