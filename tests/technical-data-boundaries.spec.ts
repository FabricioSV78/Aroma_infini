import { expect, test } from '@playwright/test'
import { adminService, type AdminProduct } from '../src/services/admin-service'
import {
  resolveCart,
  resolveFavoriteProducts,
} from '../src/services/commerce-service'

function productRecord(id: string): AdminProduct {
  const record = adminService
    .getSnapshot()
    .products.find((item) => item.product.id === id)
  if (!record) throw new Error(`Missing test fixture: ${id}`)
  return record
}

test.afterEach(() => adminService.reset())

test('carrito y favoritos vacíos conservan su respuesta sin preparar índices', () => {
  expect(resolveCart([])).toEqual({
    lines: [],
    subtotalCents: 0,
    productDiscountCents: 0,
    quantity: 0,
    needsAttention: false,
  })
  expect(resolveFavoriteProducts([])).toEqual({ found: [], missingIds: [] })
})

test('carrito conserva orden, descuentos por presentación, faltantes y aviso de stock', () => {
  const record = productRecord('cedre')
  expect(
    adminService.saveProductDiscount(record.product.id, {
      active: true,
      type: 'percent',
      value: 10,
      startsAt: '',
      endsAt: '',
    }).kind,
  ).toBe('saved')
  const [small, large] = productRecord('cedre').product.variants
  const items = [
    { variantId: large.id, quantity: 2 },
    { variantId: 'missing-presentation', quantity: 3 },
    { variantId: small.id, quantity: small.stock + 1 },
  ]
  const result = resolveCart(items)
  expect(result.lines.map((line) => line.item)).toEqual(items)
  expect(result.lines[0]).toMatchObject({
    kind: 'ready',
    unitPriceCents: 53100,
    originalUnitPriceCents: 59000,
    subtotalCents: 106200,
  })
  expect(result.lines[1]).toEqual({ kind: 'missing', item: items[1] })
  expect(result.lines[2]).toMatchObject({
    kind: 'ready',
    unitPriceCents: 35100,
    originalUnitPriceCents: 39000,
    needsAttention: true,
  })
  expect(result.quantity).toBe(2 + 3 + small.stock + 1)
  expect(result.subtotalCents).toBe(106200 + 35100 * (small.stock + 1))
  expect(result.productDiscountCents).toBe(11800 + 3900 * (small.stock + 1))
  expect(result.needsAttention).toBe(true)
})

test('favoritos conserva el orden solicitado y la primera coincidencia de producto y marca', () => {
  const state = adminService.getSnapshot()
  const first = productRecord('cedre')
  const brand = state.brands.find((item) => item.id === first.product.brandId)!
  // Raw legacy fixtures deliberately bypass today's duplicate-ID validation.
  const duplicate = structuredClone(first)
  duplicate.product.name = 'Duplicate product must not replace the first'
  state.products.push(duplicate)
  state.brands.push({ ...brand, name: 'Duplicate brand must not win' })

  const result = resolveFavoriteProducts([
    'sillage',
    'missing',
    'cedre',
    'sillage',
  ])
  expect(result.found.map((item) => item.product.id)).toEqual([
    'sillage',
    'cedre',
    'sillage',
  ])
  expect(result.missingIds).toEqual(['missing'])
  expect(result.found[1].product).toBe(first.product)
  expect(result.found[1].brand).toBe(brand)
  expect(result.found[0].product).toBe(result.found[2].product)
  const cart = resolveCart([
    { variantId: first.product.variants[0].id, quantity: 1 },
  ])
  expect(cart.lines[0].kind === 'ready' && cart.lines[0].brand).toBe(brand)
})

test('una variante inactiva en el primer producto no se sustituye por otra de un producto posterior', () => {
  const first = productRecord('cedre')
  const second = productRecord('petale')
  const original = first.product.variants[0]
  first.product.variants[0] = { ...original, active: false }
  second.product.variants.unshift({
    ...second.product.variants[0],
    id: original.id,
    active: true,
    priceCents: 12345,
  })
  expect(resolveCart([{ variantId: original.id, quantity: 1 }])).toEqual({
    lines: [{ kind: 'missing', item: { variantId: original.id, quantity: 1 } }],
    subtotalCents: 0,
    productDiscountCents: 0,
    quantity: 1,
    needsAttention: true,
  })

  const firstActive = { ...original, active: true, priceCents: 23456 }
  first.product.variants.push(firstActive, {
    ...firstActive,
    priceCents: 34567,
  })
  const resolved = resolveCart([{ variantId: original.id, quantity: 1 }])
  expect(resolved.lines[0]).toMatchObject({
    kind: 'ready',
    unitPriceCents: 23456,
    subtotalCents: 23456,
  })
  if (resolved.lines[0].kind !== 'ready')
    throw new Error('Expected a ready line')
  expect(resolved.lines[0].product).toBe(first.product)
  expect(resolved.lines[0].variant).toBe(firstActive)
})

test('IndexedDB permite una actualización externa de versión sin perder el snapshot ni retener la conexión cerrada', async ({
  page,
}) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const adminModule = '/src/services/admin-service.ts'
    const persistenceModule = '/src/services/admin-persistence.ts'
    const { adminService, hydrateAdminStore } = (await import(
      adminModule
    )) as typeof import('../src/services/admin-service')
    const { readAdminState, writeAdminState } = (await import(
      persistenceModule
    )) as typeof import('../src/services/admin-persistence')
    await hydrateAdminStore()
    await adminService.flush()
    const original = structuredClone(adminService.getSnapshot())
    await writeAdminState(original)

    const upgraded = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('aroma-infini-admin', 2)
      request.onerror = () => reject(request.error)
      request.onblocked = () =>
        reject(new Error('The old connection blocked the upgrade'))
      request.onsuccess = () => resolve(request.result)
    })
    const preserved = await new Promise<unknown>((resolve, reject) => {
      const request = upgraded
        .transaction('snapshot', 'readonly')
        .objectStore('snapshot')
        .get('current')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    upgraded.close()

    let readError = ''
    try {
      await readAdminState()
    } catch (error) {
      readError = error instanceof DOMException ? error.name : String(error)
    }
    return { original, preserved, readError }
  })
  expect(result.preserved).toEqual(result.original)
  // This adapter still requests v1: a new attempt must report VersionError,
  // rather than use the cached closed connection and throw InvalidStateError.
  expect(result.readError).toBe('VersionError')
})
