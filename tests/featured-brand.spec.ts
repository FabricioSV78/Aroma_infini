import { expect, test, type Page } from '@playwright/test'
import {
  createDefaultHomeContent,
  normalizeHomeContent,
} from '../src/content/home-editor'
import { persistedAdminState } from './product-import-fixtures'

async function openFeaturedBrandEditor(page: Page) {
  await page.goto('/admin/home')
  await page.getByRole('button', { name: 'Marcas', exact: true }).click()
  return page.getByRole('combobox', {
    name: 'Marca destacada',
    exact: true,
  })
}

async function saveHome(page: Page) {
  await page
    .getByRole('button', { name: 'Guardar cambios del Home', exact: true })
    .click()
  await expect(page.locator('.admin-home-savebar')).toContainText(
    'Todo guardado',
  )
  await expect(page.locator('.admin-home-savebar')).toContainText(
    'Cambios guardados',
  )
}

async function homeSnapshot(page: Page) {
  return page.evaluate(async () => {
    const module = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = (await import(
      module
    )) as typeof import('../src/services/admin-service')
    await hydrateAdminStore()
    return structuredClone(adminService.getSnapshot())
  })
}

async function openBrandsNavigation(page: Page, mobile: boolean) {
  await page.goto('/')
  if (mobile) {
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    const menu = page.getByRole('dialog', { name: 'Explorar', exact: true })
    const trigger = menu.getByRole('button', { name: 'Marcas', exact: true })
    if ((await trigger.getAttribute('aria-expanded')) !== 'true')
      await trigger.click()
    return page.locator('#mobile-group-marcas')
  }
  await page.locator('#nav-trigger-marcas').click()
  return page.locator('#nav-panel-marcas')
}

test('los datos anteriores conservan Atelier 01 y una selección vacía no recupera una marca automáticamente', () => {
  const content = createDefaultHomeContent()
  const legacy = structuredClone(content)
  Reflect.deleteProperty(legacy, 'featuredBrandId')
  expect(normalizeHomeContent(legacy).featuredBrandId).toBe('atelier')
  expect(
    normalizeHomeContent({ ...content, featuredBrandId: null }).featuredBrandId,
  ).toBeNull()
})

test('el panel permite elegir una marca real y guardar sin alterar el resto del Home', async ({
  page,
}) => {
  const selector = await openFeaturedBrandEditor(page)
  const before = await homeSnapshot(page)
  await expect(selector).toHaveValue('atelier')
  await expect(
    selector.getByRole('option', { name: 'Sin marca destacada' }),
  ).toHaveAttribute('value', '')
  for (const brand of before.brands.filter((brand) => brand.active)) {
    await expect(selector.locator(`option[value="${brand.id}"]`)).toHaveText(
      brand.name,
    )
  }
  await selector.selectOption('forme')
  await expect(page.locator('.admin-home-savebar')).toContainText(
    'Cambios sin guardar',
  )
  expect((await homeSnapshot(page)).homeContent.featuredBrandId).toBe('atelier')
  await saveHome(page)
  const after = await persistedAdminState(page)
  expect(after.homeContent).toEqual({
    ...before.homeContent,
    featuredBrandId: 'forme',
  })
  expect(after.homeMedia).toEqual(before.homeMedia)
  expect(after.features).toEqual(before.features)
  expect(after.brands).toEqual(before.brands)
  await page.reload()
  await page.getByRole('button', { name: 'Marcas', exact: true }).click()
  await expect(selector).toHaveValue('forme')
  await expect(page.locator('.admin-home-savebar')).toContainText(
    'Todo guardado',
  )
})

for (const mobile of [false, true]) {
  test(`la marca elegida abre la tienda con su filtro en ${mobile ? 'móvil' : 'escritorio'}`, async ({
    page,
  }) => {
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    )
    const selector = await openFeaturedBrandEditor(page)
    await selector.selectOption('forme')
    await saveHome(page)
    const menu = await openBrandsNavigation(page, mobile)
    const featured = menu.getByRole('link', {
      name: 'Marca destacada',
      exact: true,
    })
    await expect(featured).toBeVisible()
    await expect(featured).toHaveAttribute('href', '/tienda?marca=forme')
    await featured.click()
    await expect(page).toHaveURL('/tienda?marca=forme')
    await expect(page.locator('.product-card')).toHaveCount(4)
    await expect(
      page.getByRole('button', { name: 'Quitar Forme', exact: true }),
    ).toBeVisible()
  })
}

test('Sin marca destacada retira solo ese acceso y mantiene todas las marcas disponibles', async ({
  page,
}) => {
  const selector = await openFeaturedBrandEditor(page)
  await selector.selectOption('')
  await saveHome(page)
  await page.reload()
  await page.getByRole('button', { name: 'Marcas', exact: true }).click()
  await expect(selector).toHaveValue('')
  expect(
    (await persistedAdminState(page)).homeContent.featuredBrandId,
  ).toBeNull()
  const menu = await openBrandsNavigation(page, false)
  await expect(
    menu.getByRole('link', { name: 'Marca destacada', exact: true }),
  ).toHaveCount(0)
  await expect(
    menu.getByRole('link', { name: 'Todas las marcas', exact: true }),
  ).toHaveAttribute('href', '/marcas')
})

