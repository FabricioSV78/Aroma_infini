import { expect, test } from './test'
import {
  planVariantSkus,
  variantSkuSummary,
} from '../src/domain/product-identity'
import { importFile, importRecord } from './product-import-fixtures'

test('presentation SKUs start at 1000 and reserve every manual SKU before filling blanks', () => {
  expect(planVariantSkus([{ id: 'a' }, { id: 'b' }], [])).toEqual({
    skus: ['1000', '1001'],
    nextVariantSku: 1002,
  })
  expect(planVariantSkus([{ id: 'a' }, { id: 'b', sku: '1000' }], [])).toEqual({
    skus: ['1001', '1000'],
    nextVariantSku: 1002,
  })
  expect(
    planVariantSkus([{ id: 'new' }], [{ id: 'existing', sku: '1000' }]),
  ).toEqual({
    skus: ['1001'],
    nextVariantSku: 1002,
  })
})

test('editing with an omitted SKU preserves the same presentation identifier', () => {
  expect(
    planVariantSkus(
      [{ id: 'old', sku: '' }, { id: 'new' }],
      [{ id: 'old', sku: '1000' }],
      1001,
    ),
  ).toEqual({
    skus: ['1000', '1001'],
    nextVariantSku: 1002,
  })
})

test('manual alphanumeric SKUs are preserved, and a distant manual number does not move the automatic start', () => {
  const variants = [
    { id: 'a', sku: '  brand-100  ' },
    { id: 'b', sku: '9000' },
    { id: 'c' },
  ]
  const before = structuredClone(variants)
  expect(planVariantSkus(variants, [])).toEqual({
    skus: ['BRAND-100', '9000', '1000'],
    nextVariantSku: 1001,
  })
  expect(variants).toEqual(before)
})

test('duplicate manual and preserved SKUs cannot overwrite another presentation', () => {
  expect(
    planVariantSkus(
      [{ id: 'new', sku: '1000' }],
      [{ id: 'other', sku: '1000' }],
    ),
  ).toBeNull()
  expect(
    planVariantSkus(
      [
        { id: 'a', sku: 'x' },
        { id: 'b', sku: ' X ' },
      ],
      [],
    ),
  ).toBeNull()
  expect(
    planVariantSkus(
      [
        { id: 'a', sku: '' },
        { id: 'b', sku: '1000' },
      ],
      [{ id: 'a', sku: '1000' }],
    ),
  ).toBeNull()
})

test('the persisted presentation counter does not reuse automatically issued SKUs after deletion', () => {
  expect(planVariantSkus([{ id: 'next' }], [], 1005)).toEqual({
    skus: ['1005'],
    nextVariantSku: 1006,
  })
  expect(
    planVariantSkus(
      [{ id: 'next' }],
      [{ id: 'manual', sku: String(Number.MAX_SAFE_INTEGER + 1) }],
      Number.MAX_SAFE_INTEGER,
    ),
  ).toBeNull()
})

test('commercial labels use presentation SKUs, never the internal product code', () => {
  expect(variantSkuSummary([{ sku: '1000' }])).toBe('SKU 1000')
  expect(
    variantSkuSummary([{ sku: '1000' }, { sku: '1001' }, { sku: '1002' }]),
  ).toBe('SKU 1000, 1001 +1')
  expect(variantSkuSummary([{}])).toBe('SKU pendiente')
})

test('manual 1000 and automatic 1001 persist through editing, photos and reload', async ({
  page,
}) => {
  await page.goto('/admin/productos')
  const created = await page.evaluate(async () => {
    const source = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = (await import(
      source
    )) as typeof import('../src/services/admin-service')
    await hydrateAdminStore()
    const record = structuredClone(adminService.getSnapshot().products[0])
    record.product.id = 'presentation-sku-ui'
    record.product.name = 'Prueba de SKU por presentación'
    record.product.slug = 'prueba-sku-presentacion'
    record.active = false
    record.detail.recommendationIds = []
    const base = record.product.variants[0]
    record.product.variants = [
      { ...base, id: 'sku-ui-50', ml: 50, sku: '1000' },
      { ...base, id: 'sku-ui-100', ml: 100, sku: undefined },
    ]
    const saved = adminService.saveProduct(record)
    await adminService.flush()
    const confirmed = adminService
      .getSnapshot()
      .products.find((item) => item.product.id === record.product.id)!
    return { saved, record: confirmed }
  })
  expect(created.saved.kind).toBe('saved')
  expect(created.record.product.variants.map((variant) => variant.sku)).toEqual(
    ['1000', '1001'],
  )
  await page.reload()
  const row = page
    .getByRole('row')
    .filter({ hasText: 'Prueba de SKU por presentación' })
  await expect(row).toContainText('SKU 1000, 1001')
  await expect(row).not.toContainText(`SKU ${created.record.product.sku}`)
  await page.goto('/admin/productos/presentation-sku-ui')
  await expect(
    page.getByLabel('SKU de presentación 50 ml', { exact: true }),
  ).toHaveValue('1000')
  await page.getByLabel('SKU de presentación 100 ml', { exact: true }).fill('')
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect(page).toHaveURL(/\/admin\/productos/)
  await page.goto('/admin/productos/presentation-sku-ui/fotos')
  await expect(page.locator('.admin-page-heading')).toContainText(
    'SKU 1000, 1001',
  )
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.screenshot({
    path: 'artifacts/sku-audit-2026-10-29/photos-laptop.png',
    fullPage: true,
  })
  await page.reload()
  const skus = await page.evaluate(async () => {
    const source = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = (await import(
      source
    )) as typeof import('../src/services/admin-service')
    await hydrateAdminStore()
    return adminService
      .getSnapshot()
      .products.find((item) => item.product.id === 'presentation-sku-ui')!
      .product.variants.map((v) => v.sku)
  })
  expect(skus).toEqual(['1000', '1001'])
})

test('Excel allocates empty presentation SKUs after reserving manual values across the complete batch', async ({
  page,
}) => {
  const file = await importFile([
    importRecord({
      slug: 'sku-excel-a',
      nombre: 'SKU Excel A',
      tamano_ml: 50,
      sku: '',
    }),
    importRecord({
      slug: 'sku-excel-a',
      nombre: 'SKU Excel A',
      tamano_ml: 100,
      sku: '1000',
    }),
    importRecord({
      slug: 'sku-excel-b',
      nombre: 'SKU Excel B',
      tamano_ml: 100,
      sku: '',
    }),
  ])
  await page.goto('/admin/productos')
  const result = await page.evaluate(async (bytes) => {
    const service = '/src/services/admin-service.ts',
      importer = '/src/features/admin/product-import-excel.ts'
    const { adminService, hydrateAdminStore } = (await import(
      service
    )) as typeof import('../src/services/admin-service')
    const { parseProductImport } = (await import(
      importer
    )) as typeof import('../src/features/admin/product-import-excel')
    await hydrateAdminStore()
    const snapshot = adminService.getSnapshot()
    const preview = await parseProductImport(
      new File([new Uint8Array(bytes)], 'sku.xlsx'),
      snapshot.brands,
      snapshot.products,
    )
    const saved = adminService.saveProductsBatch(
      preview.products,
      snapshot.revision,
    )
    await adminService.flush()
    return {
      saved,
      records: adminService
        .getSnapshot()
        .products.filter((item) => item.product.slug.startsWith('sku-excel-')),
    }
  }, Array.from(file.buffer))
  expect(result.saved.kind).toBe('saved')
  expect(
    result.records.flatMap((item) => item.product.variants.map((v) => v.sku)),
  ).toEqual(['1001', '1000', '1002'])
})
