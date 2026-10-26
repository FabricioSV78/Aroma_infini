import { expect, test } from '@playwright/test'
import { isProductSku, planProductSkus } from '../src/domain/product-identity'
import { importFile, importRecord } from './product-import-fixtures'

test('Los SKU de producto empiezan en 10000 y conservan códigos válidos al migrar', () => {
  expect(planProductSkus([{}, {}, {}])).toEqual({
    skus: ['10000', '10001', '10002'],
    nextProductSku: 10003,
  })
  expect(
    planProductSkus([
      { sku: '10007' },
      { sku: '10007' },
      { sku: 'LEGACY-50' },
      { sku: '10001' },
    ]),
  ).toEqual({
    skus: ['10007', '10008', '10009', '10001'],
    nextProductSku: 10010,
  })
  expect(planProductSkus([{ sku: '10000' }, {}], 10080)).toEqual({
    skus: ['10000', '10080'],
    nextProductSku: 10081,
  })
  expect(isProductSku('09999')).toBe(false)
  expect(isProductSku('100000')).toBe(false)
  expect(isProductSku('99999')).toBe(true)
  expect(planProductSkus([{ sku: '99999' }, {}])).toBeNull()
})

for (const count of [10, 50, 100]) {
  test(`Excel de ${count} productos asigna un SKU automático único por producto y conserva sus presentaciones`, async ({
    page,
  }) => {
    const rows = Array.from({ length: count }, (_, index) =>
      [50, 100].map((ml) =>
        importRecord({
          slug: `sku-import-${count}-${index}`,
          nombre: `Perfume SKU ${count} ${index}`,
          tamano_ml: ml,
          sku: `VAR-${count}-${index}-${ml}`,
          precio_soles: ml === 50 ? '159.90' : '249.90',
          stock: index + 1,
        }),
      ),
    ).flat()
    const file = await importFile(rows)
    await page.goto('/admin/productos')
    const result = await page.evaluate(
      async ({ bytes, count }) => {
        const servicePath = '/src/services/admin-service.ts'
        const importPath = '/src/features/admin/product-import-excel.ts'
        const { adminService, hydrateAdminStore, getStoreProducts } =
          (await import(
            servicePath
          )) as typeof import('../src/services/admin-service')
        const { parseProductImport } = (await import(
          importPath
        )) as typeof import('../src/features/admin/product-import-excel')
        await hydrateAdminStore()
        const before = structuredClone(adminService.getSnapshot())
        const preview = await parseProductImport(
          new File([new Uint8Array(bytes)], 'productos.xlsx'),
          before.brands,
          before.products,
        )
        const saved = adminService.saveProductsBatch(
          preview.products,
          before.revision,
        )
        await adminService.flush()
        const after = adminService.getSnapshot()
        const added = after.products.slice(before.products.length)
        return {
          count,
          saved,
          valid: preview.validProductCount,
          added,
          beforeProducts: before.products,
          preservedProducts: after.products.slice(0, before.products.length),
          allSkus: after.products.map((item) => item.product.sku),
          revisionDelta: after.revision - before.revision,
          newVisible: getStoreProducts().filter((product) =>
            product.slug.startsWith('sku-import-'),
          ).length,
        }
      },
      { bytes: Array.from(file.buffer), count },
    )
    expect(result.saved.kind).toBe('saved')
    expect(result.valid).toBe(count)
    expect(result.added).toHaveLength(count)
    expect(new Set(result.allSkus).size).toBe(result.allSkus.length)
    expect(result.allSkus.every((sku) => isProductSku(sku))).toBe(true)
    expect(result.revisionDelta).toBe(1)
    expect(result.newVisible).toBe(0)
    expect(result.preservedProducts).toEqual(result.beforeProducts)
    for (const [index, record] of result.added.entries()) {
      expect(record.active).toBe(false)
      expect(record.product.image).toBe('')
      expect(record.detail.gallery).toEqual([])
      expect(record.detail.olfactoryImage).toBeNull()
      expect(record.product.variants.map((variant) => variant.sku)).toEqual([
        `VAR-${count}-${index}-50`,
        `VAR-${count}-${index}-100`,
      ])
      expect(record.product.variants.map((variant) => variant.stock)).toEqual([
        index + 1,
        index + 1,
      ])
    }
    await page.reload()
    const reloaded = await page.evaluate(async () => {
      const path = '/src/services/admin-service.ts'
      const { adminService, hydrateAdminStore } = (await import(
        path
      )) as typeof import('../src/services/admin-service')
      await hydrateAdminStore()
      return adminService
        .getSnapshot()
        .products.map((record) => record.product.sku)
    })
    expect(reloaded).toEqual(result.allSkus)
  })
}

