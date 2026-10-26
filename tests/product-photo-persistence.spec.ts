import { expect, test, type Page } from '@playwright/test'
import { persistedAdminState } from './product-import-fixtures'

async function openPhotoDraft(page: Page) {
  await page.goto('/admin/productos')
  await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    await hydrateAdminStore()
    for (const id of ['cedre', 'petale']) {
      const current = structuredClone(
        adminService
          .getSnapshot()
          .products.find((record) => record.product.id === id)!,
      )
      current.detail.olfactoryImage = null
      const result = adminService.saveProduct(current)
      if (result.kind !== 'saved') throw new Error(result.message)
    }
    await adminService.flush()
  })
  await page.goto('/admin/productos/cedre/fotos')
  const form = page.locator('form.admin-editor')
  await expect(
    page.getByRole('heading', {
      name: 'Fotografías de Bois Clair',
      exact: true,
    }),
  ).toBeVisible()
  const image = page.locator('.admin-product-upload-item > img').first()
  const previous = await image.getAttribute('src')
  await page
    .getByLabel('Reemplazar foto principal del producto', { exact: true })
    .setInputFiles('public/images/petale-960.webp')
  await expect(image).toHaveAttribute('src', /^data:image\/webp;base64,/)
  await expect(image).not.toHaveAttribute('src', previous!)
  await expect(
    form.getByRole('button', { name: 'Guardar y continuar', exact: true }),
  ).toBeEnabled()
  const cover = await image.getAttribute('src')
  const before = await persistedAdminState(page)
  const current = before.products.find(
    (record) => record.product.id === 'cedre',
  )!
  return {
    form,
    cover,
    gallery: [
      cover,
      ...current.detail.gallery.slice(1).map((view) => view.image),
    ],
    before,
  }
}

test('Un fallo de persistencia conserva las fotos y reintentar guarda y avanza una sola vez', async ({
  page,
}) => {
  const { form, cover, gallery, before } = await openPhotoDraft(page)
  await page.evaluate(async () => {
    const path = '/src/services/admin-persistence.ts'
    const { localAdminStateRepository } = (await import(
      path
    )) as typeof import('../src/services/admin-persistence')
    const original = localAdminStateRepository.write
    const target = window as Window & { __allowPhotoPersistence?: boolean }
    localAdminStateRepository.write = async (snapshot) => {
      if (!target.__allowPhotoPersistence)
        throw new DOMException('internal-storage-details', 'QuotaExceededError')
      await original(snapshot)
    }
  })
  await form
    .getByRole('button', { name: 'Guardar y continuar', exact: true })
    .click()
  const dialog = page.locator('.admin-notice-dialog')
  await expect(dialog).toContainText('espacio suficiente')
  await expect(page).toHaveURL(/\/admin\/productos\/cedre\/fotos$/)
  await expect(form).toHaveAttribute('inert', '')
  await expect(
    page.locator('.admin-product-upload-item > img').first(),
  ).toHaveAttribute('src', cover!)
  expect((await persistedAdminState(page)).revision).toBe(before.revision)
  await page.evaluate(() => {
    ;(
      window as Window & { __allowPhotoPersistence?: boolean }
    ).__allowPhotoPersistence = true
  })
  await dialog
    .getByRole('button', { name: 'Reintentar guardado', exact: true })
    .click()
  await expect(page).toHaveURL(/\/admin\/productos\/petale\/fotos$/)
  await expect(
    page.getByRole('heading', {
      name: 'Fotografías de Pétale Nu',
      exact: true,
    }),
  ).toBeVisible()
  const saved = await persistedAdminState(page)
  expect(saved.revision).toBe(before.revision + 1)
  const first = saved.products.find((record) => record.product.id === 'cedre')!
  const previous = before.products.find(
    (record) => record.product.id === 'cedre',
  )!
  expect(first.product.image).toBe(cover)
  expect(first.detail.gallery.map((view) => view.image)).toEqual(gallery)
  expect(first.detail.olfactoryImage).toBeNull()
  expect(first.product.sku).toBe(previous.product.sku)
  expect(first.product.variants).toEqual(previous.product.variants)
  expect(
    saved.products.filter((record) => record.product.id !== 'cedre'),
  ).toEqual(before.products.filter((record) => record.product.id !== 'cedre'))
  await page.reload()
  expect(
    (await persistedAdminState(page)).products.find(
      (record) => record.product.id === 'cedre',
    ),
  ).toEqual(first)
})

test('Dos envíos inmediatos bloquean el editor y guardan una sola revisión antes de continuar', async ({
  page,
}) => {
  const { form, cover, gallery, before } = await openPhotoDraft(page)
  await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    const original = adminService.flush
    const target = window as Window & { __releasePhotoPersistence?: () => void }
    const gate = new Promise<void>((resolve) => {
      target.__releasePhotoPersistence = resolve
    })
    adminService.flush = async () => {
      await gate
      await original()
    }
  })
  await form.evaluate((element) => {
    const submitter = element.querySelector<HTMLButtonElement>(
      'button[value="continue"]',
    )!
    for (let count = 0; count < 2; count += 1)
      element.dispatchEvent(
        new SubmitEvent('submit', {
          bubbles: true,
          cancelable: true,
          submitter,
        }),
      )
  })
  await expect(form).toHaveAttribute('inert', '')
  await expect(
    form.getByRole('button', {
      name: 'Guardando…',
      exact: true,
      includeHidden: true,
    }),
  ).toBeDisabled()
  await expect(
    form.getByRole('button', {
      name: 'Guardar y continuar',
      exact: true,
      includeHidden: true,
    }),
  ).toBeDisabled()
  await expect(page).toHaveURL(/\/admin\/productos\/cedre\/fotos$/)
  const inMemoryRevision = await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    return adminService.getSnapshot().revision
  })
  expect(inMemoryRevision).toBe(before.revision + 1)
  await page.evaluate(() => {
    ;(window as Window & { __releasePhotoPersistence?: () => void })
      .__releasePhotoPersistence!()
  })
  await expect(page).toHaveURL(/\/admin\/productos\/petale\/fotos$/)
  const saved = await persistedAdminState(page)
  expect(saved.revision).toBe(before.revision + 1)
  const first = saved.products.find((record) => record.product.id === 'cedre')!
  expect(first.product.image).toBe(cover)
  expect(first.detail.gallery.map((view) => view.image)).toEqual(gallery)
  expect(
    saved.products.filter((record) => record.product.id !== 'cedre'),
  ).toEqual(before.products.filter((record) => record.product.id !== 'cedre'))
})
