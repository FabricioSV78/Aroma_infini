import type ExcelJS from 'exceljs'
import { UserFacingError } from '../../services/admin-messages'
import {
  isProductType,
  PRODUCT_TYPES,
  variantKey,
} from '../../domain/product-type'
import {
  isValidSku,
  normalizeSku,
  productSlug,
} from '../../domain/product-identity'
import {
  OLFACTORY_FAMILIES,
  parseOlfactoryFamilies,
  validateProductOlfactoryClassification,
} from '../../domain/olfactory-family'
import {
  createAdminProductDetail,
  getStoreFeatures,
  type AdminBrand,
  type AdminProduct,
} from '../../services/admin-service'
import { validateProductDiscount } from '../../services/product-discounts'
import type { ProductDiscount } from '../../types/catalog'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_DATA_ROWS = 1000

/** Only structured catalog data belongs in the workbook. */
export const PRODUCT_IMPORT_COLUMNS = [
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
  'sku',
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
  'descuento_tipo',
  'descuento_valor',
  'descuento_activo',
  'descuento_inicio',
  'descuento_fin',
] as const

type ImportColumn = (typeof PRODUCT_IMPORT_COLUMNS)[number]
type ImportValues = Record<ImportColumn, string>

const REQUIRED_COLUMNS: readonly ImportColumn[] = [
  'nombre',
  'descripcion',
  'precio_soles',
  'stock',
]
// Backward compatibility accepts these headers, but never reads their cells.
const RETIRED_COLUMNS = new Set(['imagen', 'activo', 'destacado', 'tipo'])
const VARIANT_COLUMNS = new Set<ImportColumn>([
  'tamano_ml',
  'presentacion',
  'precio_soles',
  'stock',
  'sku',
])
const OLFACTORY_COLUMNS: readonly ImportColumn[] = [
  'genero',
  'familia',
  'familia_olfativa',
  'notas_salida',
  'notas_corazon',
  'notas_fondo',
  'intensidad',
  'ocasion',
  'temporada',
]

export interface ProductImportRow {
  number: number
  slug: string
  name: string
  variant: string
  errors: string[]
  duplicate?: boolean
  warnings?: string[]
}

export interface ProductImportPreview {
  rows: ProductImportRow[]
  products: AdminProduct[]
  validProductCount: number
  validRowCount: number
  invalidRowCount: number
  duplicateRowCount: number
  warnings?: string[]
}

