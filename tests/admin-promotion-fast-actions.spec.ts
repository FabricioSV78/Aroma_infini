import { expect, test, type Page } from '@playwright/test'
import { persistedAdminState } from './product-import-fixtures'

async function openCoupon(page: Page) {
  await page.goto('/admin/promociones')
  await page
    .getByRole('button', { name: 'Nueva promoción', exact: true })
    .click()
  return page.locator('.admin-promotion-form')
}

async function createCoupon(page: Page, code = 'RAPIDO15') {
  const form = await openCoupon(page)
  await form.getByLabel('Código', { exact: true }).fill(code)
  await form.getByLabel('Promoción activa').check()
  await form
    .getByRole('button', { name: 'Guardar promoción', exact: true })
    .click()
  await expect(form).not.toBeVisible()
  return page.locator('.admin-promotion-list > li').filter({ hasText: code })
}

async function createOffer(page: Page) {
  await page.goto('/admin/promociones?vista=ofertas')
  await page.getByRole('button', { name: 'Crear oferta de producto' }).click()
  const form = page.locator('.admin-offers-editor')
  await form.getByLabel('Producto').selectOption('cedre')
  await form.getByLabel('Descuento (%)').fill('20')
  await form
    .getByRole('button', { name: 'Guardar oferta', exact: true })
    .click()
  await expect(form).not.toBeVisible()
  return page
    .locator('.admin-offers-list > li')
    .filter({ hasText: 'Bois Clair' })
}

async function allowPersistence(page: Page, allowed: boolean) {
  await page.evaluate((allowed) => {
    ;(window as Window & { __allowFastSave?: boolean }).__allowFastSave =
      allowed
  }, allowed)
}

async function failPersistence(page: Page) {
  await page.evaluate(async () => {
    const path = '/src/services/admin-persistence.ts'
    const { localAdminStateRepository } = (await import(
      path
    )) as typeof import('../src/services/admin-persistence')
    const original = localAdminStateRepository.write
    localAdminStateRepository.write = async (snapshot) => {
      if (!(window as Window & { __allowFastSave?: boolean }).__allowFastSave)
        throw new DOMException('private-storage-details', 'QuotaExceededError')
      await original(snapshot)
    }
  })
}

test('Los cupones se registran consecutivamente con IDs nuevos y Guardar promoción finaliza', async ({
  page,
}) => {
  const form = await openCoupon(page)
  const before = await persistedAdminState(page)
  for (let i = 1; i <= 5; i++) {
    await form.getByLabel('Código', { exact: true }).fill(`CONTINUO${i}`)
    await form
      .getByRole('combobox', { name: 'Tipo', exact: true })
      .selectOption(i % 2 ? 'percent' : 'fixed')
    await form.getByLabel(i % 2 ? 'Descuento (%)' : 'Monto (S/)').fill('15')
    await form.getByLabel('Compra mínima (S/)').fill('120')
    await form.getByLabel('Inicio', { exact: true }).fill('2020-01-01T09:00')
    await form.getByLabel('Final', { exact: true }).fill('2030-12-31T23:00')
    await form.getByLabel('Límite de usos').fill('20')
    await form.getByLabel('Promoción activa').check()
    await form
      .getByRole('button', { name: 'Guardar y crear otra', exact: true })
      .click()
    await expect(
      form.getByRole('heading', { name: 'Nueva promoción' }),
    ).toBeVisible()
    await expect(form.getByLabel('Código', { exact: true })).toHaveValue('')
    await expect(form.getByLabel('Código', { exact: true })).toBeFocused()
    await expect(
      form.getByRole('combobox', { name: 'Tipo', exact: true }),
    ).toHaveValue('percent')
    await expect(form.getByLabel('Descuento (%)')).toHaveValue('10')
    await expect(form.getByLabel('Compra mínima (S/)')).toHaveValue('0')
    await expect(form.getByLabel('Inicio', { exact: true })).toHaveValue('')
    await expect(form.getByLabel('Final', { exact: true })).toHaveValue('')
    await expect(form.getByLabel('Límite de usos')).toHaveValue('')
    await expect(form.getByLabel('Promoción activa')).not.toBeChecked()
    await expect(page.locator('.admin-promotion-list > li')).toHaveCount(i)
  }
  await form.getByLabel('Código', { exact: true }).fill('FINAL6')
  await form
    .getByRole('button', { name: 'Guardar promoción', exact: true })
    .click()
  await expect(form).not.toBeVisible()
  const stored = await persistedAdminState(page)
  expect(stored.revision).toBe(before.revision + 6)
  expect(stored.promotions).toHaveLength(6)
  expect(new Set(stored.promotions.map((p) => p.id)).size).toBe(6)
  await page.reload()
  await expect(page.locator('.admin-promotion-list > li')).toHaveCount(6)
  await page
    .getByRole('button', { name: 'Editar CONTINUO1', exact: true })
    .click()
  await expect(
    form.getByRole('button', { name: 'Guardar y crear otra' }),
  ).toHaveCount(0)
})