test('Crear y editar conserva el SKU automático y no consume códigos si falla la validación', async ({
  page,
}) => {
  await page.goto('/admin/productos')
  const result = await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    await hydrateAdminStore()
    const before = structuredClone(adminService.getSnapshot())
    const draft = structuredClone(before.products[0])
    draft.product.id = 'new-numeric-sku'
    draft.product.slug = 'nuevo-codigo-automatico'
    draft.product.name = 'Nuevo código automático'
    draft.product.sku = '77777'
    draft.detail.recommendationIds = []
    draft.product.variants = draft.product.variants.map((variant, index) => ({
      ...variant,
      id: `new-numeric-sku-${index}`,
      sku: `PRESENTACION-${index}`,
    }))
    const invalid = structuredClone(draft)
    invalid.product.name = ''
    const failure = adminService.saveProduct(invalid)
    const nextAfterFailure = adminService.getSnapshot().nextProductSku
    const first = adminService.saveProduct(draft)
    const created = structuredClone(adminService.getSnapshot().products.at(-1)!)
    created.product.name = 'Nombre corregido'
    created.product.sku = '55555'
    const edit = adminService.saveProduct(created)
    const saved = adminService.getSnapshot().products.at(-1)!
    await adminService.flush()
    return {
      failure,
      nextBefore: before.nextProductSku,
      nextAfterFailure,
      first,
      edit,
      createdSku: adminService.getSnapshot().products.at(-1)!.product.sku,
      expectedSku: String(before.nextProductSku),
      variants: saved.product.variants,
      beforeVariants: draft.product.variants,
      name: saved.product.name,
      nextAfter: adminService.getSnapshot().nextProductSku,
    }
  })
  expect(result.failure.kind).toBe('validation')
  expect(result.nextAfterFailure).toBe(result.nextBefore)
  expect(result.first).toEqual({ kind: 'saved' })
  expect(result.edit.kind).toBe('saved')
  expect(result.createdSku).toBe(result.expectedSku)
  expect(result.variants).toEqual(result.beforeVariants)
  expect(result.name).toBe('Nombre corregido')
  expect(result.nextAfter).toBe(result.nextBefore! + 1)
})

test('La migración local repara SKU ausentes o duplicados una vez y persiste sin alterar variantes', async ({
  page,
}) => {
  await page.goto('/admin/productos')
  const legacy = await page.evaluate(async () => {
    const servicePath = '/src/services/admin-service.ts'
    const repositoryPath = '/src/services/admin-persistence.ts'
    const { adminService, hydrateAdminStore } = (await import(
      servicePath
    )) as typeof import('../src/services/admin-service')
    const { localAdminStateRepository } = (await import(
      repositoryPath
    )) as typeof import('../src/services/admin-persistence')
    await hydrateAdminStore()
    await adminService.flush()
    const snapshot = structuredClone(adminService.getSnapshot())
    snapshot.nextProductSku = 10100
    snapshot.products[0].product.sku = '10007'
    snapshot.products[1].product.sku = '10007'
    delete snapshot.products[2].product.sku
    snapshot.products[3].product.sku = 'ANTIGUO'
    await localAdminStateRepository.write(snapshot)
    return snapshot.products.map((item) => item.product.variants)
  })
  await page.reload()
  const repaired = await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    await hydrateAdminStore()
    await adminService.flush()
    return structuredClone(adminService.getSnapshot())
  })
  expect(repaired.products[0].product.sku).toBe('10007')
  expect(repaired.products[1].product.sku).toBe('10100')
  expect(repaired.products[2].product.sku).toBe('10101')
  expect(repaired.products[3].product.sku).toBe('10102')
  expect(new Set(repaired.products.map((item) => item.product.sku)).size).toBe(
    repaired.products.length,
  )
  expect(repaired.products.map((item) => item.product.variants)).toEqual(legacy)
  await page.reload()
  const second = await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    await hydrateAdminStore()
    return structuredClone(adminService.getSnapshot())
  })
  expect(second).toEqual(repaired)
})
