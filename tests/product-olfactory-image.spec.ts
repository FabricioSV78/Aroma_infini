import { expect, test } from '@playwright/test'
import { adminService } from '../src/services/admin-service'

test('cada perfume conserva su propia imagen olfativa al editar notas y volver a guardar', () => {
  adminService.reset()
  const before = adminService.getSnapshot()
  const cedar = before.products.find((item) => item.product.id === 'cedre')!
  const floral = before.products.find((item) => item.product.id === 'petale')!

  expect(cedar.detail.olfactoryImage).toBe('/images/olfactory-cedre.webp')
  expect(floral.detail.olfactoryImage).toBe('/images/olfactory-petale.webp')

  const draft = structuredClone(cedar)
  draft.detail.olfactoryImage = '/images/olfactory-iris.webp'
  draft.detail.notes.top = ['Cardamomo']
  expect(adminService.saveProduct(draft)).toEqual({ kind: 'saved' })

  const updated = adminService.getSnapshot()
  expect(
    updated.products.find((item) => item.product.id === 'cedre')?.detail
      .olfactoryImage,
  ).toBe('/images/olfactory-iris.webp')
  expect(
    updated.products.find((item) => item.product.id === 'petale')?.detail
      .olfactoryImage,
  ).toBe('/images/olfactory-petale.webp')

  const withoutVisual = structuredClone(
    updated.products.find((item) => item.product.id === 'cedre')!,
  )
  withoutVisual.detail.olfactoryImage = null
  expect(adminService.saveProduct(withoutVisual)).toEqual({ kind: 'saved' })
  expect(
    adminService
      .getSnapshot()
      .products.find((item) => item.product.id === 'cedre')?.detail
      .olfactoryImage,
  ).toBeNull()
})

test('rechaza recomendaciones inválidas y textos visibles incompletos', () => {
  adminService.reset()
  const original = adminService
    .getSnapshot()
    .products.find((item) => item.product.id === 'cedre')!

  for (const recommendationIds of [
    ['petale', 'petale'],
    ['cedre'],
    ['inexistente'],
    ['neroli', 'iris', 'figue', 'santal', 'petale'],
  ]) {
    const draft = structuredClone(original)
    draft.detail.recommendationIds = recommendationIds
    expect(adminService.saveProduct(draft).kind).toBe('validation')
  }

  const withoutSummary = structuredClone(original)
  withoutSummary.detail.shortDescription = ' '
  expect(adminService.saveProduct(withoutSummary).kind).toBe('validation')
})

test('migra imágenes olfativas antiguas según las notas guardadas en IndexedDB', async ({
  page,
}) => {
  await page.goto('/admin/envios')
  await page.getByRole('button', { name: 'Guardar configuración' }).click()
  await expect(
    page.getByText('Configuración aplicada a la tienda.'),
  ).toBeVisible()

  await page.evaluate(async () => {
    const request = indexedDB.open('aroma-infini-admin', 1)
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('snapshot', 'readwrite')
      const store = transaction.objectStore('snapshot')
      const get = store.get('current')
      get.onsuccess = () => {
        const snapshot = get.result as {
          products: {
            product: { id: string }
            detail: {
              olfactoryImage?: string | null
              notes: { top: string[] }
            }
          }[]
        }
        const unedited = snapshot.products.find(
          ({ product }) => product.id === 'cedre',
        )!
        const edited = snapshot.products.find(
          ({ product }) => product.id === 'petale',
        )!
        delete unedited.detail.olfactoryImage
        delete edited.detail.olfactoryImage
        edited.detail.notes.top = ['Una nota editada antes de la migración']
        store.put(snapshot, 'current')
      }
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    db.close()
  })

  await page.goto('/producto/bois-clair')
  await page.getByRole('button', { name: 'Familia olfativa' }).click()
  await expect(page.locator('.olfactory-profile-visual img')).toHaveAttribute(
    'src',
    '/images/olfactory-cedre.webp',
  )

  await page.goto('/producto/petale-nu')
  await page.getByRole('button', { name: 'Familia olfativa' }).click()
  await expect(page.locator('.olfactory-profile-visual img')).toHaveCount(0)
  await expect(
    page.locator('.olfactory-note-ingredients').first(),
  ).toContainText('Una nota editada antes de la migración')
})
