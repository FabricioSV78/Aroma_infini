import { expect, test, type Page } from '@playwright/test'
import type { AdminState } from '../src/services/admin-service'

const messageDialog = (page: Page) => page.locator('.admin-notice-dialog')

async function readAdmin(page: Page): Promise<AdminState> {
  return page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    await hydrateAdminStore()
    return structuredClone(adminService.getSnapshot())
  })
}

for (const upload of [
  {
    name: 'formato de imagen',
    file: {
      name: 'archivo.gif',
      mimeType: 'image/gif',
      buffer: Buffer.from('gif'),
    },
    expected: /JPG, PNG, WebP o AVIF/,
    video: false,
  },
  {
    name: 'imagen demasiado grande',
    file: {
      name: 'grande.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
    },
    expected: /20 MB o menos/,
    video: false,
  },
  {
    name: 'formato de video',
    file: {
      name: 'archivo.webm',
      mimeType: 'video/webm',
      buffer: Buffer.from('webm'),
    },
    expected: /video MP4/,
    video: true,
  },
]) {
  test(`Home: ${upload.name} muestra una explicación recuperable sin modificar el contenido`, async ({
    page,
  }) => {
    await page.goto('/admin/home')
    if (upload.video)
      await page
        .getByRole('button', { name: 'Video editorial', exact: true })
        .click()
    const before = await readAdmin(page)
    const input = upload.video
      ? page.getByLabel('Subir video editorial')
      : page.getByLabel('Subir imagen de escritorio de campaña 1')
    await input.setInputFiles(upload.file)
    const modal = messageDialog(page)
    await expect(modal).toBeVisible()
    await expect(modal).toHaveAttribute('role', 'alertdialog')
    await expect(modal).toContainText(upload.expected)
    await expect(modal).not.toContainText(
      /TypeError|DOMException|stack|QuotaExceededError/,
    )
    expect((await readAdmin(page)).revision).toBe(before.revision)
    await page.keyboard.press('Escape')
    await expect(modal).not.toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Guardar cambios del Home' }),
    ).toBeDisabled()
    await expect(page.locator('.admin-home-save-status')).not.toContainText(
      upload.expected,
    )
  })
}

test('Home: un campo incompleto se valida sin modal y el éxito aparece solo como aviso discreto', async ({
  page,
}) => {
  await page.goto('/admin/home')
  const title = page
    .getByLabel('Título', { exact: false })
    .filter({ has: page.locator('textarea') })
  // The hero title is the only textarea labelled with its line-count help.
  const input = page.locator('.admin-home-controls textarea').first()
  const original = await input.inputValue()
  const before = await readAdmin(page)
  await input.fill('')
  await page.getByRole('button', { name: 'Guardar cambios del Home' }).click()
  await expect(
    page.locator('.admin-home-savebar [role="alert"]'),
  ).toContainText('completa este campo')
  await expect(messageDialog(page)).not.toBeVisible()
  expect((await readAdmin(page)).revision).toBe(before.revision)
  await input.fill(`${original} prueba`)
  await page.getByRole('button', { name: 'Guardar cambios del Home' }).click()
  await expect(
    page
      .getByRole('status')
      .filter({
        hasText: 'Cambios guardados y visibles en el Home de este navegador.',
      }),
  ).toBeVisible()
  await expect(page.locator('.admin-home-savebar')).toContainText(
    'Todo guardado',
  )
  await expect(page.locator('.admin-home-savebar')).not.toContainText(
    'Cambios guardados y visibles',
  )
  await expect(messageDialog(page)).not.toBeVisible()
  expect((await readAdmin(page)).revision).toBe(before.revision + 1)
  await page.reload()
  await expect(
    page.locator('.admin-home-controls textarea').first(),
  ).toHaveValue(`${original} prueba`)
  void title
})

