import type ExcelJS from 'exceljs'
import {
  createAdminProductDetail,
  type AdminBrand,
  type AdminProduct,
} from '../../services/admin-service'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_DATA_ROWS = 1000

export const PRODUCT_IMPORT_COLUMNS = [
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
] as const

type ImportColumn = (typeof PRODUCT_IMPORT_COLUMNS)[number]

const REQUIRED_COLUMNS: readonly ImportColumn[] = [
  'slug',
  'nombre',
  'marca',
  'genero',
  'familia',
  'descripcion',
  'tamano_ml',
  'precio_soles',
  'stock',
  'activo',
]

type ImportValues = Record<ImportColumn, string>

export interface ProductImportRow {
  number: number
  slug: string
  name: string
  variant: string
  errors: string[]
}

export interface ProductImportPreview {
  rows: ProductImportRow[]
  products: AdminProduct[]
  validProductCount: number
  validRowCount: number
  invalidRowCount: number
}

function normalized(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function cellText(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return ''
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return String(value).trim()
  return null
}

function parseWholeNumber(value: string, max: number) {
  if (!/^\d+$/.test(value)) return null
  const number = Number(value)
  return Number.isSafeInteger(number) && number <= max ? number : null
}

function parseSoles(value: string) {
  const match = /^(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(value)
  if (!match) return null
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return cents > 0 ? cents : null
}

function parseYesNo(value: string) {
  if (['si', 'sí', '1', 'true'].includes(value.toLowerCase())) return true
  if (['no', '0', 'false'].includes(value.toLowerCase())) return false
  return null
}

function parseNotes(value: string) {
  return value
    .split(',')
    .map((note) => note.trim())
    .filter(Boolean)
}

function checkImage(value: string, existingImages: Set<string>) {
  if (!value) return true
  if (existingImages.has(value)) return true
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

function rowIdentity(values: ImportValues) {
  return JSON.stringify(
    PRODUCT_IMPORT_COLUMNS.filter(
      (column) => !['tamano_ml', 'precio_soles', 'stock'].includes(column),
    ).map((column) => values[column]),
  )
}

function makeRecord(
  values: ImportValues,
  brandId: string,
  id: string,
  variants: AdminProduct['product']['variants'],
): AdminProduct {
  const product = {
    id,
    slug: values.slug,
    name: values.nombre,
    brandId,
    image: values.imagen,
    family: values.familia,
    variants,
  }
  const detail = createAdminProductDetail(product, values.descripcion)
  detail.shortDescription = values.resumen || values.descripcion
  detail.type = values.tipo || 'Eau de Parfum'
  detail.notes = {
    top: parseNotes(values.notas_salida),
    heart: parseNotes(values.notas_corazon),
    base: parseNotes(values.notas_fondo),
  }
  const intensity = values.intensidad || 'Moderada'
  detail.intensity = intensity as typeof detail.intensity
  detail.intensityLevel =
    intensity === 'Suave' ? 1 : intensity === 'Intensa' ? 3 : 2
  detail.occasion = values.ocasion || 'Por definir'
  detail.season = values.temporada || 'Todo el año'
  detail.gallery = [
    {
      image: values.imagen,
      alt: `Frasco de ${values.nombre}`,
      framing: 'full',
    },
  ]
  return {
    product,
    detail,
    active: parseYesNo(values.activo) === true,
    featured: parseYesNo(values.destacado || 'no') === true,
    gender: values.genero as AdminProduct['gender'],
    popularity: 999,
    newest: Date.now(),
    lowStockThreshold: Number(values.umbral_stock || 2),
  }
}

export async function parseProductImport(
  file: File,
  brands: readonly AdminBrand[],
  existingProducts: readonly AdminProduct[],
): Promise<ProductImportPreview> {
  if (!/\.xlsx$/i.test(file.name))
    throw new Error('Selecciona un archivo Excel .xlsx.')
  if (file.size > MAX_FILE_BYTES)
    throw new Error('El archivo supera el máximo de 5 MB.')
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(await file.arrayBuffer())
  } catch {
    throw new Error(
      'No se pudo leer el Excel. Descarga la plantilla y revisa el archivo.',
    )
  }
  const sheet =
    workbook.getWorksheet('Productos') ??
    workbook.worksheets.find(
      (candidate) => !['ejemplo', 'guia'].includes(normalized(candidate.name)),
    )
  if (!sheet) throw new Error('El Excel no contiene una hoja de productos.')
  const headers = new Map<string, number>()
  const duplicateHeaders = new Set<string>()
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, index) => {
    const header = cellText(cell.value)
    if (header) {
      const key = header.toLowerCase()
      if (headers.has(key)) duplicateHeaders.add(key)
      headers.set(key, index)
    }
  })
  if (duplicateHeaders.size)
    throw new Error(`Columnas repetidas: ${[...duplicateHeaders].join(', ')}.`)
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.has(column))
  if (missing.length)
    throw new Error(`Faltan columnas obligatorias: ${missing.join(', ')}.`)
  const unknown = [...headers.keys()].filter(
    (header) => !PRODUCT_IMPORT_COLUMNS.includes(header as ImportColumn),
  )
  if (unknown.length)
    throw new Error(`Columnas no reconocidas: ${unknown.join(', ')}.`)
  if (sheet.rowCount - 1 > MAX_DATA_ROWS)
    throw new Error(
      `El archivo admite hasta ${MAX_DATA_ROWS} filas de productos.`,
    )

  const rows: ProductImportRow[] = []
  const groups = new Map<
    string,
    {
      rows: ProductImportRow[]
      values: ImportValues
      brandId: string
      variants: AdminProduct['product']['variants']
      identity: string
    }
  >()
  const existingImages = new Set(
    existingProducts.map((record) => record.product.image).filter(Boolean),
  )
  const existingSlugs = new Set(
    existingProducts.map((record) => normalized(record.product.slug)),
  )
  const existingNames = new Set(
    existingProducts.map(
      (record) =>
        `${record.product.brandId}:${normalized(record.product.name)}`,
    ),
  )

  sheet.eachRow((sheetRow, number) => {
    if (number === 1) return
    const values = Object.fromEntries(
      PRODUCT_IMPORT_COLUMNS.map((column) => {
        const index = headers.get(column)
        return [column, index ? cellText(sheetRow.getCell(index).value) : '']
      }),
    ) as ImportValues & Record<ImportColumn, string | null>
    if (PRODUCT_IMPORT_COLUMNS.every((column) => !values[column])) return
    const errors: string[] = []
    for (const column of PRODUCT_IMPORT_COLUMNS) {
      if (values[column] === null)
        errors.push(`${column}: usa texto o número, sin fórmulas.`)
      values[column] ??= ''
    }
    for (const column of REQUIRED_COLUMNS) {
      if (!values[column]) errors.push(`Falta ${column}.`)
    }
    const slug = values.slug.toLowerCase()
    const brand = brands.find(
      (item) =>
        normalized(item.id) === normalized(values.marca) ||
        normalized(item.name) === normalized(values.marca),
    )
    const gender = normalized(values.genero)
    const active = parseYesNo(values.activo)
    const featured = parseYesNo(values.destacado || 'no')
    const ml = parseWholeNumber(values.tamano_ml, 1000)
    const priceCents = parseSoles(values.precio_soles)
    const stock = parseWholeNumber(values.stock, 1_000_000)
    const threshold = parseWholeNumber(values.umbral_stock || '2', 1_000_000)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
      errors.push('Slug inválido: usa minúsculas, números y guiones.')
    if (existingSlugs.has(normalized(slug)))
      errors.push('El slug ya existe en el catálogo.')
    if (!brand) errors.push('La marca no existe en el panel.')
    else {
      if (active && !brand.active) errors.push('La marca está desactivada.')
      if (existingNames.has(`${brand.id}:${normalized(values.nombre)}`))
        errors.push('El producto ya existe con esa marca y nombre.')
    }
    if (!['hombre', 'mujer', 'unisex'].includes(gender))
      errors.push('Género: usa hombre, mujer o unisex.')
    if (active === null) errors.push('Activo: usa sí o no.')
    if (featured === null) errors.push('Destacado: usa sí o no.')
    if (featured && !active)
      errors.push('Un producto destacado debe estar activo.')
    if (ml === null || ml === 0)
      errors.push('Tamaño: indica ml enteros entre 1 y 1000.')
    if (priceCents === null)
      errors.push('Precio: indica soles positivos con máximo dos decimales.')
    if (stock === null) errors.push('Stock: indica un entero no negativo.')
    if (threshold === null)
      errors.push('Umbral de stock: indica un entero no negativo.')
    if (
      values.intensidad &&
      !['Suave', 'Moderada', 'Intensa'].includes(values.intensidad)
    )
      errors.push('Intensidad: usa Suave, Moderada o Intensa.')
    if (!checkImage(values.imagen, existingImages))
      errors.push('Imagen: usa una imagen existente o una URL HTTPS.')
    if (active && !values.imagen)
      errors.push('La imagen es obligatoria para publicar el producto.')
    if (
      values.nombre.length > 140 ||
      values.familia.length > 100 ||
      values.descripcion.length > 4000
    )
      errors.push('Nombre, familia o descripción demasiado largos.')
    const result: ProductImportRow = {
      number,
      slug,
      name: values.nombre,
      variant: values.tamano_ml ? `${values.tamano_ml} ml` : '—',
      errors,
    }
    rows.push(result)
    const group = groups.get(slug)
    if (group) {
      group.rows.push(result)
      if (group.identity !== rowIdentity(values))
        errors.push('Los datos del producto difieren entre sus presentaciones.')
      if (group.variants.some((variant) => variant.ml === ml))
        errors.push('Presentación duplicada para este producto.')
      if (ml !== null && priceCents !== null && stock !== null)
        group.variants.push({ id: '', ml, priceCents, stock, active: true })
    } else {
      groups.set(slug, {
        rows: [result],
        values: { ...values, slug, genero: gender },
        brandId: brand?.id ?? '',
        identity: rowIdentity(values),
        variants:
          ml !== null && priceCents !== null && stock !== null
            ? [{ id: '', ml, priceCents, stock, active: true }]
            : [],
      })
    }
  })
  if (!rows.length)
    throw new Error(
      'La hoja no contiene productos. Completa al menos una fila.',
    )
  const sheetNames = new Map<string, string>()
  for (const [slug, group] of groups) {
    const key = `${group.brandId}:${normalized(group.values.nombre)}`
    const previous = sheetNames.get(key)
    if (previous && previous !== slug) {
      for (const row of group.rows)
        row.errors.push(
          'Esta marca y nombre aparecen con otro slug en el archivo.',
        )
      for (const row of groups.get(previous)?.rows ?? [])
        row.errors.push(
          'Esta marca y nombre aparecen con otro slug en el archivo.',
        )
    } else sheetNames.set(key, slug)
  }
  const products: AdminProduct[] = []
  for (const group of groups.values()) {
    if (group.rows.some((row) => row.errors.length)) {
      for (const row of group.rows) {
        if (!row.errors.length)
          row.errors.push(
            'Producto incompleto: corrige sus otras presentaciones.',
          )
      }
      continue
    }
    const id = `product-${crypto.randomUUID()}`
    const variants = group.variants.map((variant) => ({
      ...variant,
      id: `${id}-${variant.ml}`,
    }))
    products.push(makeRecord(group.values, group.brandId, id, variants))
  }
  return {
    rows,
    products,
    validProductCount: products.length,
    validRowCount: rows.filter((row) => !row.errors.length).length,
    invalidRowCount: rows.filter((row) => row.errors.length > 0).length,
  }
}

