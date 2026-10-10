import { test, expect } from '@playwright/test'
import {
  queryCatalog,
  readCatalogQuery,
  catalogService,
} from '../src/services/catalog-service'
import { products } from '../src/mocks/home'
import {
  brandCatalogRedirectLoader,
  catalogLoader,
  brandsLoader,
} from '../src/features/catalog/catalog-loaders'

test('Los enlaces anteriores conservan filtros al abrir la tienda', async ({
  page,
}) => {
  await page.goto('/catalogo?marca=forme&orden=precio-asc')
  await expect(page).toHaveURL('/tienda?marca=forme&orden=precio-asc')
  await expect(page.locator('.product-card')).toHaveCount(2)
})

test('Los cuatro perfumes añadidos tienen ficha y se pueden añadir al carrito', async ({
  page,
}) => {
  for (const [slug, name] of [
    ['neroli-matin', 'Néroli Matin'],
    ['iris-velours', 'Iris Velours'],
    ['figue-douce', 'Figue Douce'],
    ['santal-nuit', 'Santal Nuit'],
  ]) {
    await page.goto(`/producto/${slug}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(name)
    await expect(page.locator('.product-review-list > li')).toHaveCount(3)
    await page.getByRole('button', { name: 'Añadir al carrito' }).click()
    await expect(page.locator('.cart-notice')).toContainText(
      `${name} se añadió al carrito.`,
    )
  }
  await page.goto('/carrito')
  for (const name of [
    'Néroli Matin',
    'Iris Velours',
    'Figue Douce',
    'Santal Nuit',
  ]) {
    await expect(page.locator('main')).toContainText(name)
  }
})

test('Consulta: facetas, acentos, stock, precios y paginación', () => {
  const run = (query: string) =>
    queryCatalog(readCatalogQuery(new URLSearchParams(query)))
  expect(run('q=petale').items[0].name).toBe('Pétale Nu')
  expect(
    run('marca=atelier-01&marca=forme&genero=mujer').items.map((p) => p.id),
  ).toEqual(['petale'])
  expect(run('min=600&max=630').items.map((p) => p.id)).toEqual(['petale'])
  expect(run('orden=precio-asc').items.map((p) => p.id)).toEqual([
    'cedre',
    'neroli',
    'petale',
    'ambre',
    'iris',
    'sillage',
    'figue',
    'santal',
  ])
  expect(run('marca=invalid&pagina=-8&min=bad&orden=bad').total).toBe(8)
  const fixture = {
    ...products[0],
    variants: [
      { id: 'sold', ml: 50, priceCents: 10000, stock: 0 },
      { id: 'available', ml: 100, priceCents: 50000, stock: 1 },
    ],
  }
  expect(
    queryCatalog(readCatalogQuery(new URLSearchParams('max=200')), [fixture])
      .total,
  ).toBe(0)
  const many = Array.from({ length: 13 }, (_, i) => ({
    ...products[0],
    id: 'test-' + i,
  }))
  expect(
    queryCatalog(readCatalogQuery(new URLSearchParams()), many).items,
  ).toHaveLength(12)
  expect(
    queryCatalog(readCatalogQuery(new URLSearchParams('pagina=999')), many)
      .items,
  ).toHaveLength(1)
  expect(
    queryCatalog(readCatalogQuery(new URLSearchParams()), [
      { ...fixture, variants: [] },
    ]).items,
  ).toHaveLength(1)
})

test('Loaders: marca inexistente y fallos recuperables', async () => {
  const args = {
    request: new Request('http://localhost/marcas/inexistente'),
    params: { slug: 'inexistente' },
    url: new URL('http://localhost/marcas/inexistente'),
    pattern: '/marcas/:slug',
    context: {},
  }
  expect((await catalogLoader(args)).kind).toBe('missing')
  const original = catalogService.getBrands
  try {
    catalogService.getBrands = async () => {
      throw new Error('test')
    }
    expect((await catalogLoader(args)).kind).toBe('error')
    expect((await brandsLoader()).kind).toBe('error')
  } finally {
    catalogService.getBrands = original
  }
})

test('Las rutas anteriores de marca redirigen al filtro de la tienda', async () => {
  const response = await brandCatalogRedirectLoader({
    request: new Request('http://localhost/marcas/forme'),
    params: { slug: 'forme' },
    context: {},
    url: new URL('http://localhost/marcas/forme'),
    pattern: '/marcas/:slug',
  })
  expect(response).toBeInstanceOf(Response)
  expect((response as Response).headers.get('Location')).toBe(
    '/tienda?marca=forme',
  )
})

test('Filtros combinados, URL, recarga, orden y volver atrás', async ({
  page,
}) => {
  await page.goto('/tienda')
  await expect(page.locator('.product-card')).toHaveCount(8)
  await page.setViewportSize({ width: 1440, height: 900 })
  const dialog = page.getByRole('complementary', {
    name: 'Filtros de la tienda',
  })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('button', { name: /^Filtros/ })).toBeHidden()
  await dialog.getByLabel('Forme', { exact: true }).check()
  await dialog.getByLabel('Para ella', { exact: true }).check()
  await dialog.getByLabel('Mínimo').fill('400')
  await dialog.getByLabel('Máximo').fill('630')
  await dialog.getByRole('button', { name: 'Aplicar filtros' }).click()
  await expect(page).toHaveURL(/marca=forme/)
  await expect(page.locator('.product-card')).toHaveCount(1)
  await page.reload()
  await expect(page.locator('.product-card')).toContainText('Pétale Nu')
  await page
    .getByRole('button', { name: 'Limpiar filtros', exact: true })
    .click()
  await expect(page.locator('.product-card')).toHaveCount(8)
  await page.getByLabel('Ordenar', { exact: true }).selectOption('precio-asc')
  await expect(page.locator('.product-card').first()).toContainText(
    'Bois Clair',
  )
  await page.goBack()
  await expect(page.getByLabel('Ordenar', { exact: true })).toHaveValue(
    'novedades',
  )
})

test('Móvil: cancelar borrador, Escape, retorno de foco y aplicación', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tienda')
  const trigger = page.getByRole('button', { name: /^Filtros/ })
  await trigger.click()
  await page.getByRole('dialog').getByLabel('Unisex', { exact: true }).check()
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await expect(page).toHaveURL(/\/tienda$/)
  await trigger.click()
  await expect(
    page.getByRole('dialog').getByLabel('Unisex', { exact: true }),
  ).not.toBeChecked()
  await page.getByRole('dialog').getByLabel('Unisex', { exact: true }).check()
  await page.getByRole('button', { name: 'Aplicar filtros' }).click()
  await expect(page.locator('.product-card')).toHaveCount(6)
  await expect(trigger).toBeFocused()
})

test('El diálogo de filtros mantiene Aplicar filtros visible al abrir en un móvil bajo', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/tienda')
  await page.getByRole('button', { name: /^Filtros/ }).click()

  const dialog = page.getByRole('dialog', { name: 'Afinar la selección' })
  const fields = dialog.locator('.catalog-filter-fields')
  const actions = dialog.locator('.catalog-filter-actions')
  const apply = actions.getByRole('button', { name: 'Aplicar filtros' })
  await expect(dialog).toBeVisible()
  await expect(apply).toBeInViewport({ ratio: 1 })
  expect(await dialog.evaluate((element) => element.scrollTop)).toBe(0)
  const initial = await fields.evaluate((element) => ({
    scrollTop: element.scrollTop,
    scrollable: element.scrollHeight > element.clientHeight,
    bottom: element.getBoundingClientRect().bottom,
  }))
  const initialFooter = await actions.boundingBox()
  expect(initial.scrollTop).toBe(0)
  expect(initial.scrollable).toBe(true)
  expect(initial.bottom).toBeLessThanOrEqual(initialFooter!.y + 1)

  await fields.evaluate((element) =>
    element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }),
  )
  await expect
    .poll(() => fields.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0)
  const footer = await actions.boundingBox()
  for (const name of ['Mínimo', 'Máximo']) {
    const input = fields.getByRole('spinbutton', { name })
    await expect(input).toBeInViewport({ ratio: 1 })
    const box = await input.boundingBox()
    expect(box!.y + box!.height).toBeLessThanOrEqual(footer!.y + 1)
  }
  await expect(apply).toBeInViewport({ ratio: 1 })
})

for (const width of [1024, 1440]) {
  test(`El panel y las acciones de filtros comparten un fondo continuo a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/tienda')

    const colors = await page
      .locator('.catalog-sidebar')
      .evaluate((sidebar) => {
        const actions = sidebar.querySelector('.catalog-filter-actions')
        if (!actions) throw new Error('Faltan las acciones de los filtros')
        const effectiveBackground = (element: Element) => {
          for (
            let node: Element | null = element;
            node;
            node = node.parentElement
          ) {
            const color = getComputedStyle(node).backgroundColor
            if (color !== 'transparent' && !/^rgba?\([^)]*,\s*0\)$/.test(color))
              return color
          }
          return ''
        }
        return {
          sidebar: effectiveBackground(sidebar),
          actions: effectiveBackground(actions),
        }
      })

    expect(colors.sidebar).not.toBe('')
    expect(colors.actions).toBe(colors.sidebar)
  })
}

