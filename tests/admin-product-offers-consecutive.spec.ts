import { expect, test, type Locator, type Page } from '@playwright/test'
import { persistedAdminState } from './product-import-fixtures'

async function openNewOffer(page: Page) {
  await page.goto('/admin/promociones?vista=ofertas')
  await page.getByRole('button', { name: 'Crear oferta de producto' }).click()
  return page.locator('.admin-offers-editor')
}

async function expectReadyForAnother(editor: Locator) {
  await expect(
    editor.getByRole('heading', { name: 'Nueva oferta' }),
  ).toBeVisible()
  await expect(editor.getByLabel('Producto')).toHaveValue('')
  await expect(editor.getByLabel('Producto')).toBeFocused()
  await expect(editor.getByLabel('Tipo de descuento')).toHaveValue('percent')
  await expect(editor.getByLabel('Descuento (%)')).toHaveValue('10')
  await expect(editor.getByLabel('Inicio (opcional)')).toHaveValue('')
  await expect(editor.getByLabel('Fin (opcional)')).toHaveValue('')
  await expect(editor.getByLabel('Oferta habilitada')).toBeChecked()
  await expect(editor.locator('[role="alert"]')).toHaveCount(0)
}

test('Diez ofertas consecutivas se guardan, reinician el formulario y conservan los precios públicos', async ({
  page,
}) => {
  test.setTimeout(60_000)
  const editor = await openNewOffer(page)
  const products = await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    return adminService
      .getSnapshot()
      .products.filter(
        (record) =>
          record.active &&
          !record.product.discount &&
          record.product.variants.some((variant) => variant.stock > 0),
      )
      .map((record) => ({
        id: record.product.id,
        name: record.product.name,
        slug: record.product.slug,
      }))
      .sort((a, b) => Number(b.id === 'cedre') - Number(a.id === 'cedre'))
      .slice(0, 10)
  })
  expect(products).toHaveLength(10)
  const before = await persistedAdminState(page)
  for (const [index, product] of products.entries()) {
    await editor.getByLabel('Producto').selectOption(product.id)
    if (index % 2) {
      await editor.getByLabel('Tipo de descuento').selectOption('fixed')
      await editor.getByLabel('Descuento (S/)').fill('10.50')
    } else {
      await editor.getByLabel('Descuento (%)').fill('20')
    }
    if (index === 0) {
      await editor.getByLabel('Inicio (opcional)').fill('2020-01-01T09:00')
      await editor.getByLabel('Fin (opcional)').fill('2030-01-01T23:00')
    }
    await editor
      .getByRole('button', { name: 'Guardar y crear otra', exact: true })
      .click()
    await expectReadyForAnother(editor)
    await expect(page.locator('.admin-toast')).toContainText(
      `Oferta de ${product.name} guardada.`,
    )
    await expect(page.locator('.admin-offers-toolbar')).toContainText(
      `${index + 1} ${index === 0 ? 'producto con oferta' : 'productos con oferta'}`,
    )
    await expect(
      editor.getByLabel('Producto').locator(`option[value="${product.id}"]`),
    ).toHaveCount(0)
    await expect(
      page.getByRole('dialog', { name: 'Precios por presentación' }),
    ).not.toBeVisible()
  }
  await editor.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(editor).not.toBeVisible()
  await expect(page.locator('.admin-offers-list > li')).toHaveCount(10)
  await page.reload()
  await expect(page.locator('.admin-offers-list > li')).toHaveCount(10)
  const after = await persistedAdminState(page)
  expect(after.revision).toBe(before.revision + 10)
  for (const [index, product] of products.entries()) {
    const saved = after.products.filter(
      (record) => record.product.id === product.id,
    )
    expect(saved).toHaveLength(1)
    expect(saved[0].product.discount).toMatchObject({
      active: true,
      type: index % 2 ? 'fixed' : 'percent',
      value: index % 2 ? 1050 : 20,
    })
    const original = before.products.find(
      (record) => record.product.id === product.id,
    )!
    expect(saved[0].product.variants).toEqual(original.product.variants)
  }
  const bois = products.find((product) => product.id === 'cedre')!
  await page.goto(`/producto/${bois.slug}`)
  const price = page.locator('.product-selected-price')
  await expect(price.locator('.price-display__current')).toContainText('312')
  await expect(price.locator('del')).toContainText('390')
  await page.getByRole('radio', { name: /100 ml/ }).check()
  await expect(price.locator('.price-display__current')).toContainText('472')
  await expect(price.locator('del')).toContainText('590')
})