test('una marca desactivada no conserva un acceso público inválido', async ({
  page,
}) => {
  await openFeaturedBrandEditor(page)
  const deactivated = await page.evaluate(async () => {
    const module = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      module
    )) as typeof import('../src/services/admin-service')
    const records = adminService.getSnapshot().products
    for (const record of records) {
      if (record.product.brandId === 'atelier')
        adminService.setProductActive(record.product.id, false)
    }
    const result = adminService.setBrandActive('atelier', false)
    await adminService.flush()
    return result
  })
  expect(deactivated.kind).toBe('saved')
  const menu = await openBrandsNavigation(page, false)
  await expect(
    menu.getByRole('link', { name: 'Marca destacada', exact: true }),
  ).toHaveCount(0)
  await expect(
    menu.getByRole('link', { name: 'Todas las marcas', exact: true }),
  ).toBeVisible()
})

test('guardar una selección nueva inexistente o desactivada rechaza el cambio y conserva todos los datos', async ({
  page,
}) => {
  await openFeaturedBrandEditor(page)
  const result = await page.evaluate(async () => {
    const module = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      module
    )) as typeof import('../src/services/admin-service')
    for (const record of adminService.getSnapshot().products) {
      if (record.product.brandId === 'forme')
        adminService.setProductActive(record.product.id, false)
    }
    const deactivated = adminService.setBrandActive('forme', false)
    await adminService.flush()
    const before = structuredClone(adminService.getSnapshot())
    const missing = adminService.saveHome(before.homeMedia, {
      ...before.homeContent,
      featuredBrandId: 'marca-inexistente',
    })
    const inactive = adminService.saveHome(before.homeMedia, {
      ...before.homeContent,
      featuredBrandId: 'forme',
    })
    await adminService.flush()
    return {
      deactivated,
      missing,
      inactive,
      before,
      after: structuredClone(adminService.getSnapshot()),
    }
  })
  expect(result.deactivated.kind).toBe('saved')
  expect(result.missing).toEqual({
    kind: 'validation',
    message: 'Selecciona una marca activa para destacarla.',
  })
  expect(result.inactive).toEqual(result.missing)
  expect(result.after).toEqual(result.before)
  expect(await persistedAdminState(page)).toEqual(result.before)
})

test('una marca destacada desactivada no bloquea guardar cambios en otros apartados del Home', async ({
  page,
}) => {
  await openFeaturedBrandEditor(page)
  const result = await page.evaluate(async () => {
    const module = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      module
    )) as typeof import('../src/services/admin-service')
    for (const record of adminService.getSnapshot().products) {
      if (record.product.brandId === 'atelier')
        adminService.setProductActive(record.product.id, false)
    }
    const deactivated = adminService.setBrandActive('atelier', false)
    const before = structuredClone(adminService.getSnapshot())
    const expectedContent = {
      ...before.homeContent,
      announcement: {
        ...before.homeContent.announcement,
        deliveryText: 'Entregas en Lima y Callao',
      },
    }
    const saved = adminService.saveHome(before.homeMedia, expectedContent)
    await adminService.flush()
    return {
      deactivated,
      saved,
      before,
      expectedContent,
      after: structuredClone(adminService.getSnapshot()),
    }
  })
  expect(result.deactivated.kind).toBe('saved')
  expect(result.saved.kind).toBe('saved')
  expect(result.after.homeContent).toEqual(result.expectedContent)
  expect(result.after.homeContent.featuredBrandId).toBe('atelier')
  expect(result.after.products).toEqual(result.before.products)
  expect(result.after.brands).toEqual(result.before.brands)
  expect((await persistedAdminState(page)).homeContent).toEqual(
    result.expectedContent,
  )
  const menu = await openBrandsNavigation(page, false)
  await expect(
    menu.getByRole('link', { name: 'Marca destacada', exact: true }),
  ).toHaveCount(0)
})

test('la selección usa el ID de marca y sigue el slug actualizado de esa misma marca', async ({
  page,
}) => {
  const selector = await openFeaturedBrandEditor(page)
  await selector.selectOption('forme')
  await saveHome(page)
  const updated = await page.evaluate(async () => {
    const module = '/src/services/admin-service.ts'
    const { adminService } = (await import(
      module
    )) as typeof import('../src/services/admin-service')
    const brand = adminService
      .getSnapshot()
      .brands.find((item) => item.id === 'forme')!
    const result = adminService.saveBrand({ ...brand, slug: 'forme-editada' })
    await adminService.flush()
    return result
  })
  expect(updated.kind).toBe('saved')
  const menu = await openBrandsNavigation(page, false)
  await expect(
    menu.getByRole('link', { name: 'Marca destacada', exact: true }),
  ).toHaveAttribute('href', '/tienda?marca=forme-editada')
  expect((await persistedAdminState(page)).homeContent.featuredBrandId).toBe(
    'forme',
  )
})

for (const viewport of [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`el selector es accesible y mantiene proporciones en ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    const selector = await openFeaturedBrandEditor(page)
    await selector.focus()
    await expect(selector).toBeFocused()
    await expect(selector).toBeEnabled()
    const bounds = await selector.boundingBox()
    expect(bounds).not.toBeNull()
    expect(bounds!.height).toBeGreaterThanOrEqual(40)
    expect(bounds!.width).toBeGreaterThanOrEqual(200)
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
    if (viewport.name === 'desktop' || viewport.name === 'mobile') {
      await page.screenshot({
        path: `artifacts/featured-brand/admin-${viewport.name}.png`,
        fullPage: true,
        animations: 'disabled',
      })
    }
  })
}
