import { expect, test, type Page } from '@playwright/test'
import type { AdminState } from '../src/services/admin-service'

async function snapshot(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    await hydrateAdminStore()
    await adminService.flush()
    return adminService.getSnapshot()
  })
}

function unchangedSettings(state: AdminState) {
  return {
    brands: state.brands,
    orders: state.orders,
    orderHistory: state.orderHistory,
    customers: state.customers,
    promotions: state.promotions,
    shipping: state.shipping,
    homeMedia: state.homeMedia,
    homeContent: state.homeContent,
    features: state.features,
  }
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`La tienda normal registra 15 productos y pagina 12 + 3 (${viewport.width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('/tienda')
    await expect(page.locator('.catalog-toolbar [role="status"]')).toHaveText(
      '15 productos',
    )
    await expect(page.locator('.product-card')).toHaveCount(12)
    await expect(
      page.locator('.catalog-pagination [aria-current="page"]'),
    ).toHaveText('1')
    await expect(page.locator('main')).not.toContainText('Muestra 01')
    await page.getByRole('link', { name: 'Página 2', exact: true }).click()
    await expect(page.locator('.product-card')).toHaveCount(3)
    await page.reload()
    await expect(page.locator('.product-card')).toHaveCount(3)
    await expect(
      page.locator('.catalog-pagination [aria-current="page"]'),
    ).toHaveText('2')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)

    await page.goto('/producto/cedre-lumiere')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Cèdre Lumière',
    )
    await page
      .getByRole('button', { name: 'Añadir al carrito', exact: true })
      .click()
    await expect(page.locator('.cart-notice')).toContainText(
      'Cèdre Lumière se añadió al carrito.',
    )
    await page.goto('/carrito')
    await expect(page.locator('main')).toContainText('Cèdre Lumière')
  })
}

test('Los registros nuevos conservan edición, desactivación y eliminación al recargar', async ({
  page,
}) => {
  await page.goto('/tienda')
  await expect(page.locator('.catalog-toolbar [role="status"]')).toHaveText(
    '15 productos',
  )
  const result = await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    const product = adminService
      .getSnapshot()
      .products.find(({ product }) => product.id === 'cedre-lumiere')!
    const edited = adminService.saveProduct({
      ...product,
      product: {
        ...product.product,
        name: 'Cèdre Lumière edición administrada',
      },
      detail: {
        ...product.detail,
        shortDescription: 'Descripción actualizada desde Productos.',
      },
    })
    const deactivated = adminService.setProductActive('rose-satin', false)
    await adminService.flush()
    return { edited, deactivated }
  })
  expect(result).toEqual({
    edited: { kind: 'saved' },
    deactivated: { kind: 'saved' },
  })
  await page.reload()
  await expect(page.locator('.catalog-toolbar [role="status"]')).toHaveText(
    '14 productos',
  )
  const saved = await snapshot(page)
  expect(
    saved.products.find(({ product }) => product.id === 'cedre-lumiere')
      ?.product.name,
  ).toBe('Cèdre Lumière edición administrada')
  expect(
    saved.products.find(({ product }) => product.id === 'rose-satin')?.active,
  ).toBe(false)

  // Repository removal checks that a completed registration never recreates records.
  await page.evaluate(async () => {
    const servicePath = '/src/services/admin-service.ts'
    const repositoryPath = '/src/services/admin-persistence.ts'
    const { adminService } = (await import(
      servicePath
    )) as typeof import('../src/services/admin-service')
    const { localAdminStateRepository } = (await import(
      repositoryPath
    )) as typeof import('../src/services/admin-persistence')
    const current = adminService.getSnapshot()
    await localAdminStateRepository.write({
      ...current,
      products: current.products.filter(
        ({ product }) => product.id !== 'the-sauvage',
      ),
    })
  })
  await page.reload()
  await expect(page.locator('.catalog-toolbar [role="status"]')).toHaveText(
    '13 productos',
  )
  expect(
    (await snapshot(page)).products.some(
      ({ product }) => product.id === 'the-sauvage',
    ),
  ).toBe(false)
})

test('La migración retira muestras anteriores, preserva productos y configuración y se ejecuta una sola vez', async ({
  page,
}) => {
  await page.goto('/tienda')
  await expect(page.locator('.catalog-toolbar [role="status"]')).toHaveText(
    '15 productos',
  )
  const before = await page.evaluate(async () => {
    const servicePath = '/src/services/admin-service.ts'
    const repositoryPath = '/src/services/admin-persistence.ts'
    const contentPath = '/src/content/catalog-products.ts'
    const { adminService } = (await import(
      servicePath
    )) as typeof import('../src/services/admin-service')
    const { localAdminStateRepository } = (await import(
      repositoryPath
    )) as typeof import('../src/services/admin-persistence')
    const { registeredCatalogIds } = (await import(
      contentPath
    )) as typeof import('../src/content/catalog-products')
    await adminService.flush()
    const current = structuredClone(adminService.getSnapshot())
    Reflect.deleteProperty(current, 'catalogVersion')
    const originals = current.products.filter(
      ({ product }) => !registeredCatalogIds.has(product.id),
    )
    const samples = Array.from({ length: 8 }, (_, index) => {
      const id = `pagination-sample-${String(index + 1).padStart(2, '0')}`
      const source = structuredClone(originals[0])
      return {
        ...source,
        active: true,
        product: {
          ...source.product,
          id,
          slug: `muestra-paginacion-${index + 1}`,
          name: `Muestra ${index + 1}`,
          variants: source.product.variants.map((variant, variantIndex) => ({
            ...variant,
            id: `${id}-${variantIndex}`,
            sku: `DEMO-${index}-${variantIndex}`,
            stock: 6,
          })),
        },
      }
    })
    current.products = [...originals, ...samples]
    await localAdminStateRepository.write(current)
    return { ...current, products: originals }
  })
  await page.reload()
  await expect(page.locator('.catalog-toolbar [role="status"]')).toHaveText(
    '15 productos',
  )
  const after = await snapshot(page)
  expect(after.catalogVersion).toBe(1)
  expect(after.products).toHaveLength(16)
  expect(
    after.products.some(({ product }) =>
      product.id.startsWith('pagination-sample-'),
    ),
  ).toBe(false)
  for (const original of before.products) {
    expect(
      after.products.find(({ product }) => product.id === original.product.id),
    ).toEqual(original)
  }
  expect(unchangedSettings(after)).toEqual(unchangedSettings(before))
  await page.reload()
  await expect(page.locator('.catalog-toolbar [role="status"]')).toHaveText(
    '15 productos',
  )
  expect(await snapshot(page)).toEqual(after)
})

test('La migración respeta productos propios y completa solo los registros necesarios hasta 15', async ({
  page,
}) => {
  await page.goto('/tienda')
  await expect(page.locator('.catalog-toolbar [role="status"]')).toHaveText(
    '15 productos',
  )
  const custom = await page.evaluate(async () => {
    const servicePath = '/src/services/admin-service.ts'
    const repositoryPath = '/src/services/admin-persistence.ts'
    const contentPath = '/src/content/catalog-products.ts'
    const { adminService } = (await import(
      servicePath
    )) as typeof import('../src/services/admin-service')
    const { localAdminStateRepository } = (await import(
      repositoryPath
    )) as typeof import('../src/services/admin-persistence')
    const { registeredCatalogIds } = (await import(
      contentPath
    )) as typeof import('../src/content/catalog-products')
    await adminService.flush()
    const current = structuredClone(adminService.getSnapshot())
    Reflect.deleteProperty(current, 'catalogVersion')
    const originals = current.products.filter(
      ({ product }) => !registeredCatalogIds.has(product.id),
    )
    const ownProducts = Array.from({ length: 3 }, (_, index) => {
      const id = `producto-propio-${index + 1}`
      const source = structuredClone(originals[0])
      return {
        ...source,
        active: true,
        product: {
          ...source.product,
          id,
          slug: id,
          name: `Producto propio ${index + 1}`,
          sku: String(20000 + index),
          variants: source.product.variants.map((variant, variantIndex) => ({
            ...variant,
            id: `${id}-${variantIndex}`,
            sku: `OWN-${index}-${variantIndex}`,
            stock: 6,
          })),
        },
      }
    })
    await localAdminStateRepository.write({
      ...current,
      products: [...originals, ...ownProducts],
    })
    return ownProducts
  })
  await page.reload()
  await expect(page.locator('.catalog-toolbar [role="status"]')).toHaveText(
    '15 productos',
  )
  const saved = await snapshot(page)
  for (const original of custom) {
    expect(
      saved.products.find(({ product }) => product.id === original.product.id),
    ).toEqual(original)
  }
  expect(
    saved.products.filter(({ product }) =>
      [
        'cedre-lumiere',
        'rose-satin',
        'the-sauvage',
        'bergamote-soleil',
        'fleur-de-soie',
        'figue-blanche',
        'santal-epure',
        'bois-de-brume',
      ].includes(product.id),
    ),
  ).toHaveLength(5)
})

test('Un fallo de almacenamiento durante la migración mantiene disponible la tienda sin fingir un guardado correcto', async ({
  page,
}) => {
  await page.goto('/tienda')
  await expect(page.locator('.catalog-toolbar [role="status"]')).toHaveText(
    '15 productos',
  )
  await page.evaluate(async () => {
    const servicePath = '/src/services/admin-service.ts'
    const repositoryPath = '/src/services/admin-persistence.ts'
    const contentPath = '/src/content/catalog-products.ts'
    const { adminService } = (await import(
      servicePath
    )) as typeof import('../src/services/admin-service')
    const { localAdminStateRepository } = (await import(
      repositoryPath
    )) as typeof import('../src/services/admin-persistence')
    const { registeredCatalogIds } = (await import(
      contentPath
    )) as typeof import('../src/content/catalog-products')
    await adminService.flush()
    const legacy = structuredClone(adminService.getSnapshot())
    Reflect.deleteProperty(legacy, 'catalogVersion')
    legacy.products = legacy.products.filter(
      ({ product }) => !registeredCatalogIds.has(product.id),
    )
    await localAdminStateRepository.write(legacy)
  })
  await page.addInitScript(() => {
    IDBObjectStore.prototype.put = function () {
      throw new DOMException(
        'Almacenamiento lleno en prueba de migración',
        'QuotaExceededError',
      )
    }
  })
  await page.reload()
  await expect(page.locator('.catalog-toolbar [role="status"]')).toHaveText(
    '15 productos',
  )
  await expect(page.locator('.product-card')).toHaveCount(12)
  const result = await page.evaluate(async () => {
    const servicePath = '/src/services/admin-service.ts'
    const repositoryPath = '/src/services/admin-persistence.ts'
    const { adminService, hydrateAdminStore } = (await import(
      servicePath
    )) as typeof import('../src/services/admin-service')
    const { localAdminStateRepository } = (await import(
      repositoryPath
    )) as typeof import('../src/services/admin-persistence')
    await hydrateAdminStore()
    const persistence = await adminService.flush().then(
      () => 'saved',
      (error: unknown) =>
        error instanceof DOMException ? error.name : 'unknown-error',
    )
    const stored = await localAdminStateRepository.read()
    return {
      persistence,
      storedVersion: stored?.catalogVersion ?? null,
      storedCount: stored?.products.length,
    }
  })
  expect(result).toEqual({
    persistence: 'QuotaExceededError',
    storedVersion: null,
    storedCount: 8,
  })
})