for (const scenario of [
  {
    name: 'Home',
    route: '/admin/home',
    editor: '.admin-editor-content',
    submit: 'Guardar cambios del Home',
    prepare: async (page: Page) => {
      await page
        .getByLabel('Etiqueta superior', { exact: true })
        .fill('Cambios con guardado pendiente')
    },
  },
  {
    name: 'Envíos',
    route: '/admin/envios',
    editor: '.admin-editor-content',
    submit: 'Guardar configuración',
    prepare: async (page: Page) => {
      await page.getByLabel('Courier en Lima (S/)').fill('31')
    },
  },
]) {
  test(`${scenario.name}: el fallo de persistencia permite reintentar sin duplicar el cambio`, async ({
    page,
  }) => {
    await page.goto(scenario.route)
    await scenario.prepare(page)
    const before = await readAdmin(page)
    await page.evaluate(async () => {
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
      const original = localAdminStateRepository.write
      let failed = false
      localAdminStateRepository.write = async (state) => {
        if (!failed) {
          failed = true
          throw new DOMException(
            'INTERNAL storage payload token=private',
            'QuotaExceededError',
          )
        }
        await original(state)
      }
    })
    await page
      .getByRole('button', { name: scenario.submit, exact: true })
      .click()
    const modal = messageDialog(page)
    await expect(modal).toBeVisible()
    await expect(modal).not.toContainText(
      /INTERNAL|payload|token=|QuotaExceededError/,
    )
    await expect(page.locator(scenario.editor)).toHaveAttribute('inert', '')
    const changed = await readAdmin(page)
    expect(changed.revision).toBe(before.revision + 1)
    await modal.getByRole('button', { name: /Reintentar/ }).click()
    await expect(modal).not.toBeVisible()
    await expect(page.locator(scenario.editor)).not.toHaveAttribute('inert', '')
    expect((await readAdmin(page)).revision).toBe(changed.revision)
    await page.reload()
    expect((await readAdmin(page)).revision).toBe(changed.revision)
  })
}

test('Envíos: cancelar un cambio de cobertura conserva el borrador y confirmar lo guarda una sola vez', async ({
  page,
}) => {
  await page.goto('/admin/envios')
  await page
    .locator('.admin-shipping-provinces')
    .getByRole('button', { name: 'Ver configuración' })
    .click()
  const toggle = page.getByRole('checkbox', {
    name: 'Permitir envíos a provincias',
  })
  const before = await readAdmin(page)
  await toggle.check()
  await page
    .getByRole('button', { name: 'Guardar configuración', exact: true })
    .click()
  const modal = messageDialog(page)
  await expect(modal).toHaveAttribute('role', 'alertdialog')
  await expect(modal).toContainText('¿Activar envíos a provincias?')
  await modal.getByRole('button', { name: 'Cancelar', exact: true }).click()
  expect((await readAdmin(page)).shipping.provinceShippingEnabled).toBe(false)
  await expect(toggle).toBeChecked()
  await expect(page.locator('.admin-shipping-footer')).toContainText(
    'Cambios sin guardar',
  )
  await page
    .getByRole('button', { name: 'Guardar configuración', exact: true })
    .click()
  await modal
    .getByRole('button', { name: 'Activar y guardar', exact: true })
    .click()
  await expect(modal).not.toBeVisible()
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Configuración aplicada a la tienda.' }),
  ).toBeVisible()
  const after = await readAdmin(page)
  expect(after.shipping.provinceShippingEnabled).toBe(true)
  expect(after.revision).toBe(before.revision + 1)
  await page.reload()
  expect((await readAdmin(page)).shipping.provinceShippingEnabled).toBe(true)
})

test('Envíos: un precio obligatorio vacío permanece junto al campo sin abrir un modal', async ({
  page,
}) => {
  await page.goto('/admin/envios')
  const before = await readAdmin(page)
  const fee = page.getByLabel('Courier en Lima (S/)')
  await fee.fill('')
  await page
    .getByRole('button', { name: 'Guardar configuración', exact: true })
    .click()
  await expect(fee).toBeFocused()
  await expect(messageDialog(page)).not.toBeVisible()
  expect((await readAdmin(page)).revision).toBe(before.revision)
  await fee.fill('32')
  await page
    .getByRole('button', { name: 'Guardar configuración', exact: true })
    .click()
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Configuración aplicada a la tienda.' }),
  ).toBeVisible()
  await expect(page.locator('.admin-shipping-footer')).not.toContainText(
    'Configuración aplicada a la tienda.',
  )
})
