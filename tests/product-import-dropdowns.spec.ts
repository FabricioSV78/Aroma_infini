import { expectImportSuccess } from './admin-notice-fixtures'
import { mkdir } from 'node:fs/promises'
import ExcelJS from 'exceljs'
import { expect, test, type Page } from '@playwright/test'
import { OLFACTORY_FAMILIES } from '../src/domain/olfactory-family'
import {
  importFile,
  importRecord,
  openImport,
  persistedAdminState,
  reviewFile,
} from './product-import-fixtures'

async function downloadTemplate(page: Page, saveOfficial = false) {
  const pendingDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar plantilla .xlsx' }).click()
  const download = await pendingDownload
  if (saveOfficial) {
    await mkdir('artifacts/importacion-excel', { recursive: true })
    await download.saveAs(
      'artifacts/importacion-excel/aroma-infini-plantilla-productos.xlsx',
    )
  }
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(await download.path())
  return workbook
}

function productColumn(workbook: ExcelJS.Workbook, key: string) {
  const sheet = workbook.getWorksheet('Productos')!
  const headers = sheet.getRow(1).values as string[]
  const column = headers.indexOf(key)
  expect(column, `Existe la columna ${key}`).toBeGreaterThan(0)
  return column
}

function dropdownChoices(workbook: ExcelJS.Workbook, key: string) {
  const sheet = workbook.getWorksheet('Productos')!
  const validation = sheet.getCell(
    2,
    productColumn(workbook, key),
  ).dataValidation
  const name = String(validation.formulae[0]).replace(/^=/, '')
  const references = workbook.definedNames.getRanges(name).ranges
  expect(references).toHaveLength(1)
  const match = references[0].match(
    /^'?Opciones'?!\$([A-Z]+)\$(\d+)(?::\$([A-Z]+)\$(\d+))?$/,
  )
  expect(match, `Rango válido para ${key}`).not.toBeNull()
  const [, firstColumn, firstRow, lastColumn, lastRow] = match!
  expect(firstColumn).toBe(lastColumn ?? firstColumn)
  const options = workbook.getWorksheet('Opciones')!
  return Array.from(
    { length: Number(lastRow ?? firstRow) - Number(firstRow) + 1 },
    (_, index) =>
      String(
        options.getCell(`${firstColumn}${Number(firstRow) + index}`).value,
      ),
  )
}

test('los desplegables de la plantilla sobreviven al archivo XLSX hasta la última fila sin añadir productos vacíos', async ({
  page,
}) => {
  await openImport(page)
  const workbook = await downloadTemplate(page, true)
  const sheet = workbook.getWorksheet('Productos')!
  expect(sheet.rowCount).toBe(1)
  expect(workbook.getWorksheet('Opciones')!.state).toBe('veryHidden')
  const columns = [
    'genero',
    'intensidad',
    'descuento_tipo',
    'descuento_activo',
    'marca',
    'familia_olfativa',
  ]
  for (const key of columns) {
    const column = productColumn(workbook, key)
    const first = sheet.getCell(2, column).dataValidation
    const last = sheet.getCell(1001, column).dataValidation
    expect(first.type, key).toBe('list')
    expect(first.allowBlank, key).toBe(true)
    expect(last, key).toEqual(first)
    expect(sheet.getCell(1002, column).dataValidation, key).toBeUndefined()
    expect(dropdownChoices(workbook, key).length, key).toBeGreaterThan(0)
  }
  const headers = sheet.getRow(1).values as string[]
  expect(headers.filter(Boolean)).toHaveLength(24)
  expect(headers).not.toContain('tipo_producto')
  expect(headers).not.toContain('presentacion')
  expect(
    JSON.stringify(workbook.getWorksheet('Opciones')!.getSheetValues()),
  ).not.toContain('complemento')
  expect(
    workbook.definedNames.getRanges('opciones_tipo_producto').ranges,
  ).toHaveLength(0)
  expect(dropdownChoices(workbook, 'genero')).toEqual([
    'hombre',
    'mujer',
    'unisex',
  ])
  expect(dropdownChoices(workbook, 'intensidad')).toEqual([
    'Suave',
    'Moderada',
    'Intensa',
  ])
  expect(dropdownChoices(workbook, 'familia_olfativa')).toEqual(
    OLFACTORY_FAMILIES.map((family) => family.label),
  )
  const families = sheet.getCell(
    2,
    productColumn(workbook, 'familia_olfativa'),
  ).dataValidation
  expect(families.showInputMessage).toBe(true)
  expect(families.prompt).toMatch(/coma/i)
  expect(families.showErrorMessage).not.toBe(true)
  for (const key of ['ocasion', 'temporada', 'familia']) {
    expect(
      sheet.getCell(2, productColumn(workbook, key)).dataValidation,
    ).toBeUndefined()
  }
})

test('al habilitar Complementos la plantilla recupera tipos, presentaciones y ejemplo sin concentración', async ({
  page,
}) => {
  await openImport(page)
  const saveResult = await page.evaluate(async () => {
    const modulePath = '/src/services/admin-service.ts'
    const admin = await import(modulePath)
    const result = admin.adminService.saveStoreFeatures({
      complementsEnabled: true,
    })
    await admin.adminService.flush()
    return result.kind
  })
  expect(saveResult).toBe('saved')
  const workbook = await downloadTemplate(page)
  const headers = workbook.getWorksheet('Productos')!.getRow(1)
    .values as string[]
  expect(headers).not.toContain('tipo')
  expect(headers).toContain('tipo_producto')
  expect(headers).toContain('presentacion')
  expect(headers.filter(Boolean)).toHaveLength(26)
  expect(workbook.getWorksheet('Ejemplo')!.rowCount).toBe(4)
  expect(workbook.definedNames.getRanges('opciones_tipo').ranges).toHaveLength(
    0,
  )
  expect(dropdownChoices(workbook, 'tipo_producto')).toEqual([
    'perfume',
    'complemento',
  ])
})

test('dejar slug y SKU vacíos agrupa las presentaciones y conserva las familias múltiples sin concentración', async ({
  page,
}) => {
  await openImport(page)
  const first = importRecord({
    slug: '',
    sku: '',
    nombre: 'Perfume Sin Códigos',
    familia_olfativa: 'Amaderada, Fresca',
  })
  const preview = await reviewFile(
    page,
    await importFile([
      first,
      { ...first, tamano_ml: 100, precio_soles: '219.90', stock: 3 },
    ]),
  )
  await expect(preview).toContainText('2 filas correctas')
  await expect(preview).toContainText('0 filas con errores')
  await preview
    .getByRole('button', {
      name: 'Confirmar e importar 1 producto',
      exact: true,
    })
    .click()
  await expectImportSuccess(page, '1 producto importado')
  const saved = (await persistedAdminState(page)).products.find(
    (record) => record.product.slug === 'perfume-sin-codigos',
  )!
  expect(saved).toBeDefined()
  expect(saved.product.variants).toHaveLength(2)
  expect(saved.product.variants.map((variant) => variant.sku)).toEqual([
    undefined,
    undefined,
  ])
  expect(saved.product.olfactoryFamilies).toEqual(['amaderado', 'fresco'])
  expect(saved.detail).not.toHaveProperty('type')
  expect(saved.active).toBe(false)
})
