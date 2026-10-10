import ExcelJS from 'exceljs'
import { expect, test } from '@playwright/test'

const headers = [
  'slug',
  'nombre',
  'marca',
  'genero',
  'familia',
  'descripcion',
  'imagen',
  'tamano_ml',
  'precio_soles',
  'stock',
  'activo',
  'resumen',
  'tipo',
  'notas_salida',
  'notas_corazon',
  'notas_fondo',
  'intensidad',
  'ocasion',
  'temporada',
  'destacado',
  'umbral_stock',
]

function productRow(overrides: Record<string, string | number> = {}) {
  const values: Record<string, string | number> = {
    slug: 'prueba-importacion',
    nombre: 'Prueba Importación',
    marca: 'Atelier 01',
    genero: 'unisex',
    familia: 'Amaderada',
    descripcion: 'Una fragancia de prueba para validar el catálogo.',
    imagen: 'cedre',
    tamano_ml: 50,
    precio_soles: '159.90',
    stock: 8,
    activo: 'sí',
    resumen: 'Amaderada y luminosa.',
    tipo: 'Eau de Parfum',
    notas_salida: 'Bergamota, Enebro',
    notas_corazon: 'Cedro',
    notas_fondo: 'Vetiver',
    intensidad: 'Moderada',
    ocasion: 'Diario',
    temporada: 'Todo el año',
    destacado: 'no',
    umbral_stock: 2,
    ...overrides,
  }
  return headers.map((header) => values[header] ?? '')
}

async function excelFile(rows: (string | number)[][]) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Productos')
  sheet.addRow(headers)
  rows.forEach((row) => sheet.addRow(row))
  return {
    name: 'productos.xlsx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: (await workbook.xlsx.writeBuffer()) as unknown as Uint8Array,
  }
}

test('la plantilla y la vista previa permiten confirmar solo productos válidos, con precio y stock correctos', async ({
  page,
}) => {
  await page.goto('/admin/productos')
  await page.getByText('Importar productos con Excel').click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar plantilla .xlsx' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe(
    'aroma-infini-plantilla-productos.xlsx',
  )
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(await download.path())
  expect(workbook.getWorksheet('Productos')?.getRow(1).getCell(1).value).toBe(
    'slug',
  )
  expect(workbook.getWorksheet('Productos')?.rowCount).toBe(1)
  const example = workbook.getWorksheet('Ejemplo')
  expect(example?.rowCount).toBe(3)
  expect(example?.getRow(2).getCell(1).value).toBe('bosque-de-ejemplo')
  expect(example?.getRow(3).getCell(1).value).toBe('bosque-de-ejemplo')
  expect(example?.getRow(2).getCell(8).value).toBe(50)
  expect(example?.getRow(3).getCell(8).value).toBe(100)
  expect(example?.getRow(2).getCell(7).value).toBe('')
  expect(example?.getRow(2).getCell(11).value).toBe('no')
  const guide = workbook.getWorksheet('Guía')
  expect(guide?.getRow(1).getCell(1).value).toContain(
    'Completa solo la hoja Productos',
  )
  expect(
    guide
      ?.getColumn(2)
      .values.some((value) => String(value).includes('URL HTTPS pública')),
  ).toBe(true)

  const file = await excelFile([
    productRow(),
    productRow({ tamano_ml: 100, precio_soles: '199.00', stock: 3 }),
    productRow({ slug: 'bois-clair', nombre: 'Producto duplicado' }),
  ])
  await page.getByLabel('Archivo Excel .xlsx (máx. 5 MB)').setInputFiles(file)
  const preview = page.getByLabel('Vista previa de importación')
  await expect(preview).toContainText(
    '1 producto · 2 filas correctas · 1 fila con errores',
  )
  await expect(preview).toContainText('El slug ya existe en el catálogo.')
  await preview.getByRole('button', { name: 'Con errores (1)' }).click()
  await expect(preview.locator('.admin-product-import__rows > li')).toHaveCount(
    1,
  )
  await expect(preview.locator('.admin-product-import__rows')).toContainText(
    'El slug ya existe en el catálogo.',
  )
  await preview.getByRole('button', { name: 'Correctas (2)' }).click()
  await expect(preview.locator('.admin-product-import__rows > li')).toHaveCount(
    2,
  )
  await preview.getByRole('button', { name: 'Todas (3)' }).click()
  await expect(page.locator('.admin-table--products')).not.toContainText(
    'Prueba Importación',
  )
  await page
    .getByRole('button', { name: 'Confirmar e importar 1 producto' })
    .click()
  await expect(page.getByRole('status')).toContainText('1 producto importado')
  await page.getByLabel('Buscar producto o marca').fill('Prueba Importación')
  await page.getByRole('button', { name: 'Aplicar filtros' }).click()
  await expect(page.locator('.admin-table--products')).toContainText(
    'Prueba Importación',
  )
  await expect(page.locator('.admin-table--products')).toContainText('50 ml')
  await expect(page.locator('.admin-table--products')).toContainText('100 ml')
  await expect(page.locator('.admin-table--products')).toContainText('159.9')
  await page.getByRole('link', { name: /Editar Prueba Importación/ }).click()
  await expect(page.getByLabel('Stock de presentación 50 ml')).toHaveValue('8')
  await expect(page.getByLabel('Stock de presentación 100 ml')).toHaveValue('3')
  await page.goto('/tienda?q=Prueba%20Importaci%C3%B3n')
  await expect(page.locator('.product-card')).toContainText(
    'Prueba Importación',
  )
  await expect(page.locator('.product-card')).toContainText('159.9')
})