test('Aplicar filtros desde el final del panel devuelve los resultados a la vista', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 600 })
  await page.goto('/tienda')

  const sidebar = page.getByRole('complementary', {
    name: 'Filtros de la tienda',
  })
  await sidebar.getByLabel('Forme', { exact: true }).check()
  await sidebar.getByLabel('Para ella', { exact: true }).check()
  await sidebar.getByLabel('Mínimo').fill('400')
  await sidebar.getByLabel('Máximo').fill('630')
  await sidebar.locator('.catalog-filter-actions').scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  await sidebar.getByRole('button', { name: 'Aplicar filtros' }).click()
  await expect(page.locator('.product-card')).toHaveCount(1)
  await expect(page.locator('.product-card').first()).toBeInViewport({
    ratio: 0.25,
  })
})

test('El panel móvil cierra al pasar a la columna desktop', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/tienda')
  await page.getByRole('button', { name: /^Filtros/ }).click()
  await page.setViewportSize({ width: 1024, height: 900 })
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Filtrar por' })).toBeFocused()
  const sidebar = await page.locator('.catalog-sidebar').boundingBox()
  const listing = await page.locator('.catalog-listing').boundingBox()
  expect(sidebar!.x + sidebar!.width).toBeLessThan(listing!.x)
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    'hidden',
  )
})

