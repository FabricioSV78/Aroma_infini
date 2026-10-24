import { expectImportSuccess } from './admin-notice-fixtures'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import {
  importFile,
  importRecord,
  importViewports,
  openImport,
  persistedAdminState,
  reviewFile,
  type ImportRecord,
} from './product-import-fixtures'

const output = 'artifacts/importacion-excel'

function massRecords(count: number) {
  const records: ImportRecord[] = []
  for (let product = 0; product < count; product++) {
    const complement = product % 4 === 1
    for (let variant = 0; variant < 2; variant++) {
      const price = (10000 + product * 100 + variant * 2500 + 99) / 100
      const record = importRecord({
        slug: `masa-${count}-${product}`,
        nombre: `Masa ${count} Producto ${product}`,
        sku: `MASA-${count}-${product}-${variant}`,
        stock: product * 3 + variant + 1,
        precio_soles: variant
          ? price.toFixed(2).replace('.', ',')
          : price.toFixed(2),
        tamano_ml: complement ? '' : variant ? 100 : 50,
        tipo_producto: complement ? 'complemento' : 'perfume',
        marca: complement ? '' : 'Atelier 01',
        genero: complement ? '' : 'unisex',
        familia: complement ? '' : 'Amaderada',
        familia_olfativa: complement ? '' : 'Amaderada, Fresca',
        notas_salida: complement ? '' : 'Bergamota, Enebro',
        notas_corazon: complement ? '' : 'Cedro',
        notas_fondo: complement ? '' : 'Vetiver',
        intensidad: complement ? '' : 'Moderada',
        ocasion: complement ? '' : 'Diario',
        temporada: complement ? '' : 'Todo el año',
        presentacion: complement ? (variant ? 'Estuche' : 'Unidad') : '',
        umbral_stock: 3,
        ...(product % 3 === 0
          ? {
              descuento_tipo: 'percentage',
              descuento_valor: '10',
              descuento_activo: 'sí',
              descuento_inicio: '2020-01-01T00:00:00Z',
              descuento_fin: '2100-01-01T00:00:00Z',
            }
          : product % 3 === 1
            ? {
                descuento_tipo: 'fixed',
                descuento_valor: '5.25',
                descuento_activo: 'no',
              }
            : {}),
      })
      if (product === count - 6 && variant === 1) record.descripcion = ''
      if (product === count - 5 && variant === 1) record.precio_soles = '99.999'
      if ([count - 4, count - 3].includes(product) && variant === 0)
        record.sku = `SKU-REPETIDO-${count}`
      if (product === count - 2) record.marca = 'Marca Inexistente de Prueba'
      if (product === count - 1) record.slug = 'bois-clair'
      records.push(record)
    }
  }
  return records
}

