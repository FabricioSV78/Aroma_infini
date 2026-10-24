import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test('migra la concentración retirada de registros anteriores sin alterar el resto del producto', async ({
  page,
}) => {
  await page.goto('/admin/productos/cedre')
  const original = await page.evaluate(async () => {
    const servicePath = '/src/services/admin-service.ts'
    const persistencePath = '/src/services/admin-persistence.ts'
    const { adminService, hydrateAdminStore } = await import(servicePath)
    const { writeAdminState } = await import(persistencePath)
    await hydrateAdminStore()
    await adminService.flush()
    const snapshot = structuredClone(adminService.getSnapshot())
    const record = snapshot.products.find(
      (item: { product: { id: string } }) => item.product.id === 'cedre',
    )!
    const expected = structuredClone(record)
    Reflect.set(record.detail, 'type', 'Extrait de Parfum legado')
    await writeAdminState(snapshot)
    return expected
  })

  await page.reload()
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(
    original.product.name,
  )
  const migrated = await page.evaluate(async () => {
    const servicePath = '/src/services/admin-service.ts'
    const persistencePath = '/src/services/admin-persistence.ts'
    const { adminService, hydrateAdminStore } = await import(servicePath)
    const { readAdminState } = await import(persistencePath)
    await hydrateAdminStore()
    await adminService.flush()
    const saved = await readAdminState()
    return {
      live: adminService
        .getSnapshot()
        .products.find(
          (item: { product: { id: string } }) => item.product.id === 'cedre',
        ),
      persisted: saved?.products.find(
        (item: { product: { id: string } }) => item.product.id === 'cedre',
      ),
    }
  })
  expect(migrated.live.detail).not.toHaveProperty('type')
  expect(migrated.persisted?.detail).not.toHaveProperty('type')
  expect(migrated.live).toEqual(original)
  expect(migrated.persisted).toEqual(original)

  await page.goto('/producto/bois-clair')
  await expect(page.locator('main h1')).toHaveText(original.product.name)
  await expect(page.locator('main')).not.toContainText(
    'Extrait de Parfum legado',
  )
  await expect(page.locator('.product-kind')).toHaveText(
    original.product.family.split('·')[0].trim(),
    { ignoreCase: true },
  )
  await page.getByRole('button', { name: 'Familia olfativa' }).click()
  await expect(page.locator('.olfactory-profile-kicker')).toHaveText(
    'Perfil olfativo',
  )
})

const viewports = [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
]

for (const viewport of viewports) {
  test(`el editor y la vista previa conservan el tipo de producto sin concentración en ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/admin/productos/cedre')
    await expect(
      page.getByRole('combobox', { name: 'Tipo de producto', exact: true }),
    ).toHaveValue('perfume')
    await expect(
      page.getByLabel('Tipo de perfume', { exact: true }),
    ).toHaveCount(0)
    await expect(page.getByLabel('Concentración', { exact: true })).toHaveCount(
      0,
    )
    await expect(page.locator('main')).not.toContainText(/Eau de|Extrait de/i)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)

    await mkdir('artifacts/concentracion-retirada', { recursive: true })
    await page.screenshot({
      path: `artifacts/concentracion-retirada/admin-${viewport.name}.png`,
      fullPage: true,
    })
    await page
      .getByRole('button', { name: 'Vista previa', exact: true })
      .click()
    const preview = page.getByRole('dialog', {
      name: 'Vista previa del producto',
    })
    await expect(preview.locator('h1')).toHaveText('Bois Clair')
    await expect(preview.locator('.product-kind')).toContainText('Amaderado')
    await expect(preview).not.toContainText(/Eau de|Extrait de/i)
    await expect(
      preview.getByRole('button', { name: 'Añadir al carrito' }),
    ).toBeVisible()
    await page.screenshot({
      path: `artifacts/concentracion-retirada/preview-${viewport.name}.png`,
      fullPage: true,
    })
    await preview.getByRole('button', { name: /Cerrar/ }).click()
    await page.goto('/producto/bois-clair')
    await expect(page.locator('main h1')).toHaveText('Bois Clair')
    await expect(page.locator('main')).not.toContainText(/Eau de|Extrait de/i)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `artifacts/concentracion-retirada/product-${viewport.name}.png`,
      fullPage: true,
    })
  })
}