test('Guardar oferta finaliza y editar una oferta conserva sus acciones habituales', async ({
  page,
}) => {
  const editor = await openNewOffer(page)
  await editor.getByLabel('Producto').selectOption('cedre')
  await editor
    .getByRole('button', { name: 'Guardar oferta', exact: true })
    .click()
  await expect(editor).not.toBeVisible()
  const row = page
    .locator('.admin-offers-list > li')
    .filter({ hasText: 'Bois Clair' })
  await row.getByRole('button', { name: 'Editar oferta', exact: true }).click()
  await expect(
    editor.getByRole('heading', { name: 'Editar oferta' }),
  ).toBeVisible()
  await expect(
    editor.getByRole('button', { name: 'Guardar y crear otra', exact: true }),
  ).toHaveCount(0)
  await expect(
    editor.getByRole('button', { name: 'Retirar oferta', exact: true }),
  ).toBeVisible()
  await editor.getByLabel('Descuento (%)').fill('15')
  await editor
    .getByRole('button', { name: 'Guardar oferta', exact: true })
    .click()
  await expect(editor).not.toBeVisible()
  await expect(row).toContainText('15 % de descuento')
})

test('Las validaciones de importe, fechas y negocio conservan todos los datos', async ({
  page,
}) => {
  const editor = await openNewOffer(page)
  const finish = editor.getByRole('button', {
    name: 'Guardar oferta',
    exact: true,
  })
  const another = editor.getByRole('button', {
    name: 'Guardar y crear otra',
    exact: true,
  })
  await editor.getByLabel('Producto').selectOption('cedre')
  await editor.getByLabel('Tipo de descuento').selectOption('fixed')
  await editor.getByLabel('Descuento (S/)').fill('390')
  await expect(finish).toBeDisabled()
  await expect(another).toBeDisabled()
  await expect(editor.getByRole('alert')).toContainText('sin dejar en cero')
  await expect(editor.getByLabel('Producto')).toHaveValue('cedre')
  await editor.getByLabel('Descuento (S/)').fill('10.50')
  await editor.getByLabel('Inicio (opcional)').fill('2030-02-02T10:00')
  await editor.getByLabel('Fin (opcional)').fill('2030-02-01T10:00')
  await expect(finish).toBeDisabled()
  await expect(another).toBeDisabled()
  await expect(editor.getByLabel('Descuento (S/)')).toHaveValue('10.50')
  await expect(page.locator('.admin-offers-toolbar')).toContainText(
    '0 productos con oferta',
  )
  await editor.getByLabel('Fin (opcional)').fill('2030-02-03T10:00')
  await editor.getByLabel('Oferta habilitada').uncheck()
  await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    const original = adminService.saveProductDiscount
    let rejected = false
    adminService.saveProductDiscount = (...args) => {
      if (!rejected) {
        rejected = true
        return {
          kind: 'validation',
          message: 'El precio cambió. Revisa el importe de la oferta.',
        }
      }
      return original(...args)
    }
  })
  await another.click()
  await expect(editor.getByRole('alert')).toContainText('El precio cambió')
  await expect(editor.getByLabel('Producto')).toHaveValue('cedre')
  await expect(editor.getByLabel('Tipo de descuento')).toHaveValue('fixed')
  await expect(editor.getByLabel('Descuento (S/)')).toHaveValue('10.50')
  await expect(editor.getByLabel('Inicio (opcional)')).toHaveValue(
    '2030-02-02T10:00',
  )
  await expect(editor.getByLabel('Fin (opcional)')).toHaveValue(
    '2030-02-03T10:00',
  )
  await expect(editor.getByLabel('Oferta habilitada')).not.toBeChecked()
  await another.click()
  await expectReadyForAnother(editor)
  await expect(page.locator('.admin-offers-toolbar')).toContainText(
    '1 producto con oferta',
  )
})