function normalized(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function cellText(
  value: ExcelJS.CellValue,
  column?: ImportColumn,
): string | null {
  if (value === null || value === undefined) return ''
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return String(value).trim()
  if (
    value instanceof Date &&
    Number.isFinite(value.getTime()) &&
    (column === 'descuento_inicio' || column === 'descuento_fin')
  )
    return value.toISOString()
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
  if (['si', '1', 'true'].includes(normalized(value))) return true
  if (['no', '0', 'false'].includes(normalized(value))) return false
  return null
}

function parseNotes(value: string) {
  return value
    .split(',')
    .map((note) => note.trim())
    .filter(Boolean)
}

function parseDiscountDate(value: string): string | null {
  if (!value) return ''
  if (
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(
      value,
    )
  )
    return null
  const day = new Date(`${value.slice(0, 10)}T00:00:00.000Z`)
  const timestamp = Date.parse(value)
  if (
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== value.slice(0, 10) ||
    !Number.isFinite(timestamp)
  )
    return null
  return new Date(timestamp).toISOString()
}

function readDiscount(
  values: ImportValues,
  errors: string[],
): ProductDiscount | null {
  const fields: ImportColumn[] = [
    'descuento_tipo',
    'descuento_valor',
    'descuento_activo',
    'descuento_inicio',
    'descuento_fin',
  ]
  if (!fields.some((column) => values[column])) return null
  if (
    !values.descuento_tipo &&
    !values.descuento_valor &&
    !values.descuento_inicio &&
    !values.descuento_fin &&
    parseYesNo(values.descuento_activo) === false
  )
    return null
  const type = normalized(values.descuento_tipo)
  const discountType = ['percentage', 'percent', 'porcentaje'].includes(type)
    ? 'percent'
    : ['fixed', 'fijo', 'importe'].includes(type)
      ? 'fixed'
      : null
  if (!discountType)
    errors.push(
      'Descuento: usa percentage (porcentaje) o fixed (importe en soles).',
    )
  const value =
    discountType === 'fixed'
      ? parseSoles(values.descuento_valor)
      : parseWholeNumber(values.descuento_valor, Number.MAX_SAFE_INTEGER)
  if (value === null)
    errors.push(
      discountType === 'fixed'
        ? 'Descuento: indica un importe positivo en soles con máximo dos decimales.'
        : 'Descuento: indica un porcentaje entero.',
    )
  const active = parseYesNo(values.descuento_activo || 'sí')
  if (active === null) errors.push('Descuento activo: usa sí o no.')
  const startsAt = parseDiscountDate(values.descuento_inicio)
  const endsAt = parseDiscountDate(values.descuento_fin)
  if (startsAt === null || endsAt === null)
    errors.push(
      'Fechas del descuento: usa AAAA-MM-DD o una fecha ISO con zona horaria, por ejemplo 2027-01-01T00:00:00Z.',
    )
  if (
    !discountType ||
    value === null ||
    active === null ||
    startsAt === null ||
    endsAt === null
  )
    return null
  return { type: discountType, value, active, startsAt, endsAt }
}

function rowIdentity(values: ImportValues, discount: ProductDiscount | null) {
  return JSON.stringify([
    ...PRODUCT_IMPORT_COLUMNS.filter(
      (column) =>
        !VARIANT_COLUMNS.has(column) && !column.startsWith('descuento_'),
    ).map((column) => values[column]),
    discount,
  ])
}

function duplicate(row: ProductImportRow, reason: string) {
  row.duplicate = true
  if (!row.errors.includes(reason)) row.errors.push(reason)
}

function makeRecord(
  values: ImportValues,
  brandId: string,
  id: string,
  variants: AdminProduct['product']['variants'],
  discount: ProductDiscount | null,
  classificationColumnPresent: boolean,
): AdminProduct {
  const olfactoryFamilies = classificationColumnPresent
    ? (parseOlfactoryFamilies(values.familia_olfativa) ?? [])
    : undefined
  const complement = values.tipo_producto === 'complemento'
  const product: AdminProduct['product'] = {
    productType: complement ? 'complemento' : 'perfume',
    id,
    slug: values.slug,
    name: values.nombre,
    brandId,
    image: '',
    family: complement ? '' : values.familia,
    olfactoryFamilies: complement ? [] : olfactoryFamilies,
    olfactoryFamily: complement
      ? null
      : classificationColumnPresent
        ? (olfactoryFamilies?.[0] ?? null)
        : undefined,
    variants,
    discount,
  }
  const detail = createAdminProductDetail(product, values.descripcion)
  detail.shortDescription = values.resumen || values.descripcion
  detail.notes = complement
    ? { top: [], heart: [], base: [] }
    : {
        top: parseNotes(values.notas_salida),
        heart: parseNotes(values.notas_corazon),
        base: parseNotes(values.notas_fondo),
      }
  const intensity = values.intensidad || 'Moderada'
  detail.intensity = complement ? null : (intensity as typeof detail.intensity)
  detail.intensityLevel = complement
    ? null
    : intensity === 'Suave'
      ? 1
      : intensity === 'Intensa'
        ? 3
        : 2
  detail.occasion = complement ? '' : values.ocasion || 'Por definir'
  detail.season = complement ? '' : values.temporada || 'Todo el año'
  detail.gallery = []
  detail.olfactoryImage = null
  return {
    product,
    detail,
    active: false,
    gender: complement ? null : (values.genero as AdminProduct['gender']),
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
    throw new UserFacingError(
      'excel-format',
      'Selecciona un archivo Excel .xlsx.',
    )
  if (file.size > MAX_FILE_BYTES)
    throw new UserFacingError(
      'excel-size',
      'El archivo supera el máximo de 5 MB.',
    )
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(await file.arrayBuffer())
  } catch {
    throw new UserFacingError(
      'excel-unreadable',
      'No se pudo leer el Excel. Descarga la plantilla y revisa el archivo.',
    )
  }
  const sheet =
    workbook.getWorksheet('Productos') ??
    workbook.worksheets.find(
      (candidate) =>
        !['ejemplo', 'guia', 'opciones'].includes(normalized(candidate.name)),
    )
  if (!sheet)
    throw new UserFacingError(
      'excel-sheet',
      'El Excel no contiene una hoja de productos.',
    )
  const headers = new Map<string, number>()
  const duplicateHeaders = new Set<string>()
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, index) => {
    const header = cellText(cell.value)
    if (header) {
      const key = normalized(header)
      if (headers.has(key)) duplicateHeaders.add(key)
      headers.set(key, index)
    }
  })
  if (duplicateHeaders.size)
    throw new UserFacingError(
      'excel-columns-duplicate',
      `Columnas repetidas: ${[...duplicateHeaders].join(', ')}.`,
    )
  const missing = REQUIRED_COLUMNS.filter((column) => !headers.has(column))
  if (missing.length)
    throw new UserFacingError(
      'excel-columns-missing',
      `Faltan columnas obligatorias: ${missing.join(', ')}.`,
    )
  const unknown = [...headers.keys()].filter(
    (header) =>
      !RETIRED_COLUMNS.has(header) &&
      !PRODUCT_IMPORT_COLUMNS.includes(header as ImportColumn),
  )
  if (unknown.length)
    throw new UserFacingError(
      'excel-columns-unknown',
      `Columnas no reconocidas: ${unknown.join(', ')}.`,
    )
  if (sheet.rowCount - 1 > MAX_DATA_ROWS)
    throw new UserFacingError(
      'excel-row-limit',
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
      variantRows: Map<string, ProductImportRow>
      identity: string
      discount: ProductDiscount | null
    }
  >()
  const brandsByKey = new Map<string, AdminBrand>()
  for (const brand of brands) {
    brandsByKey.set(normalized(brand.id), brand)
    brandsByKey.set(normalized(brand.name), brand)
  }
  const existingSlugs = new Set(
    existingProducts.map((record) => normalized(record.product.slug)),
  )
  const existingNames = new Set(
    existingProducts.map(
      (record) =>
        `${record.product.brandId}:${normalized(record.product.name)}`,
    ),
  )
  const existingSkus = new Set(
    existingProducts.flatMap((record) =>
      record.product.variants
        .map((variant) => normalizeSku(variant.sku ?? ''))
        .filter(Boolean),
    ),
  )
  const skuRows = new Map<string, ProductImportRow>()

  for (let number = 2; number <= sheet.rowCount; number += 1) {
    const sheetRow = sheet.getRow(number)
    const errors: string[] = []
    let hasData = false
    const values = Object.fromEntries(
      PRODUCT_IMPORT_COLUMNS.map((column) => {
        const index = headers.get(column)
        const value = index
          ? cellText(sheetRow.getCell(index).value, column)
          : ''
        if (value !== '') hasData = true
        if (value === null)
          errors.push(`${column}: usa texto o número, sin fórmulas.`)
        return [column, value ?? '']
      }),
    ) as ImportValues
    if (!hasData) continue
    values.tipo_producto = normalized(values.tipo_producto || 'perfume')
    values.genero = normalized(values.genero)
    values.slug = values.slug
      ? values.slug.toLowerCase()
      : productSlug(values.nombre)
    values.sku = normalizeSku(values.sku)
    const complement = values.tipo_producto === 'complemento'
    const warnings: string[] = []
    if (complement && OLFACTORY_COLUMNS.some((column) => values[column])) {
      warnings.push(
        'Las características olfativas no se utilizan en complementos.',
      )
      for (const column of OLFACTORY_COLUMNS) values[column] = ''
    }
    if (!isProductType(values.tipo_producto))
      errors.push('Tipo de producto: usa perfume o complemento.')
    const required = complement
      ? REQUIRED_COLUMNS
      : ([
          ...REQUIRED_COLUMNS,
          'marca',
          'genero',
          'familia',
          'tamano_ml',
        ] as const)
    for (const column of required) {
      if (!values[column]) errors.push(`Falta ${column}.`)
    }
    const brand = brandsByKey.get(normalized(values.marca))
    const slug = values.slug
    const ml = complement ? null : parseWholeNumber(values.tamano_ml, 1000)
    const priceCents = parseSoles(values.precio_soles)
    const stock = parseWholeNumber(values.stock, 1_000_000)
    const threshold = parseWholeNumber(values.umbral_stock || '2', 1_000_000)
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
      errors.push('Slug inválido: usa minúsculas, números y guiones.')
    if (!brand && (!complement || values.marca))
      errors.push('La marca no existe en el panel.')
    if (!complement && !['hombre', 'mujer', 'unisex'].includes(values.genero))
      errors.push('Género: usa hombre, mujer o unisex.')
    if (!complement) {
      const families = parseOlfactoryFamilies(values.familia_olfativa)
      if (families === null)
        errors.push('Familia olfativa: usa una opción de la hoja Guía.')
      else if (headers.has('familia_olfativa')) {
        const classificationError = validateProductOlfactoryClassification({
          family: values.familia,
          olfactoryFamily: families[0] ?? null,
          olfactoryFamilies: families,
        })
        if (classificationError)
          errors.push(classificationError.replace(' Revisa ambos datos.', ''))
      }
    }
    if (!complement && (ml === null || ml === 0))
      errors.push('Tamaño: indica ml enteros entre 1 y 1000.')
    if (complement && values.tamano_ml)
      errors.push(
        'Para complementos deja tamano_ml vacío y utiliza presentacion.',
      )
    if (complement && values.presentacion.length > 80)
      errors.push('Presentación: máximo 80 caracteres.')
    if (priceCents === null)
      errors.push('Precio: indica soles positivos con máximo dos decimales.')
    if (stock === null) errors.push('Stock: indica un entero no negativo.')
    if (threshold === null)
      errors.push('Umbral de stock: indica un entero no negativo.')
    if (
      !complement &&
      values.intensidad &&
      !['Suave', 'Moderada', 'Intensa'].includes(values.intensidad)
    )
      errors.push('Intensidad: usa Suave, Moderada o Intensa.')
    if (values.sku && !isValidSku(values.sku))
      errors.push(
        'SKU inválido: usa hasta 64 letras, números, puntos, guiones o guiones bajos.',
      )
    if (
      values.nombre.length > 140 ||
      values.familia.length > 100 ||
      values.descripcion.length > 4000
    )
      errors.push('Nombre, familia o descripción demasiado largos.')
    const discount = readDiscount(values, errors)
    // Canonical defaults keep equivalent metadata consistent across presentations.
    values.marca = brand?.id ?? values.marca
    values.umbral_stock = String(threshold ?? values.umbral_stock)
    if (complement) values.presentacion ||= 'Unidad'
    const result: ProductImportRow = {
      number,
      slug,
      name: values.nombre,
      variant: complement
        ? values.presentacion
        : values.tamano_ml
          ? `${values.tamano_ml} ml`
          : '—',
      errors,
      ...(warnings.length ? { warnings } : {}),
    }
    rows.push(result)
    if (existingSlugs.has(normalized(slug)))
      duplicate(result, 'El slug ya existe en el catálogo.')
    if (existingNames.has(`${brand?.id ?? ''}:${normalized(values.nombre)}`))
      duplicate(result, 'El producto ya existe con esa marca y nombre.')
    if (values.sku) {
      if (existingSkus.has(values.sku))
        duplicate(result, 'El SKU ya existe en el catálogo.')
      const previous = skuRows.get(values.sku)
      if (previous) {
        duplicate(
          result,
          `SKU repetido en el archivo (fila ${previous.number}).`,
        )
        duplicate(previous, `SKU repetido en el archivo (fila ${number}).`)
      } else skuRows.set(values.sku, result)
    }
    const identity = rowIdentity(values, discount)
    const variant = {
      id: '',
      ml,
      label: complement ? values.presentacion : undefined,
      ...(values.sku ? { sku: values.sku } : {}),
      priceCents: priceCents ?? 0,
      stock: stock ?? 0,
      active: true,
    }
    const key = variantKey(variant)
    const group = groups.get(slug)
    if (group) {
      group.rows.push(result)
      if (group.identity !== identity) {
        if (
          group.brandId !== (brand?.id ?? '') ||
          normalized(group.values.nombre) !== normalized(values.nombre)
        ) {
          for (const row of group.rows)
            duplicate(
              row,
              'El mismo slug identifica productos diferentes en el archivo. Usa un slug distinto para cada producto.',
            )
        } else
          errors.push(
            'Los datos del producto difieren entre sus presentaciones.',
          )
      }
      const previous = group.variantRows.get(key)
      if (previous) {
        duplicate(
          result,
          `Presentación duplicada para este producto (fila ${previous.number}).`,
        )
        duplicate(
          previous,
          `Presentación duplicada para este producto (fila ${number}).`,
        )
      } else group.variantRows.set(key, result)
      if ((complement || ml !== null) && priceCents !== null && stock !== null)
        group.variants.push(variant)
    } else {
      groups.set(slug, {
        rows: [result],
        values,
        brandId: brand?.id ?? '',
        identity,
        discount,
        variantRows: new Map([[key, result]]),
        variants:
          (complement || ml !== null) && priceCents !== null && stock !== null
            ? [variant]
            : [],
      })
    }
    // Let the browser paint progress and remain responsive for large workbooks.
    if (rows.length % 100 === 0)
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
  if (!rows.length)
    throw new UserFacingError(
      'excel-empty',
      'La hoja no contiene productos. Completa al menos una fila.',
    )
  const sheetNames = new Map<string, string>()
  for (const [slug, group] of groups) {
    const key = `${group.brandId}:${normalized(group.values.nombre)}`
    const previous = sheetNames.get(key)
    if (previous !== undefined && previous !== slug) {
      for (const row of [...group.rows, ...(groups.get(previous)?.rows ?? [])])
        duplicate(
          row,
          'Esta marca y nombre aparecen con otro slug en el archivo.',
        )
    } else sheetNames.set(key, slug)
  }
  const products: AdminProduct[] = []
  for (const group of groups.values()) {
    const discountError = validateProductDiscount(
      group.discount,
      group.variants,
    )
    if (discountError) {
      for (const row of group.rows) row.errors.push(discountError)
    }
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
    const variants = group.variants.map((variant, index) => ({
      ...variant,
      id: `${id}-${index + 1}`,
    }))
    products.push(
      makeRecord(
        group.values,
        group.brandId,
        id,
        variants,
        group.discount,
        headers.has('familia_olfativa'),
      ),
    )
  }
  const retired = [...headers.keys()].filter((header) =>
    RETIRED_COLUMNS.has(header),
  )
  return {
    rows,
    products,
    validProductCount: products.length,
    validRowCount: rows.filter((row) => !row.errors.length).length,
    invalidRowCount: rows.filter((row) => row.errors.length > 0).length,
    duplicateRowCount: rows.filter((row) => row.duplicate).length,
    ...(retired.length
      ? {
          warnings: [
            `Se ignoraron las columnas antiguas ${retired.join(', ')}. Todos los productos se importan como borradores pendientes de fotografías.`,
          ],
        }
      : {}),
  }
}