test('Un código duplicado o fallo de guardado conserva el cupón y el reintento reinicia solo tras éxito', async ({
  page,
}) => {
  await createCoupon(page)
  await page.getByRole('button', { name: 'Nueva promoción' }).click()
  const form = page.locator('.admin-promotion-form')
  await form.getByLabel('Código', { exact: true }).fill('RAPIDO15')
  await form.getByLabel('Descuento (%)').fill('18')
  await form.getByRole('button', { name: 'Guardar y crear otra' }).click()
  await expect(form.getByRole('alert')).toContainText('ya existe')
  await expect(form.getByLabel('Código', { exact: true })).toHaveValue(
    'RAPIDO15',
  )
  await form.getByLabel('Código', { exact: true }).fill('RECUPERABLE18')
  const before = await persistedAdminState(page)
  await failPersistence(page)
  await form.getByRole('button', { name: 'Guardar y crear otra' }).click()
  const dialog = page.locator('.admin-notice-dialog')
  await expect(dialog).toContainText('espacio suficiente')
  await expect(form.getByLabel('Código', { exact: true })).toHaveValue(
    'RECUPERABLE18',
  )
  await expect(form.getByLabel('Descuento (%)')).toHaveValue('18')
  expect((await persistedAdminState(page)).revision).toBe(before.revision)
  await allowPersistence(page, true)
  await dialog
    .getByRole('button', { name: 'Reintentar guardado', exact: true })
    .click()
  await expect(form.getByLabel('Código', { exact: true })).toHaveValue('')
  await expect(form.getByLabel('Código', { exact: true })).toBeFocused()
  expect((await persistedAdminState(page)).revision).toBe(before.revision + 1)
})

test('Dos envíos inmediatos del cupón solo guardan un registro y bloquean las acciones', async ({
  page,
}) => {
  const form = await openCoupon(page)
  await form.getByLabel('Código', { exact: true }).fill('UNICO10')
  const before = await persistedAdminState(page)
  await page.evaluate(async () => {
    const path = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      path
    )) as typeof import('../src/services/admin-service')
    const original = adminService.flush
    const target = window as Window & { __releaseFastSave?: () => void }
    const gate = new Promise<void>((resolve) => {
      target.__releaseFastSave = resolve
    })
    adminService.flush = async () => {
      await gate
      await original()
    }
  })
  await form.evaluate((form) => {
    const submitter = form.querySelector<HTMLButtonElement>(
      'button[value="create-another"]',
    )!
    for (let i = 0; i < 2; i++)
      form.dispatchEvent(
        new SubmitEvent('submit', {
          bubbles: true,
          cancelable: true,
          submitter,
        }),
      )
  })
  await expect(form).toHaveAttribute('inert', '')
  await expect(
    form.getByRole('button', { name: 'Guardando…', includeHidden: true }),
  ).toBeDisabled()
  await expect(
    form.getByRole('heading', { name: 'Nueva promoción', includeHidden: true }),
  ).toBeAttached()
  await page.evaluate(() =>
    (
      window as Window & { __releaseFastSave?: () => void }
    ).__releaseFastSave?.(),
  )
  await expect(form.getByLabel('Código', { exact: true })).toHaveValue('')
  const after = await persistedAdminState(page)
  expect(after.revision).toBe(before.revision + 1)
  expect(after.promotions.filter((p) => p.code === 'UNICO10')).toHaveLength(1)
})

test('Eliminar un cupón desde el listado confirma, respeta cancelar y conserva pedidos anteriores', async ({
  page,
}) => {
  const row = await createCoupon(page)
  const before = await persistedAdminState(page)
  await row
    .getByRole('button', { name: 'Eliminar cupón RAPIDO15', exact: true })
    .click()
  const dialog = page.locator('.admin-notice-dialog')
  await expect(dialog.getByRole('heading')).toHaveText(
    '¿Eliminar el cupón RAPIDO15?',
  )
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(row).toBeVisible()
  expect((await persistedAdminState(page)).revision).toBe(before.revision)
  await row
    .getByRole('button', { name: 'Eliminar cupón RAPIDO15', exact: true })
    .click()
  await dialog
    .getByRole('button', { name: 'Eliminar cupón', exact: true })
    .click()
  await expect(row).toHaveCount(0)
  await expect(
    page.getByRole('heading', { name: 'Aún no hay códigos' }),
  ).toBeVisible()
  const after = await persistedAdminState(page)
  expect(after.orders).toEqual(before.orders)
  expect(after.products).toEqual(before.products)
  expect(after.promotions).toHaveLength(0)
  expect(
    await page.evaluate(async () => {
      const path = '/src/services/admin-service.ts'
      const { getPromotionByCode } = (await import(
        path
      )) as typeof import('../src/services/admin-service')
      return getPromotionByCode('RAPIDO15')
    }),
  ).toBeUndefined()
  await page.reload()
  await expect(page.locator('.admin-promotion-list > li')).toHaveCount(0)
})

