import { expect, test } from '@playwright/test'
import {
  catalogService,
  queryCatalog,
  readCatalogQuery,
} from '../src/services/catalog-service'
import { products } from '../src/mocks/home'

test('La familia usa IDs válidos, combina OR entre familias y AND con los demás filtros', async () => {
  const selected = readCatalogQuery(
    new URLSearchParams(
      'familia=floral&familia=verde&familia=floral&familia=inexistente',
    ),
  )
  expect(selected.families).toEqual(['floral', 'verde'])
  expect(
    queryCatalog(selected)
      .items.map((product) => product.id)
      .sort(),
  ).toEqual([
    'figue',
    'figue-blanche',
    'fleur-de-soie',
    'iris',
    'petale',
    'rose-satin',
    'sillage',
    'the-sauvage',
  ])

  const combined = readCatalogQuery(
    new URLSearchParams(
      'marca=forme&genero=unisex&familia=floral&min=450&max=500&orden=precio-asc',
    ),
  )
  expect(queryCatalog(combined).items.map((product) => product.id)).toEqual([
    'iris',
    'fleur-de-soie',
  ])
  expect(
    queryCatalog(
      readCatalogQuery(new URLSearchParams('marca=forme&familia=verde')),
    ).total,
  ).toBe(0)

  const catalogue = await catalogService.getCatalog(
    readCatalogQuery(new URLSearchParams()),
  )
  expect(catalogue.families.map((family) => family.value)).toEqual([
    'amaderado',
    'floral',
    'verde',
    'citrico',
  ])
})

test('No se infiere una familia del nombre ni de un campo marcado como sin clasificar', () => {
  const query = readCatalogQuery(new URLSearchParams('familia=amaderado'))
  const classified = products[0]
  const legacy = { ...classified, olfactoryFamily: undefined }
  const unclassified = { ...classified, olfactoryFamily: null }
  const namedOnly = {
    ...classified,
    name: 'Amaderado',
    family: 'Perfil sin clasificar',
    olfactoryFamily: undefined,
  }
  expect(queryCatalog(query, [legacy]).total).toBe(1)
  expect(queryCatalog(query, [unclassified]).total).toBe(0)
  expect(queryCatalog(query, [namedOnly]).total).toBe(0)
})

test('Un producto puede coincidir por cualquiera de sus familias confirmadas', () => {
  const classified = {
    ...products[0],
    olfactoryFamilies: ['amaderado', 'fresco'] as ['amaderado', 'fresco'],
  }
  expect(
    queryCatalog(readCatalogQuery(new URLSearchParams('familia=fresco')), [
      classified,
    ]).total,
  ).toBe(1)
  expect(
    queryCatalog(
      readCatalogQuery(new URLSearchParams('familia=floral&familia=fresco')),
      [classified],
    ).total,
  ).toBe(1)
  expect(
    queryCatalog(readCatalogQuery(new URLSearchParams('familia=floral')), [
      classified,
    ]).total,
  ).toBe(0)
})

test('Escritorio: selección múltiple, chips, orden, recarga y limpieza', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/tienda')
  const sidebar = page.getByRole('complementary', {
    name: 'Filtros de la tienda',
  })
  const families = sidebar.locator('[data-filter-group="family"]')
  await expect(families).toHaveAttribute('open', '')
  await expect(sidebar.getByRole('checkbox', { name: 'Gourmand' })).toHaveCount(
    0,
  )
  await sidebar.getByRole('checkbox', { name: 'Floral' }).check()
  await sidebar.getByRole('checkbox', { name: 'Verde' }).check()
  await sidebar.getByRole('button', { name: 'Aplicar filtros' }).click()

  await expect(page).toHaveURL(/familia=floral&familia=verde/)
  await expect(page.locator('.product-card')).toHaveCount(8)
  await expect(
    page.getByRole('status').filter({ hasText: '8 productos' }),
  ).toBeVisible()
  await page.getByLabel('Ordenar', { exact: true }).selectOption('precio-asc')
  await expect(page.locator('.product-card').first()).toContainText('Pétale Nu')
  await page.reload()
  await expect(families).toHaveAttribute('open', '')
  await expect(sidebar.getByRole('checkbox', { name: 'Floral' })).toBeChecked()
  await expect(sidebar.getByRole('checkbox', { name: 'Verde' })).toBeChecked()

  await page
    .getByRole('button', { name: 'Quitar familia olfativa Verde' })
    .click()
  await expect(page.locator('.product-card')).toHaveCount(4)
  await expect(page).not.toHaveURL(/familia=verde/)
  await page
    .getByRole('button', { name: 'Limpiar filtros', exact: true })
    .click()
  await expect(page.locator('.product-card')).toHaveCount(12)
  await expect(page).not.toHaveURL(/familia=/)
})

test('Móvil: los filtros olfativos respetan el borrador del panel y el estado vacío', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tienda')
  const trigger = page.getByRole('button', { name: /^Filtros/ })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Afinar la selección' })
  await dialog.locator('[data-filter-group="family"] summary').click()
  await dialog.getByRole('checkbox', { name: 'Verde' }).check()
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL('/tienda')

  await trigger.click()
  await dialog.locator('[data-filter-group="family"] summary').click()
  await expect(
    dialog.getByRole('checkbox', { name: 'Verde' }),
  ).not.toBeChecked()
  await dialog.getByRole('checkbox', { name: 'Verde' }).check()
  await dialog.getByRole('checkbox', { name: 'Floral' }).check()
  await dialog.getByRole('button', { name: 'Aplicar filtros' }).click()
  await expect(page.locator('.product-card')).toHaveCount(8)

  await trigger.click()
  await dialog.locator('[data-filter-group="family"] summary').click()
  await dialog.getByRole('checkbox', { name: 'Floral' }).uncheck()
  await dialog.getByRole('checkbox', { name: 'Verde' }).uncheck()
  await dialog.getByRole('checkbox', { name: 'Cítrica' }).check()
  await expect(dialog.getByRole('checkbox', { name: 'Gourmand' })).toHaveCount(
    0,
  )
  await dialog.locator('[data-filter-group="brand"] summary').click()
  await dialog.getByRole('checkbox', { name: 'Forme' }).check()
  await dialog.getByRole('button', { name: 'Aplicar filtros' }).click()
  await expect(
    page.getByRole('heading', { name: 'No encontramos coincidencias' }),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Limpiar filtros', exact: true })
    .last()
    .click()
  await expect(page.locator('.product-card')).toHaveCount(12)
})