test('Una búsqueda con un resultado conserva filtros accesibles sin alargar el listado', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/buscar?q=petale')
  const disclosure = page.locator('.catalog-filter-disclosure')
  const summary = disclosure.locator('summary')
  await expect(summary).toBeVisible()
  await expect(disclosure.getByRole('checkbox', { name: 'Forme' })).toBeHidden()

  await summary.focus()
  await summary.press('Enter')
  await expect(
    disclosure.getByRole('checkbox', { name: 'Forme' }),
  ).toBeVisible()
  await disclosure.getByRole('checkbox', { name: 'Forme' }).check()
  await disclosure.getByRole('button', { name: 'Aplicar filtros' }).click()
  await expect(page).toHaveURL(/marca=forme/)
  await expect(page.locator('.product-card')).toHaveCount(1)

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(summary).toBeHidden()
  await page.getByRole('button', { name: /^Filtros/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 900 })
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(summary).toBeFocused()
})

test('Marcas y búsqueda con sugerencias y estados vacíos', async ({ page }) => {
  await page.goto('/marcas')
  await page
    .locator('.brands-directory')
    .getByRole('link', { name: /Forme/ })
    .click()
  await expect(page).toHaveURL('/tienda?marca=forme')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Elige tu próxima fragancia.',
  )
  await expect(page.locator('.product-card')).toHaveCount(2)
  await page.getByRole('button', { name: 'Buscar perfumes' }).click()
  await page.getByRole('dialog').getByLabel('Perfume o marca').fill('petale')
  await expect(page.locator('.search-suggestions')).toContainText('Pétale Nu')
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Buscar', exact: true })
    .click()
  await expect(page).toHaveURL(/buscar\?q=petale/)
  await expect(page.locator('.product-card')).toHaveCount(1)
  await page.goto('/buscar?q=inexistente')
  await expect(
    page.getByRole('heading', { name: 'No encontramos coincidencias.' }),
  ).toBeVisible()
  await page.goto('/buscar')
  await expect(
    page.getByRole('heading', { name: '¿Qué perfume tienes en mente?' }),
  ).toBeVisible()
  await page.goto('/marcas/inexistente')
  await expect(page.locator('.product-card')).toHaveCount(0)
})

for (const width of [360, 375, 390, 430, 768, 1024, 1280, 1440]) {
  test(`Tienda ${width}px: imágenes, consola y ancho`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning')
        errors.push(message.text())
    })
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/tienda')
    await expect(page.locator('.product-card')).toHaveCount(8)
    await page.locator('footer').scrollIntoViewIfNeeded()
    await page.waitForFunction(() =>
      [...document.images].every((img) => img.complete && img.naturalWidth > 0),
    )
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    expect(errors).toEqual([])
  })
}