test('Eliminar una oferta desde el listado mantiene producto, stock y variantes y restaura el precio público', async ({
  page,
}) => {
  const row = await createOffer(page)
  const before = await persistedAdminState(page)
  await row
    .getByRole('button', { name: 'Eliminar oferta de Bois Clair' })
    .click()
  const dialog = page.locator('.admin-notice-dialog')
  await expect(dialog.getByRole('heading')).toHaveText(
    '¿Eliminar la oferta de Bois Clair?',
  )
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(row).toBeVisible()
  expect((await persistedAdminState(page)).revision).toBe(before.revision)
  await row
    .getByRole('button', { name: 'Eliminar oferta de Bois Clair' })
    .click()
  await dialog
    .getByRole('button', { name: 'Eliminar oferta', exact: true })
    .click()
  await expect(row).toHaveCount(0)
  const after = await persistedAdminState(page)
  const old = before.products.find((p) => p.product.id === 'cedre')!
  const next = after.products.find((p) => p.product.id === 'cedre')!
  expect(next).toEqual({ ...old, product: { ...old.product, discount: null } })
  expect(after.orders).toEqual(before.orders)
  await page.goto(`/producto/${next.product.slug}`)
  await expect(
    page.locator('.product-selected-price .price-display__current'),
  ).toContainText('390')
  await expect(page.locator('.product-selected-price del')).toHaveCount(0)
})

for (const kind of ['coupon', 'offer'] as const) {
  test(`Eliminar ${kind}: un fallo de almacenamiento permite reintentar sin repetir la eliminación`, async ({
    page,
  }) => {
    const row =
      kind === 'coupon' ? await createCoupon(page) : await createOffer(page)
    const before = await persistedAdminState(page)
    await failPersistence(page)
    await row
      .getByRole('button', {
        name:
          kind === 'coupon'
            ? 'Eliminar cupón RAPIDO15'
            : 'Eliminar oferta de Bois Clair',
        exact: true,
      })
      .click()
    await page
      .locator('.admin-notice-dialog')
      .getByRole('button', {
        name: kind === 'coupon' ? 'Eliminar cupón' : 'Eliminar oferta',
        exact: true,
      })
      .click()
    const failure = page.locator('.admin-notice-dialog')
    await expect(failure).toContainText('espacio suficiente')
    expect((await persistedAdminState(page)).revision).toBe(before.revision)
    await allowPersistence(page, true)
    await failure
      .getByRole('button', { name: 'Reintentar guardado', exact: true })
      .click()
    await expect(failure).not.toBeVisible()
    const after = await persistedAdminState(page)
    expect(after.revision).toBe(before.revision + 1)
    expect(after.orders).toEqual(before.orders)
    await page.reload()
    await expect(
      page.locator(
        kind === 'coupon'
          ? '.admin-promotion-list > li'
          : '.admin-offers-list > li',
      ),
    ).toHaveCount(0)
  })
}

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`Acciones rápidas y confirmaciones son legibles a ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const form = await openCoupon(page)
    await form.getByLabel('Código', { exact: true }).fill('VISUAL15')
    const actions = form.locator('.admin-inline-actions')
    await actions.scrollIntoViewIfNeeded()
    await expect(
      actions.getByRole('button', { name: 'Guardar y crear otra' }),
    ).toBeVisible()
    await form.screenshot({
      path: `artifacts/promotion-fast-actions/coupon-form-${viewport.width}.png`,
    })
    await form
      .getByRole('button', { name: 'Guardar promoción', exact: true })
      .click()
    const coupon = page.locator('.admin-promotion-list > li')
    await coupon.screenshot({
      path: `artifacts/promotion-fast-actions/coupon-list-${viewport.width}.png`,
    })
    await coupon
      .getByRole('button', { name: 'Eliminar cupón VISUAL15' })
      .click()
    await page.locator('.admin-notice-dialog').screenshot({
      path: `artifacts/promotion-fast-actions/coupon-confirm-${viewport.width}.png`,
    })
    await page.keyboard.press('Escape')
    const offer = await createOffer(page)
    await offer.screenshot({
      path: `artifacts/promotion-fast-actions/offer-list-${viewport.width}.png`,
    })
    await offer
      .getByRole('button', { name: 'Eliminar oferta de Bois Clair' })
      .click()
    await page.locator('.admin-notice-dialog').screenshot({
      path: `artifacts/promotion-fast-actions/offer-confirm-${viewport.width}.png`,
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    expect(errors).toEqual([])
  })
}
