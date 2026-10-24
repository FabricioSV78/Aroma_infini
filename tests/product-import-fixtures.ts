import ExcelJS from 'exceljs'
import type { Page } from '@playwright/test'
import type { AdminState } from '../src/services/admin-service'

export const importHeaders = [
  'slug',
  'nombre',
  'marca',
  'genero',
  'familia',
  'familia_olfativa',
  'descripcion',
  'tamano_ml',
  'precio_soles',
  'stock',
  'resumen',
  'notas_salida',
  'notas_corazon',
  'notas_fondo',
  'intensidad',
  'ocasion',
  'temporada',
  'umbral_stock',
  'tipo_producto',
  'presentacion',
  'sku',
  'descuento_tipo',
  'descuento_valor',
  'descuento_activo',
  'descuento_inicio',
  'descuento_fin',
] as const

export type ImportRecord = Record<string, string | number>

export function importRecord(overrides: ImportRecord = {}): ImportRecord {
  return {
    slug: 'prueba-importacion',
    nombre: 'Prueba Importación',
    marca: 'Atelier 01',
    genero: 'unisex',
    familia: 'Amaderada',
    familia_olfativa: 'Amaderada, Fresca',
    descripcion: 'Una fragancia de prueba para validar el catálogo.',
    tamano_ml: 50,
    precio_soles: '159.90',
    stock: 8,
    resumen: 'Amaderada y luminosa.',
    notas_salida: 'Bergamota, Enebro',
    notas_corazon: 'Cedro',
    notas_fondo: 'Vetiver',
    intensidad: 'Moderada',
    ocasion: 'Diario',
    temporada: 'Todo el año',
    umbral_stock: 2,
    tipo_producto: 'perfume',
    presentacion: '',
    sku: 'PRUEBA-50',
    ...overrides,
  }
}

export async function importFile(
  records: ImportRecord[],
  columns: readonly string[] = importHeaders,
  name = 'productos.xlsx',
) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Productos')
  sheet.addRow([...columns])
  records.forEach((record) =>
    sheet.addRow(columns.map((key) => record[key] ?? '')),
  )
  return {
    name,
    mimeType:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
  }
}

export async function openImport(page: Page) {
  await page.goto('/admin/productos')
  await page.getByText('Importar productos con Excel', { exact: true }).click()
}

export async function reviewFile(
  page: Page,
  file: Awaited<ReturnType<typeof importFile>>,
) {
  await page.getByLabel('Archivo Excel .xlsx (máx. 5 MB)').setInputFiles(file)
  await page.getByRole('button', { name: 'Revisar filas y confirmar' }).click()
  return page.getByRole('dialog', { name: /Vista previa/ })
}

/** Read only the isolated browser's persisted demo data, never a remote API. */
export async function persistedAdminState(page: Page): Promise<AdminState> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('aroma-infini-admin', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    return new Promise<AdminState>((resolve, reject) => {
      const request = database
        .transaction('snapshot', 'readonly')
        .objectStore('snapshot')
        .get('current')
      request.onsuccess = () => {
        database.close()
        resolve(request.result as AdminState)
      }
      request.onerror = () => reject(request.error)
    })
  })
}

export const importViewports = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
] as const
