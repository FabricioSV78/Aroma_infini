import { expect, test, type Page } from '@playwright/test'
import {
  importFile,
  importRecord,
  openImport,
  persistedAdminState,
  reviewFile,
} from './product-import-fixtures'

async function openBatch(page: Page, text: string) {
  await page.goto('/admin/marcas')
  await page
    .getByRole('button', { name: 'Registrar marcas', exact: true })
    .click()
  const editor = page.locator('.admin-brand-registration')
  await editor.getByLabel('Marcas (una por línea)', { exact: true }).fill(text)
  await editor
    .getByRole('button', { name: 'Revisar marcas', exact: true })
    .click()
  return editor
}

for (const count of [5, 20, 50, 100]) {
  test(`Registra ${count} marcas en una sola operación sin modificar el catálogo existente`, async ({
    page,
  }) => {
    const names = Array.from(
      { length: count },
      (_, index) => `Maison Élite ${String(index + 1).padStart(3, '0')}`,
    )
    const editor = await openBatch(page, names.join('\r\n'))
    const before = await persistedAdminState(page)
    await expect(editor.getByRole('status')).toHaveText(
      `${count} marcas detectadas`,
    )
    await expect(editor.locator('tbody tr')).toHaveCount(count)
    await editor
      .getByRole('button', { name: 'Guardar marcas', exact: true })
      .click()
    await expect(editor).toHaveCount(0)
    await expect(page.locator('#brand-registration-result')).toContainText(
      `${count} marcas creadas.`,
    )
    await expect(page.locator('#brand-registration-result')).toContainText(
      '0 sin registrar.',
    )
    const after = await persistedAdminState(page)
    expect(after.revision).toBe(before.revision + 1)
    expect(after.brands).toHaveLength(before.brands.length + count)
    expect(after.products).toEqual(before.products)
    expect(after.brands.slice(0, before.brands.length)).toEqual(before.brands)
    const added = after.brands.slice(before.brands.length)
    expect(added.map((brand) => brand.name)).toEqual(names)
    expect(new Set(after.brands.map((brand) => brand.slug)).size).toBe(
      after.brands.length,
    )
    expect(
      added.every(
        (brand) =>
          /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(brand.slug) && brand.active,
      ),
    ).toBe(true)
    const nextPage = page.getByRole('button', {
      name: 'Siguiente',
      exact: true,
    })
    while ((await nextPage.count()) && (await nextPage.isEnabled()))
      await nextPage.click()
    await expect(page.locator('.admin-brands-page tbody')).toContainText(
      names.at(-1)!,
    )
    await page.reload()
    const reloaded = await persistedAdminState(page)
    expect(reloaded.brands).toEqual(after.brands)
  })
}

test('Revisa nombres existentes, duplicados y errores; guarda solo los válidos con sus nombres originales', async ({
  page,
}) => {
  const text =
    '  Jean   Paul Gaultier  \nJEAN PAUL GAULTIER\nAtelier 01\nAtelier   01\nÉtat Libre d’Orange\nEtat Libre d’Orange\nA & B\nA - B\n---\n\n'
  const editor = await openBatch(page, text)
  const preview = editor.locator('tbody')
  await expect(preview.locator('tr')).toHaveCount(9)
  await expect(preview).toContainText('Ya existe')
  await expect(preview).toContainText('Repetida')
  await expect(preview).toContainText('Revisar')
  await expect(preview).toContainText('/jean-paul-gaultier')
  await expect(preview).toContainText('/a-b-2')
  const before = await persistedAdminState(page)
  await editor
    .getByRole('button', { name: 'Guardar marcas', exact: true })
    .click()
  const result = page.locator('#brand-registration-result')
  await expect(result).toContainText('4 marcas creadas.')
  await expect(result).toContainText('5 sin registrar.')
  await result.getByText('Ver detalle del registro', { exact: true }).click()
  await expect(result).toContainText('---')
  const after = await persistedAdminState(page)
  expect(
    after.brands.slice(before.brands.length).map((brand) => brand.name),
  ).toEqual(['Jean Paul Gaultier', 'État Libre d’Orange', 'A & B', 'A - B'])
  expect(after.brands.slice(0, before.brands.length)).toEqual(before.brands)
  await page.reload()
  const stored = await persistedAdminState(page)
  expect(stored.brands).toEqual(after.brands)
})

test('Modificar el texto invalida la revisión y un cambio concurrente exige revisar sin perder la lista', async ({
  page,
}) => {
  const editor = await openBatch(page, 'Maison Concurrente\nDior')
  await editor
    .getByLabel('Marcas (una por línea)', { exact: true })
    .fill('Maison Concurrente\nDior\nVersace')
  await expect(
    editor.getByRole('button', { name: 'Guardar marcas', exact: true }),
  ).toHaveCount(0)
  await editor
    .getByRole('button', { name: 'Revisar marcas', exact: true })
    .click()
  await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    const revision = adminService.getSnapshot().revision
    const result = adminService.saveBrandsBatch('Dior', revision)
    if (result.kind !== 'saved') throw new Error(result.message)
    await adminService.flush()
  })
  await editor
    .getByRole('button', { name: 'Guardar marcas', exact: true })
    .click()
  await expect(editor.getByRole('alert')).toContainText('Vuelve a revisar')
  await expect(
    editor.getByLabel('Marcas (una por línea)', { exact: true }),
  ).toHaveValue('Maison Concurrente\nDior\nVersace')
  await editor
    .getByRole('button', { name: 'Revisar marcas', exact: true })
    .click()
  await expect(editor.locator('tbody')).toContainText('Ya existe')
  await editor
    .getByRole('button', { name: 'Guardar marcas', exact: true })
    .click()
  await expect(page.locator('#brand-registration-result')).toContainText(
    '2 marcas creadas.',
  )
  const stored = await persistedAdminState(page)
  expect(stored.brands.filter((brand) => brand.name === 'Dior')).toHaveLength(1)
})

