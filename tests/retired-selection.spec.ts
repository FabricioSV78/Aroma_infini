import { expect, test } from '@playwright/test'

test('Los enlaces antiguos abren la tienda sin una selección retirada y conservan los demás filtros', async ({
  page,
}) => {
  await page.goto('/tienda?seleccion=destacados')
  await expect(page).toHaveURL('/tienda')
  await expect(page.locator('.product-card')).toHaveCount(12)
  await expect(page.getByRole('button', { name: /^Destacados/ })).toHaveCount(0)
  await page.goto(
    '/tienda?seleccion=destacados&tipo=complemento&orden=precio-asc',
  )
  await expect(page).toHaveURL('/tienda?orden=precio-asc')
  await expect(page.locator('main h1')).toHaveText('Explora la tienda')
  await expect(page.getByRole('combobox', { name: 'Ordenar' })).toHaveValue(
    'precio-asc',
  )
})

test('Los datos guardados migran sin perder productos ni textos del Home', async ({
  page,
}) => {
  await page.goto('/admin/productos')
  await expect(page.locator('main h1')).toHaveText('Productos')
  await page.evaluate(async () => {
    const servicePath = '/src/services/admin-service.ts'
    const repositoryPath = '/src/services/admin-persistence.ts'
    const { adminService, hydrateAdminStore } = await import(servicePath)
    const { localAdminStateRepository } = await import(repositoryPath)
    await hydrateAdminStore()
    const snapshot = structuredClone(adminService.getSnapshot())
    snapshot.featuredOrder = ['cedre']
    snapshot.products[0].featured = true
    snapshot.products[0].product.name = 'Nombre de prueba conservado'
    snapshot.products[0].product.variants[0].priceCents = 32100
    snapshot.homeMedia.featured = 'imagen-antigua'
    snapshot.homeContent.hero[1].cta = 'Ver destacados'
    snapshot.homeContent.finder.cta = 'Descubrir mi selección'
    await localAdminStateRepository.write(snapshot)
  })
  await page.reload()
  await expect(page.locator('.admin-table--products')).toContainText(
    'Nombre de prueba conservado',
  )
  const migrated = await page.evaluate(async () => {
    const servicePath = '/src/services/admin-service.ts'
    const { adminService, hydrateAdminStore } = await import(servicePath)
    await hydrateAdminStore()
    return adminService.getSnapshot()
  })
  expect(migrated).not.toHaveProperty('featuredOrder')
  expect(migrated.products[0]).not.toHaveProperty('featured')
  expect(migrated.homeMedia).not.toHaveProperty('featured')
  expect(migrated.products[0].product.variants[0].priceCents).toBe(32100)
  expect(migrated.homeContent.finder.cta).toBe('Descubrir mi selección')
  expect(migrated.homeContent.hero[1].cta).toBe('Explorar perfumes')
  await page.goto('/admin/productos')
  await page.reload()
  await expect(page.locator('.admin-table--products')).toContainText(
    'Nombre de prueba conservado',
  )
})

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`Menú y panel sin Destacados · ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    if (viewport.width < 1024)
      await page
        .getByRole('button', { name: 'Abrir menú', exact: true })
        .click()
    const menu =
      viewport.width < 1024
        ? page.getByRole('dialog', { name: 'Explorar', exact: true })
        : page.getByRole('navigation', {
            name: 'Navegación principal',
            exact: true,
          })
    const trigger = menu.getByRole('button', { name: 'Tienda', exact: true })
    if ((await trigger.getAttribute('aria-expanded')) !== 'true')
      await trigger.click()
    const finder = menu.getByRole('link', {
      name: 'Encuentra tu perfume ideal',
      exact: true,
    })
    await expect(finder).toBeVisible()
    await expect(
      menu.getByRole('link', { name: 'Destacados', exact: true }),
    ).toHaveCount(0)
    await expect(finder).toHaveAttribute('href', '/#encuentra-tu-perfume')
    await page.screenshot({
      path: `artifacts/sin-destacados/menu-${viewport.width}.png`,
    })
    await finder.click()
    await expect(page).toHaveURL('/#encuentra-tu-perfume')
    await expect(page.locator('#encuentra-tu-perfume')).toBeInViewport()
    await page.goto('/admin/productos')
    await expect(page.locator('main h1')).toHaveText('Productos')
    await expect(
      page.getByRole('columnheader', { name: 'Destacado', exact: true }),
    ).toHaveCount(0)
    await expect(page.locator('main')).not.toContainText(/destacad/i)
    await page.screenshot({
      path: `artifacts/sin-destacados/productos-${viewport.width}.png`,
      fullPage: true,
    })
    await page.goto('/admin/productos/cedre')
    await expect(
      page.getByLabel('Producto activo en tienda', { exact: true }),
    ).toBeChecked()
    await expect(page.locator('main')).not.toContainText(/destacad/i)
    await page
      .locator('[aria-labelledby="product-visibility-title"]')
      .scrollIntoViewIfNeeded()
    await page.screenshot({
      path: `artifacts/sin-destacados/visibilidad-${viewport.width}.png`,
    })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
  })
}