test('Un fallo de almacenamiento no vacía la oferta y reintentar respeta crear otra', async ({
  page,
}) => {
  const editor = await openNewOffer(page)
  await editor.getByLabel('Producto').selectOption('cedre')
  await editor.getByLabel('Tipo de descuento').selectOption('fixed')
  await editor.getByLabel('Descuento (S/)').fill('25.50')
  await editor.getByLabel('Inicio (opcional)').fill('2020-01-01T09:00')
  await editor.getByLabel('Fin (opcional)').fill('2030-01-01T23:00')
  const before = await persistedAdminState(page)
  await page.evaluate(async () => {
    const path = '/src/services/admin-persistence.ts'
    const { localAdminStateRepository } = (await import(
      path
    )) as typeof import('../src/services/admin-persistence')
    const original = localAdminStateRepository.write
    localAdminStateRepository.write = async (snapshot) => {
      if (!(window as Window & { __allowOfferSave?: boolean }).__allowOfferSave)
        throw new DOMException('secret-storage-details', 'QuotaExceededError')
      await original(snapshot)
    }
  })
  await editor
    .getByRole('button', { name: 'Guardar y crear otra', exact: true })
    .click()
  const notice = page.locator('.admin-notice-dialog')
  await expect(notice).toContainText('espacio suficiente')
  await expect(notice).not.toContainText('secret-storage-details')
  await expect(editor.getByLabel('Producto')).toHaveValue('cedre')
  await expect(editor.getByLabel('Descuento (S/)')).toHaveValue('25.50')
  await expect(editor.getByLabel('Inicio (opcional)')).toHaveValue(
    '2020-01-01T09:00',
  )
  await expect(editor.getByLabel('Fin (opcional)')).toHaveValue(
    '2030-01-01T23:00',
  )
  expect((await persistedAdminState(page)).revision).toBe(before.revision)
  await page.evaluate(() => {
    ;(window as Window & { __allowOfferSave?: boolean }).__allowOfferSave = true
  })
  await notice
    .getByRole('button', { name: 'Reintentar guardado', exact: true })
    .click()
  await expectReadyForAnother(editor)
  const after = await persistedAdminState(page)
  expect(after.revision).toBe(before.revision + 1)
  expect(
    after.products.find((record) => record.product.id === 'cedre')?.product
      .discount,
  ).toMatchObject({ type: 'fixed', value: 2550 })
  await editor.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(page.locator('.admin-offers-list > li')).toHaveCount(1)
})

test('Dos envíos inmediatos solo guardan una oferta y mantienen el formulario bloqueado hasta completar', async ({
  page,
}) => {
  const editor = await openNewOffer(page)
  await editor.getByLabel('Producto').selectOption('cedre')
  await editor.getByLabel('Descuento (%)').fill('20')
  const before = await persistedAdminState(page)
  await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    const target = window as Window & {
      __offerCalls?: number
      __releaseOfferSave?: () => void
    }
    target.__offerCalls = 0
    const originalSave = adminService.saveProductDiscount
    const originalFlush = adminService.flush
    const gate = new Promise<void>((resolve) => {
      target.__releaseOfferSave = resolve
    })
    adminService.saveProductDiscount = (...args) => {
      target.__offerCalls = (target.__offerCalls ?? 0) + 1
      return originalSave(...args)
    }
    adminService.flush = async () => {
      await gate
      await originalFlush()
    }
  })
  await editor.evaluate((form) => {
    const submitter = form.querySelector<HTMLButtonElement>(
      'button[value="create-another"]',
    )!
    for (let index = 0; index < 2; index++)
      form.dispatchEvent(
        new SubmitEvent('submit', {
          bubbles: true,
          cancelable: true,
          submitter,
        }),
      )
  })
  await expect(editor).toHaveAttribute('aria-busy', 'true')
  await expect(
    editor.getByRole('button', {
      name: 'Guardando…',
      exact: true,
      includeHidden: true,
    }),
  ).toBeDisabled()
  await expect(
    editor.getByRole('button', {
      name: 'Guardar oferta',
      exact: true,
      includeHidden: true,
    }),
  ).toBeDisabled()
  await expect(editor.getByLabel('Producto')).toHaveValue('cedre')
  expect(
    await page.evaluate(
      () => (window as Window & { __offerCalls?: number }).__offerCalls,
    ),
  ).toBe(1)
  await page.evaluate(() =>
    (
      window as Window & { __releaseOfferSave?: () => void }
    ).__releaseOfferSave?.(),
  )
  await expectReadyForAnother(editor)
  expect((await persistedAdminState(page)).revision).toBe(before.revision + 1)
  await editor.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(page.locator('.admin-offers-list > li')).toHaveCount(1)
})