test('no importa fórmulas, precios inválidos ni archivos con cabeceras incompletas', async ({
  page,
}) => {
  await page.goto('/admin/productos')
  await page.getByText('Importar productos con Excel').click()
  const invalid = await excelFile([productRow({ precio_soles: '159.999' })])
  await page
    .getByLabel('Archivo Excel .xlsx (máx. 5 MB)')
    .setInputFiles(invalid)
  await expect(page.getByLabel('Vista previa de importación')).toContainText(
    'Precio: indica soles positivos con máximo dos decimales.',
  )
  await expect(
    page.getByRole('button', { name: /Confirmar e importar/ }),
  ).toBeDisabled()

  const formulaWorkbook = new ExcelJS.Workbook()
  const sheet = formulaWorkbook.addWorksheet('Productos')
  sheet.addRow(headers)
  sheet.addRow(productRow({ slug: 'formula-prohibida' }))
  sheet.getRow(2).getCell(headers.indexOf('precio_soles') + 1).value = {
    formula: '100+20',
    result: 120,
  }
  await page.getByLabel('Archivo Excel .xlsx (máx. 5 MB)').setInputFiles({
    name: 'formula.xlsx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: (await formulaWorkbook.xlsx.writeBuffer()) as unknown as Uint8Array,
  })
  await expect(page.getByLabel('Vista previa de importación')).toContainText(
    'usa texto o número, sin fórmulas',
  )
  await expect(
    page.getByRole('button', { name: /Confirmar e importar/ }),
  ).toBeDisabled()

  const incomplete = new ExcelJS.Workbook()
  incomplete.addWorksheet('Productos').addRow(['slug', 'nombre'])
  await page.getByLabel('Archivo Excel .xlsx (máx. 5 MB)').setInputFiles({
    name: 'incompleto.xlsx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: (await incomplete.xlsx.writeBuffer()) as unknown as Uint8Array,
  })
  await expect(page.getByRole('alert')).toContainText(
    'Faltan columnas obligatorias',
  )
  await expect(page.getByLabel('Vista previa de importación')).toHaveCount(0)

  const exampleOnly = new ExcelJS.Workbook()
  const exampleSheet = exampleOnly.addWorksheet('Ejemplo')
  exampleSheet.addRow(headers)
  exampleSheet.addRow(productRow({ activo: 'no', imagen: '' }))
  await page.getByLabel('Archivo Excel .xlsx (máx. 5 MB)').setInputFiles({
    name: 'solo-ejemplo.xlsx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: (await exampleOnly.xlsx.writeBuffer()) as unknown as Uint8Array,
  })
  await expect(page.getByRole('alert')).toContainText(
    'no contiene una hoja de productos',
  )
  await expect(page.getByLabel('Vista previa de importación')).toHaveCount(0)
})

test('la importación permanece dentro del viewport móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin/productos')
  await page.getByText('Importar productos con Excel').click()
  const file = await excelFile([
    productRow({ activo: 'no', imagen: '', destacado: 'no' }),
  ])
  await page.getByLabel('Archivo Excel .xlsx (máx. 5 MB)').setInputFiles(file)
  await expect(page.getByLabel('Vista previa de importación')).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true)
  await page
    .getByRole('button', { name: 'Confirmar e importar 1 producto' })
    .click()
  await page.getByLabel('Buscar producto o marca').fill('Prueba Importación')
  await page.getByRole('button', { name: 'Aplicar filtros' }).click()
  await expect(page.locator('.admin-table--products')).toContainText(
    'Prueba Importación',
  )
  await page.getByRole('link', { name: /Editar Prueba Importación/ }).click()
  await expect(
    page.getByLabel('Subir foto principal del producto'),
  ).toHaveCount(1)
})

test('un producto sin foto se importa como borrador y puede publicarse después de subirla', async ({
  page,
}) => {
  await page.goto('/admin/productos')
  await page.getByText('Importar productos con Excel').click()
  const file = await excelFile([
    productRow({
      slug: 'imagen-pendiente',
      nombre: 'Imagen Pendiente',
      imagen: '',
      activo: 'no',
    }),
  ])
  await page.getByLabel('Archivo Excel .xlsx (máx. 5 MB)').setInputFiles(file)
  await expect(page.getByLabel('Vista previa de importación')).toContainText(
    '1 producto · 1 fila correcta',
  )
  await page
    .getByRole('button', { name: 'Confirmar e importar 1 producto' })
    .click()
  await page.getByLabel('Buscar producto o marca').fill('Imagen Pendiente')
  await page.getByRole('button', { name: 'Aplicar filtros' }).click()
  const product = page.locator('.admin-table--products tr', {
    hasText: 'Imagen Pendiente',
  })
  await expect(product).toContainText('Inactivo')
  await product.getByRole('link', { name: /Editar/ }).click()
  await page
    .getByLabel('Subir foto principal del producto')
    .setInputFiles('public/images/petale-960.webp')
  await page
    .getByRole('textbox', { name: 'Descripción de la imagen' })
    .first()
    .fill('Frasco de Imagen Pendiente sobre fondo claro')
  await page.getByLabel('Producto activo en tienda').check()
  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await page.goto('/producto/imagen-pendiente')
  await expect(
    page.getByRole('heading', { name: 'Imagen Pendiente', level: 1 }),
  ).toBeVisible()
  await expect(
    page.locator('.product-gallery-frame.is-active img'),
  ).toHaveAttribute('src', /^data:image\/webp;base64,/)
})