for (const count of [10, 50, 100, 300]) {
  test(`Excel real de ${count} productos valida grupos completos y conserva variantes, descuentos e inventario al repetir`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000)
    const browserErrors: string[] = []
    page.on('pageerror', (error) => browserErrors.push(error.message))
    await mkdir(output, { recursive: true })
    const records = massRecords(count)
    const file = await importFile(records, undefined, `productos-${count}.xlsx`)
    await writeFile(`${output}/productos-${count}.xlsx`, file.buffer)
    await openImport(page)
    const started = performance.now()
    const dialog = await reviewFile(page, file)
    const validationMs = Math.round(performance.now() - started)
    const valid = count - 6
    await expect(dialog).toContainText(`${valid} productos`)
    await expect(dialog).toContainText(`${valid * 2} filas correctas`)
    await expect(dialog).toContainText('12 filas con errores')
    await expect(
      dialog.locator('.admin-product-import__rows > li'),
    ).toHaveCount(Math.min(25, count * 2))
    if (count * 2 > 25) {
      const pages = dialog.getByRole('navigation', {
        name: 'Páginas de la vista previa',
      })
      await pages
        .getByRole('button', { name: 'Siguiente', exact: true })
        .click()
      await expect(
        dialog.locator('.admin-product-import__rows > li').first(),
      ).toContainText('Fila 27')
      await pages.getByRole('button', { name: 'Anterior', exact: true }).click()
      await expect(
        dialog.locator('.admin-product-import__rows > li').first(),
      ).toContainText('Fila 2')
    }
    await dialog
      .getByRole('button', { name: 'Con errores (12)', exact: true })
      .click()
    await expect(
      dialog.locator('.admin-product-import__rows > li'),
    ).toHaveCount(12)
    const rejectionMessages = await dialog
      .locator('.admin-product-import__rows > li')
      .allTextContents()
    expect(rejectionMessages.join(' ')).toContain('Falta descripcion')
    expect(rejectionMessages.join(' ')).toContain(
      'Precio: indica soles positivos',
    )
    expect(rejectionMessages.join(' ')).toContain('SKU')
    expect(rejectionMessages.join(' ')).toContain('La marca no existe')
    expect(rejectionMessages.join(' ')).toContain('slug ya existe')
    expect(rejectionMessages.every((text) => /Fila \d+/.test(text))).toBe(true)
    await dialog
      .getByRole('button', { name: `Correctas (${valid * 2})`, exact: true })
      .click()
    const confirming = performance.now()
    await dialog
      .getByRole('button', {
        name: `Confirmar e importar ${valid} productos`,
        exact: true,
      })
      .click()
    await expectImportSuccess(page, `${valid} productos importados`)
    const importMs = Math.round(performance.now() - confirming)
    const snapshot = await persistedAdminState(page)
    const imported = snapshot.products.filter((record) =>
      record.product.slug.startsWith(`masa-${count}-`),
    )
    expect(imported).toHaveLength(valid)
    const unchangedCatalog = snapshot.products.filter(
      (record) => !record.product.slug.startsWith(`masa-${count}-`),
    )
    let variantCount = 0
    let totalStock = 0
    let discounts = 0
    let complements = 0
    for (let index = 0; index < valid; index++) {
      const record = imported.find(
        (item) => item.product.slug === `masa-${count}-${index}`,
      )!
      expect(record.active).toBe(false)
      expect(record.product.image).toBe('')
      expect(record.detail.gallery).toEqual([])
      expect(record.detail.olfactoryImage).toBeNull()
      expect(record.lowStockThreshold).toBe(3)
      expect(record.product.variants).toHaveLength(2)
      for (let variant = 0; variant < 2; variant++) {
        const actual = record.product.variants[variant]
        expect(actual.stock).toBe(index * 3 + variant + 1)
        expect(actual.priceCents).toBe(
          10000 + index * 100 + variant * 2500 + 99,
        )
        expect(actual.sku?.toUpperCase()).toBe(
          `MASA-${count}-${index}-${variant}`,
        )
        expect(actual.active).toBe(true)
        expect(actual.ml).toBe(index % 4 === 1 ? null : variant ? 100 : 50)
        totalStock += actual.stock
        variantCount++
      }
      if (index % 4 === 1) {
        complements++
        expect(record.gender).toBeNull()
        expect(record.product.family).toBe('')
        expect(record.product.olfactoryFamilies).toEqual([])
        expect(record.detail.notes).toEqual({ top: [], heart: [], base: [] })
        expect(record.product.variants.map((variant) => variant.label)).toEqual(
          ['Unidad', 'Estuche'],
        )
      }
      if (index % 3 === 0) {
        discounts++
        expect(record.product.discount).toEqual({
          type: 'percent',
          value: 10,
          active: true,
          startsAt: '2020-01-01T00:00:00.000Z',
          endsAt: '2100-01-01T00:00:00.000Z',
        })
      } else if (index % 3 === 1) {
        discounts++
        expect(record.product.discount).toEqual({
          type: 'fixed',
          value: 525,
          active: false,
          startsAt: '',
          endsAt: '',
        })
      } else expect(record.product.discount ?? null).toBeNull()
    }
    const expectedStock = Array.from(
      { length: valid },
      (_, index) => index * 6 + 3,
    ).reduce((sum, stock) => sum + stock, 0)
    expect(totalStock).toBe(expectedStock)
    expect(
      new Set(
        imported.flatMap((record) =>
          record.product.variants.map((variant) => variant.id),
        ),
      ).size,
    ).toBe(valid * 2)
    // Reload exercises persisted hydration before duplicate detection.
    await page.reload()
    await page
      .getByText('Importar productos con Excel', { exact: true })
      .click()
    const retryStarted = performance.now()
    const retry = await reviewFile(page, file)
    const retryValidationMs = Math.round(performance.now() - retryStarted)
    await expect(
      retry.getByRole('button', {
        name: 'Confirmar e importar 0 productos',
        exact: true,
      }),
    ).toBeDisabled()
    await expect(retry).toContainText(`${count * 2} filas con errores`)
    const afterRetry = await persistedAdminState(page)
    expect(afterRetry.products).toEqual(snapshot.products)
    expect(
      afterRetry.products.filter(
        (record) => !record.product.slug.startsWith(`masa-${count}-`),
      ),
    ).toEqual(unchangedCatalog)
    await retry.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await page.goto(`/tienda?q=Masa%20${count}%20Producto`)
    await expect(
      page.locator('.product-card', { hasText: `Masa ${count} Producto` }),
    ).toHaveCount(0)
    await page.goto(`/producto/masa-${count}-0`)
    await expect(
      page.getByRole('heading', {
        name: `Masa ${count} Producto 0`,
        exact: true,
      }),
    ).toHaveCount(0)
    expect(browserErrors).toEqual([])
    const report = {
      status: 'passed',
      environment:
        'localhost; isolated Playwright browser context; browser IndexedDB demo only',
      candidateProducts: count,
      spreadsheetRows: count * 2,
      validProductsImported: valid,
      invalidProductsRejected: 6,
      invalidRowsRejected: 12,
      variantsImported: variantCount,
      totalImportedStock: totalStock,
      complementsImported: complements,
      discountsImported: discounts,
      validationMs,
      importMs,
      retryValidationMs,
      xlsxBytes: file.buffer.byteLength,
      reimportAddedProducts: 0,
      overwrittenProducts: 0,
      publicDraftProducts: 0,
      partialProductsImported: 0,
      runtimeErrors: browserErrors,
      rejectionMessages,
    }
    await writeFile(
      `${output}/resultado-${count}.json`,
      JSON.stringify(report, null, 2),
    )
    await testInfo.attach(`resultado-${count}`, {
      body: JSON.stringify(report, null, 2),
      contentType: 'application/json',
    })
  })
}