test('El guardado bloquea envíos duplicados y conserva la lista si falla el almacenamiento', async ({
  page,
}) => {
  const text = 'Maison Recuperable\nDior Recuperable\nVersace Recuperable'
  const editor = await openBatch(page, text)
  const before = await persistedAdminState(page)
  await page.evaluate(async () => {
    const servicePath = '/src/services/admin-service.ts'
    const persistencePath = '/src/services/admin-persistence.ts'
    const { adminService } = (await import(
      servicePath
    )) as typeof import('../src/services/admin-service')
    const { localAdminStateRepository } = (await import(
      persistencePath
    )) as typeof import('../src/services/admin-persistence')
    const originalSave = adminService.saveBrandsBatch
    const originalWrite = localAdminStateRepository.write
    const control = window as Window & {
      __brandCalls?: number
      __brandAllowWrite?: boolean
    }
    control.__brandCalls = 0
    adminService.saveBrandsBatch = (...args) => {
      control.__brandCalls = (control.__brandCalls ?? 0) + 1
      return originalSave(...args)
    }
    localAdminStateRepository.write = async (snapshot) => {
      if (!control.__brandAllowWrite)
        throw new DOMException('private-storage-details', 'QuotaExceededError')
      await originalWrite(snapshot)
    }
  })
  await editor.evaluate((form: HTMLFormElement) => {
    form.requestSubmit()
    form.requestSubmit()
  })
  const dialog = page.locator('.admin-notice-dialog')
  await expect(dialog).toContainText('No se pudieron guardar los cambios')
  await expect(dialog).not.toContainText('private-storage-details')
  await expect(
    editor.getByLabel('Marcas (una por línea)', { exact: true }),
  ).toHaveValue(text)
  await expect(editor).toHaveAttribute('inert', '')
  expect((await persistedAdminState(page)).revision).toBe(before.revision)
  expect(
    await page.evaluate(
      () => (window as Window & { __brandCalls?: number }).__brandCalls,
    ),
  ).toBe(1)
  await page.evaluate(() => {
    ;(window as Window & { __brandAllowWrite?: boolean }).__brandAllowWrite =
      true
  })
  await dialog
    .getByRole('button', { name: 'Reintentar guardado', exact: true })
    .click()
  await expect(editor).toHaveCount(0)
  const stored = await persistedAdminState(page)
  expect(stored.revision).toBe(before.revision + 1)
  expect(stored.brands).toHaveLength(before.brands.length + 3)
  await expect(page.locator('#brand-registration-result')).toContainText(
    '3 marcas creadas.',
  )
})

test('Las nuevas marcas se seleccionan en Productos, funcionan en la tienda y se reconocen en Excel', async ({
  page,
}) => {
  const editor = await openBatch(page, 'Jean Paul Gaultier')
  await editor
    .getByRole('button', { name: 'Guardar marcas', exact: true })
    .click()
  await expect(editor).toHaveCount(0)
  const stored = await persistedAdminState(page)
  const brand = stored.brands.find(
    (brand) => brand.name === 'Jean Paul Gaultier',
  )!
  await page.goto('/admin/productos/cedre')
  await page.getByLabel('Marca', { exact: true }).selectOption(brand.id)
  await page
    .getByRole('button', { name: 'Guardar producto', exact: true })
    .click()
  await expect(page.locator('.admin-toast')).toContainText('Producto guardado')
  await page.goto('/tienda?marca=jean-paul-gaultier')
  await expect(page.locator('.catalog-chips')).toContainText(
    'Jean Paul Gaultier',
  )
  await expect(
    page.locator('.product-card').filter({ hasText: 'Bois Clair' }),
  ).toHaveCount(1)
  await openImport(page)
  const preview = await reviewFile(
    page,
    await importFile([
      importRecord({
        marca: 'Jean Paul Gaultier',
        nombre: 'Perfume Integración Marca',
        slug: 'perfume-integracion-marca',
      }),
    ]),
  )
  await expect(preview).toContainText('1 fila correcta')
  await expect(preview).not.toContainText('no existe')
  await preview
    .getByRole('button', {
      name: 'Confirmar e importar 1 producto',
      exact: true,
    })
    .click()
  await expect(page.locator('.admin-notice-dialog')).toContainText('1 producto')
  const afterImport = await persistedAdminState(page)
  expect(
    afterImport.products.find(
      (record) => record.product.slug === 'perfume-integracion-marca',
    )?.product.brandId,
  ).toBe(brand.id)
})