/** A workbook builder also used to validate the exact downloadable artifact. */
export async function createProductTemplateWorkbook(
  brands: readonly AdminBrand[],
  features = getStoreFeatures(),
) {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Aroma Infini'
  workbook.title = 'Plantilla de importación de productos'
  const sheet = workbook.addWorksheet('Productos')
  const example = workbook.addWorksheet('Ejemplo')
  const guide = workbook.addWorksheet('Guía')
  const options = workbook.addWorksheet('Opciones', { state: 'veryHidden' })
  const templateColumns = PRODUCT_IMPORT_COLUMNS.filter(
    (column) =>
      features.complementsEnabled ||
      (column !== 'tipo_producto' && column !== 'presentacion'),
  )
  const columnNumber = (column: ImportColumn) =>
    templateColumns.indexOf(column) + 1
  for (const productSheet of [sheet, example]) {
    productSheet.addRow([...templateColumns])
    productSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    productSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF29453D' },
    }
    productSheet.getRow(1).height = 30
    productSheet.columns.forEach((column) => {
      column.width = 22
    })
    for (const column of ['nombre', 'descripcion', 'resumen'] as const)
      productSheet.getColumn(columnNumber(column)).width =
        column === 'descripcion' ? 50 : 32
    productSheet.getColumn(columnNumber('sku')).numFmt = '@'
    productSheet.getColumn(columnNumber('precio_soles')).numFmt = '0.00'
    productSheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 2 }]
    productSheet.autoFilter = {
      from: 'A1',
      to: productSheet.getRow(1).getCell(templateColumns.length).address,
    }
  }
  const addList = (
    column: ImportColumn,
    choices: readonly string[],
    listNumber: number,
    customInput?: { title: string; message: string },
  ) => {
    if (!templateColumns.includes(column)) return
    choices.forEach((choice, index) => {
      options.getCell(index + 1, listNumber).value = choice
    })
    const name = `opciones_${column}`
    const letter = options.getColumn(listNumber).letter
    workbook.definedNames.add(
      `'Opciones'!$${letter}$1:$${letter}$${choices.length}`,
      name,
    )
    // ExcelJS exposes range validation at runtime; using it avoids 1000 empty rows.
    const target = sheet.getColumn(columnNumber(column)).letter
    for (const productSheet of [sheet, example]) {
      const validations = (
        productSheet as ExcelJS.Worksheet & {
          dataValidations: {
            add(address: string, validation: ExcelJS.DataValidation): void
          }
        }
      ).dataValidations
      validations.add(`${target}2:${target}${MAX_DATA_ROWS + 1}`, {
        type: 'list',
        allowBlank: true,
        formulae: [name],
        showErrorMessage: !customInput,
        errorStyle: 'stop',
        errorTitle: 'Revisa el valor',
        error: 'Selecciona una opción de la lista.',
        ...(customInput && {
          showInputMessage: true,
          promptTitle: customInput.title,
          prompt: customInput.message,
        }),
      })
    }
  }
  addList(
    'tipo_producto',
    PRODUCT_TYPES.filter(
      (type) => features.complementsEnabled || type.value === 'perfume',
    ).map((type) => type.value),
    1,
  )
  addList('genero', ['hombre', 'mujer', 'unisex'], 2)
  addList('intensidad', ['Suave', 'Moderada', 'Intensa'], 3)
  addList('descuento_tipo', ['percentage', 'fixed'], 4)
  addList('descuento_activo', ['sí', 'no'], 5)
  if (brands.length)
    addList(
      'marca',
      brands.map((brand) => brand.name),
      6,
    )
  addList(
    'familia_olfativa',
    OLFACTORY_FAMILIES.map((family) => family.label),
    7,
    {
      title: 'Familias olfativas',
      message:
        'Elige una familia. Para varias, escribe sus nombres separados por comas (Amaderada, Fresca). El desplegable sustituye el valor anterior.',
    },
  )
  const sample: Partial<Record<ImportColumn, string | number>> = {
    slug: 'bosque-de-ejemplo',
    tipo_producto: 'perfume',
    nombre: 'Bosque de Ejemplo',
    marca:
      brands.find((brand) => brand.active)?.name ??
      brands[0]?.name ??
      'Registra primero tu marca',
    genero: 'unisex',
    familia: 'Amaderada · fresca',
    familia_olfativa: 'Amaderada, Fresca',
    descripcion:
      'Una fragancia con salida cítrica, corazón de cedro y fondo de vetiver.',
    resumen: 'Fresca al inicio, cálida al final.',
    notas_salida: 'Bergamota, Enebro',
    notas_corazon: 'Cedro, Té blanco',
    notas_fondo: 'Vetiver, Almizcle',
    intensidad: 'Moderada',
    ocasion: 'Diario',
    temporada: 'Todo el año',
    umbral_stock: 2,
    descuento_tipo: 'percentage',
    descuento_valor: 10,
    descuento_activo: 'sí',
  }
  const addExample = (
    values: Partial<Record<ImportColumn, string | number>>,
  ) => {
    const row = example.addRow(
      templateColumns.map((column) => values[column] ?? ''),
    )
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE8EFED' },
    }
    row.alignment = { vertical: 'top', wrapText: true }
    row.height = 48
  }
  addExample({
    ...sample,
    tamano_ml: 50,
    precio_soles: 159.9,
    stock: 8,
    sku: 'BOSQUE-050',
  })
  addExample({
    ...sample,
    tamano_ml: 100,
    precio_soles: 199,
    stock: 3,
    sku: 'BOSQUE-100',
  })
  if (features.complementsEnabled)
    addExample({
      slug: 'estuche-de-viaje-ejemplo',
      tipo_producto: 'complemento',
      nombre: 'Estuche de Viaje de Ejemplo',
      descripcion: 'Estuche protector para llevar tu fragancia de viaje.',
      presentacion: 'Negro',
      precio_soles: 49.9,
      stock: 15,
      sku: 'ESTUCHE-NEGRO',
      umbral_stock: 3,
      descuento_tipo: 'fixed',
      descuento_valor: 5,
      descuento_activo: 'sí',
    })
  guide.addRows([
    [
      `Completa solo la hoja Productos. Ejemplo muestra un perfume con dos presentaciones${features.complementsEnabled ? ' y un complemento' : ''}; esas filas no se importan.`,
    ],
    [
      'Flujo',
      'Completa Productos, guarda el archivo .xlsx, súbelo al panel, revisa las filas y confirma los productos correctos.',
    ],
    [
      'Borradores',
      'Todos se guardan como borradores pendientes de fotografías. Después abre Productos > Editar, sube las fotos desde tu computadora y publica el producto.',
    ],
    [
      'Una fila por presentación',
      `Repite los mismos datos del producto en sus filas; cambia únicamente tamano_ml${features.complementsEnabled ? ' o presentacion' : ''}, sku, precio_soles y stock. Si una presentación tiene errores, se excluye todo ese producto.`,
    ],
    ['Obligatorias siempre', REQUIRED_COLUMNS.join(', ')],
    ...(features.complementsEnabled
      ? [
          [
            'tipo_producto',
            `${PRODUCT_TYPES.map((type) => type.value).join(' o ')}. Si se omite, se considera perfume.`,
          ],
        ]
      : []),
    [
      'Perfumes',
      'También requieren marca, genero, familia (perfil aromático breve) y tamano_ml (entero de 1 a 1000).',
    ],
    ...(features.complementsEnabled
      ? [
          [
            'Complementos',
            'Marca opcional. Deja tamano_ml y características olfativas vacíos. Usa presentacion (Unidad, Negro, etc.); si se omite: Unidad.',
          ],
        ]
      : []),
    [
      'slug',
      'Opcional. Identificador estable del producto con letras minúsculas, números y guiones. Si lo dejas vacío, se genera a partir del nombre. Repite el mismo slug en todas sus presentaciones.',
    ],
    [
      'sku',
      'Opcional: puedes dejarlo vacío; el sistema crea identificadores internos, pero no inventa un SKU comercial. Si lo utilizas, debe ser único por presentación, hasta 64 letras, números, puntos, guiones o guiones bajos. No distingue mayúsculas y minúsculas.',
    ],
    [
      'Duplicados',
      'Se comprueban slug, marca y nombre, presentaciones y SKU del archivo y del catálogo. No se sobrescriben productos existentes.',
    ],
    [
      'marca',
      `Nombre o ID de una marca registrada: ${brands.map((brand) => brand.name).join(', ') || 'Registra las marcas en el panel antes de importar perfumes.'}`,
    ],
    ['genero', 'hombre, mujer o unisex.'],
    [
      'familia',
      'Perfil breve para la tarjeta del perfume; ejemplo: Amaderada · fresca.',
    ],
    [
      'familia_olfativa',
      `Opcional para filtros de Tienda. El desplegable elige una; para varias, escribe sus nombres separados por comas: ${OLFACTORY_FAMILIES.map((family) => family.label).join(', ')}. No acumula selecciones. Si no están confirmadas, deja vacío. Deben coincidir con el perfil breve.`,
    ],
    [
      'precio_soles',
      'Precio original positivo en soles, con máximo dos decimales. Ejemplo: 159.90. Sin símbolo de moneda ni separador de miles.',
    ],
    [
      'stock / umbral_stock',
      'Enteros no negativos hasta 1000000. umbral_stock es opcional; por defecto: 2.',
    ],
    [
      'descuento_tipo',
      'Opcional: percentage para porcentaje o fixed para importe en soles. El descuento es del producto completo; repite sus datos en todas las presentaciones.',
    ],
    [
      'descuento_valor',
      'percentage: entero entre 1 y 99. fixed: soles positivos con máximo dos decimales. Debe dejar un precio final mayor que cero en todas las presentaciones.',
    ],
    [
      'descuento_activo',
      'sí o no. Por defecto: sí cuando se ha indicado un descuento. Este campo solo activa la oferta; el producto continúa como borrador.',
    ],
    [
      'descuento_inicio / descuento_fin',
      'Opcionales. Fecha ISO con zona horaria (2027-01-01T00:00:00Z) o AAAA-MM-DD (medianoche UTC). Vacío significa sin límite. La fecha final debe ser posterior al inicio.',
    ],
    [
      'notas_salida / notas_corazon / notas_fondo',
      'Opcionales para perfumes. Separa varias notas con comas.',
    ],
    ['intensidad', 'Suave, Moderada o Intensa. Si se omite: Moderada.'],
    [
      'Desplegables',
      `Marca, género, ${features.complementsEnabled ? 'tipo de producto, ' : ''}intensidad y descuentos utilizan listas. Familia olfativa ofrece sugerencias sin bloquear valores compatibles. Ocasión, temporada, perfil breve${features.complementsEnabled ? ', notas y presentación' : ' y notas'} son texto libre.`,
    ],
    ['Otros opcionales', 'resumen, ocasion y temporada.'],
    [
      'Formato y límite',
      'Hasta 1000 filas y 5 MB por archivo .xlsx. Usa texto y números; no se admiten fórmulas. Conserva los nombres de las columnas.',
    ],
  ])
  guide.getColumn(1).width = 38
  guide.getColumn(2).width = 110
  guide.mergeCells('A1:B1')
  guide.getRow(1).font = { bold: true, size: 12, color: { argb: 'FF29453D' } }
  guide.eachRow((row, index) => {
    row.alignment = { vertical: 'top', wrapText: true }
    row.height = index === 1 ? 52 : 48
    if (index > 1) row.getCell(1).font = { bold: true }
  })
  guide.views = [{ state: 'frozen', ySplit: 1 }]
  return workbook
}

export async function downloadProductTemplate(
  brands: readonly AdminBrand[],
  features = getStoreFeatures(),
) {
  const workbook = await createProductTemplateWorkbook(brands, features)
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