test('un archivo limpio registra 100 productos y 200 presentaciones en una sola confirmación', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await mkdir(output, { recursive: true })
  const records = massRecords(106).slice(0, 200)
  const file = await importFile(
    records,
    undefined,
    'productos-100-validos.xlsx',
  )
  await writeFile(`${output}/productos-100-validos.xlsx`, file.buffer)
  await openImport(page)
  const started = performance.now()
  const preview = await reviewFile(page, file)
  const validationMs = Math.round(performance.now() - started)
  await expect(preview).toContainText('100 productos')
  await expect(preview).toContainText('200 filas correctas')
  await expect(preview).toContainText('0 filas con errores')
  const confirming = performance.now()
  await preview
    .getByRole('button', {
      name: 'Confirmar e importar 100 productos',
      exact: true,
    })
    .click()
  await expectImportSuccess(page, '100 productos importados')
  const importMs = Math.round(performance.now() - confirming)
  const snapshot = await persistedAdminState(page)
  const imported = snapshot.products.filter((record) =>
    record.product.slug.startsWith('masa-106-'),
  )
  expect(imported).toHaveLength(100)
  expect(imported.flatMap((record) => record.product.variants)).toHaveLength(
    200,
  )
  expect(
    imported.every(
      (record) =>
        !record.active &&
        !record.product.image &&
        record.detail.gallery.length === 0,
    ),
  ).toBe(true)
  await writeFile(
    `${output}/resultado-100-validos.json`,
    JSON.stringify(
      {
        status: 'passed',
        candidateProducts: 100,
        spreadsheetRows: 200,
        validProductsImported: 100,
        variantsImported: 200,
        invalidProductsRejected: 0,
        validationMs,
        importMs,
      },
      null,
      2,
    ),
  )
})