export async function downloadProductTemplate(brands: readonly AdminBrand[]) {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Productos')
  const example = workbook.addWorksheet('Ejemplo')
  for (const productSheet of [sheet, example]) {
    productSheet.addRow([...PRODUCT_IMPORT_COLUMNS])
    productSheet.getRow(1).font = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
    }
    productSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF29453D' },
    }
    productSheet.getRow(1).height = 26
    productSheet.columns.forEach((column) => {
      column.width = 20
    })
    productSheet.getColumn(6).width = 44
    productSheet.getColumn(12).width = 36
    productSheet.views = [{ state: 'frozen', ySplit: 1 }]
    productSheet.autoFilter = { from: 'A1', to: 'U1' }
  }
  const sample = {
    slug: 'bosque-de-ejemplo',
    nombre: 'Bosque de Ejemplo',
    marca: brands.find((brand) => brand.active)?.name ?? 'Atelier 01',
    genero: 'unisex',
    familia: 'Amaderada · fresca',
    descripcion:
      'Una fragancia de ejemplo con salida cítrica y fondo amaderado.',
    imagen: '',
    activo: 'no',
    resumen: 'Fresca al inicio, cálida al final.',
    tipo: 'Eau de Parfum',
    notas_salida: 'Bergamota, Enebro',
    notas_corazon: 'Cedro, Té blanco',
    notas_fondo: 'Vetiver, Almizcle',
    intensidad: 'Moderada',
    ocasion: 'Diario',
    temporada: 'Todo el año',
    destacado: 'no',
    umbral_stock: 2,
  }
  for (const [ml, price, stock] of [
    [50, '159.90', 8],
    [100, '199.00', 3],
  ] as const) {
    const row = example.addRow(
      PRODUCT_IMPORT_COLUMNS.map((column) => {
        if (column === 'tamano_ml') return ml
        if (column === 'precio_soles') return price
        if (column === 'stock') return stock
        return sample[column as keyof typeof sample]
      }),
    )
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8EFED' },
    }
  }
  const guide = workbook.addWorksheet('Guía')
  guide.addRows([
    [
      'Completa solo la hoja Productos. La hoja Ejemplo muestra dos tamaños del mismo perfume y no se importa.',
    ],
    [
      'Una fila por presentación. Repite los datos del producto en cada una de sus presentaciones.',
    ],
    ['Obligatorias', REQUIRED_COLUMNS.join(', ')],
    [
      'marca',
      'Nombre o ID de una marca ya registrada: ' +
        brands.map((brand) => brand.name).join(', '),
    ],
    ['genero', 'hombre, mujer o unisex'],
    [
      'precio_soles',
      'Ejemplo: 159.90. No incluyas símbolo de moneda ni separador de miles.',
    ],
    ['activo / destacado', 'sí o no. Si omites destacado, se considera no.'],
    [
      'imagen',
      'Para publicar, usa una URL HTTPS pública y directa de la foto o una clave de imagen ya existente en el catálogo. Excel no sube archivos ni imágenes pegadas en celdas.',
    ],
    [
      'sin imagen',
      'Deja imagen vacía y escribe activo=no. El perfume se importará como borrador; después sube su foto desde Productos > Editar y publícalo.',
    ],
    [
      'más fotos',
      'Excel registra una foto principal. Añade las otras vistas, incluida la foto que aparece al pasar el cursor, desde Productos > Editar.',
    ],
    [
      'Opcionales',
      'resumen, tipo, notas_salida, notas_corazon, notas_fondo, intensidad, ocasion, temporada, destacado, umbral_stock',
    ],
    ['notas', 'Separa varias notas con comas.'],
    ['intensidad', 'Suave, Moderada o Intensa. Si se omite: Moderada.'],
    ['Límite', 'Hasta 1000 filas y 5 MB por archivo. Formato .xlsx.'],
  ])
  guide.getColumn(1).width = 24
  guide.getColumn(2).width = 110
  guide.getRow(1).font = { bold: true }
  const data = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(
    new Blob([data as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = 'aroma-infini-plantilla-productos.xlsx'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
