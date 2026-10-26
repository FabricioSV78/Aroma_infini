import { expect, test } from '@playwright/test'
import { persistedAdminState } from './product-import-fixtures'

test('las fotos repetidas se rechazan sin cambios parciales y la vista previa funciona con teclado', async ({
  page,
}) => {
  await page.goto('/admin/productos')
  await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    const record = structuredClone(
      adminService
        .getSnapshot()
        .products.find((item) => item.product.id === 'cedre')!,
    )
    record.active = false
    record.product.image = ''
    record.detail.gallery = []
    record.detail.olfactoryImage = null
    adminService.saveProduct(record)
    await adminService.flush()
  })
  await page.goto('/admin/productos/cedre/fotos')
  const before = await persistedAdminState(page)
  const input = page.getByLabel('Subir varias fotos del producto', {
    exact: true,
  })
  await input.setInputFiles([
    'public/images/petale-960.webp',
    'public/images/petale-960.webp',
  ])
  await expect(page.locator('.admin-notice-dialog')).toContainText('repetida')
  await page.keyboard.press('Escape')
  await expect(page.locator('.admin-product-upload-item > img')).toHaveCount(0)
  expect((await persistedAdminState(page)).revision).toBe(before.revision)
  await input.setInputFiles([
    'public/images/petale-960.webp',
    'public/images/cedre-960.webp',
    'public/images/ambre-960.webp',
    'public/images/sillage-960.webp',
  ])
  await expect(page.locator('.admin-product-upload-item > img')).toHaveCount(4)
  await page
    .getByLabel('Subir imagen del perfil olfativo', { exact: true })
    .setInputFiles('public/images/petale-960.webp')
  await expect(page.locator('.admin-product-olfactory-slot > img')).toHaveCount(
    1,
  )
  await page
    .getByLabel('Ubicación de foto 5', { exact: true })
    .selectOption('1')
  await expect(page.locator('.admin-notice-dialog')).toContainText(
    'ya está en la galería',
  )
  await page.keyboard.press('Escape')
  await page
    .getByRole('button', { name: 'Ver foto', exact: true })
    .first()
    .focus()
  await page.keyboard.press('Enter')
  const preview = page.getByRole('dialog', {
    name: 'Imagen principal',
    exact: true,
  })
  await expect(preview).toBeVisible()
  await expect(preview.locator('img')).toHaveAttribute(
    'src',
    /^data:image\/webp;base64,/,
  )
  await page.keyboard.press('Escape')
  await expect(preview).not.toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Ver foto', exact: true }).first(),
  ).toBeFocused()
  await page.getByRole('button', { name: 'Guardar fotos', exact: true }).click()
  await expect(page).toHaveURL('/admin/productos')
  await page.goto('/admin/productos/cedre/fotos')
  await expect(page.locator('.admin-product-upload-item > img')).toHaveCount(4)
  await expect(page.locator('.admin-product-olfactory-slot > img')).toHaveCount(
    1,
  )
})