test('la revisión masiva es legible, navegable con teclado y no desborda en cuatro tamaños', async ({
  page,
}) => {
  test.setTimeout(60_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openImport(page)
  const file = await importFile(massRecords(50))
  const preview = await reviewFile(page, file)
  for (const viewport of importViewports) {
    await page.setViewportSize(viewport)
    await expect(preview).toBeVisible()
    const bounds = await preview.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: innerWidth,
        height: innerHeight,
        pageWidth: document.documentElement.scrollWidth,
      }
    })
    expect(bounds.left).toBeGreaterThanOrEqual(0)
    expect(bounds.right).toBeLessThanOrEqual(bounds.width + 1)
    expect(bounds.top).toBeGreaterThanOrEqual(0)
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.height + 1)
    expect(bounds.pageWidth).toBeLessThanOrEqual(bounds.width + 1)
    const focused = preview.getByRole('button', {
      name: 'Con errores (12)',
      exact: true,
    })
    await focused.focus()
    await focused.press('Enter')
    await expect(
      preview.locator('.admin-product-import__rows > li'),
    ).toHaveCount(12)
    await page.screenshot({
      path: `${output}/revision-${viewport.name}.png`,
      animations: 'disabled',
    })
    await preview
      .getByRole('button', { name: 'Todas (100)', exact: true })
      .click()
  }
  await page.keyboard.press('Escape')
  await expect(preview).not.toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Revisar filas y confirmar' }),
  ).toBeFocused()
})

test.afterAll(async () => {
  const reports = await Promise.all(
    [10, 50, 100, 300].map(async (count) => {
      try {
        return JSON.parse(
          await readFile(`${output}/resultado-${count}.json`, 'utf8'),
        )
      } catch {
        return null
      }
    }),
  )
  if (reports.every(Boolean)) {
    await writeFile(
      `${output}/resultados-masivos.json`,
      JSON.stringify(reports, null, 2),
    )
    await writeFile(
      `${output}/resultados-masivos.md`,
      [
        '# Pruebas masivas de importación Excel',
        '',
        'Entorno: localhost con un contexto de navegador nuevo por prueba e IndexedDB de demostración. No se usaron APIs ni inventario de producción.',
        '',
        'Cada archivo contiene exactamente el número indicado de productos candidatos, con dos presentaciones por producto. Seis productos contienen errores intencionales: datos incompletos, precio inválido, dos productos con SKU repetido, marca inexistente y slug ya existente. Se rechazan todas las presentaciones de esos productos.',
        '',
        '| Productos candidatos | Filas | Importados | Rechazados | Variantes importadas | Unidades | Validación (ms) | Importación y persistencia (ms) | Revalidación (ms) |',
        '| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
        ...reports.map(
          (report) =>
            `| ${report.candidateProducts} | ${report.spreadsheetRows} | ${report.validProductsImported} | ${report.invalidProductsRejected} | ${report.variantsImported} | ${report.totalImportedStock} | ${report.validationMs} | ${report.importMs} | ${report.retryValidationMs} |`,
        ),
        '',
        'Verificado: precios exactos en céntimos, stock por presentación, SKU, descuentos porcentuales y fijos con fechas y estado, complementos sin datos olfativos, agrupación sin productos parciales, reimportación bloqueada sin duplicación ni sobrescritura, borradores ausentes de Tienda y ficha pública y cero errores JavaScript.',
        '',
        'Los tiempos son mediciones reales de Playwright en este equipo, desde subir el archivo hasta abrir la vista previa y desde confirmar hasta finalizar la persistencia. Incluyen el coste de automatización y no constituyen un benchmark de producción.',
        '',
      ].join('\n'),
    )
  }
})
