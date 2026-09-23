import { test, expect } from '@playwright/test'
import { productLoader } from '../src/features/product/product-loader'
import { catalogService } from '../src/services/catalog-service'

test('Loader de ficha: producto, ruta inexistente y error recuperable', async () => {
  const args = (slug: string) => ({
    request: new Request(`http://localhost/producto/${slug}`),
    params: { slug },
    url: new URL(`http://localhost/producto/${slug}`),
    pattern: '/producto/:slug',
    context: {},
  })
  const ready = await productLoader(args('bois-clair'))
  expect(ready.kind).toBe('ready')
  if (ready.kind === 'ready') {
    expect(ready.detail.gallery).toHaveLength(4)
    expect(ready.recommendations).toHaveLength(3)
  }
  expect((await productLoader(args('inexistente'))).kind).toBe('missing')

  const original = catalogService.getProduct
  try {
    catalogService.getProduct = async () => {
      throw new Error('test')
    }
    expect((await productLoader(args('bois-clair'))).kind).toBe('error')
  } finally {
    catalogService.getProduct = original
  }
})

test('La ficha actualiza precio y disponibilidad por presentación', async ({
  page,
}) => {
  await page.goto('/producto/bois-clair')
  await expect(
    page.getByRole('heading', { level: 1, name: 'Bois Clair' }),
  ).toBeVisible()
  await expect(page.locator('.product-selected-price')).toContainText('S/ 390')
  await page.getByLabel('100 ml').check()
  await expect(page.locator('.product-selected-price')).toContainText('S/ 590')
  await expect(page.locator('.product-selected-price')).toHaveAttribute(
    'aria-label',
    /Disponible/,
  )
  await expect(page.getByText('Disponible', { exact: true })).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Añadir al carrito' }),
  ).toBeEnabled()
  await expect(
    page.getByRole('heading', { name: 'Perfil olfativo' }),
  ).toBeVisible()
  await expect(
    page
      .locator('.olfactory-profile-card')
      .getByText('Bergamota', { exact: false }),
  ).toBeVisible()
  await expect(page.locator('.product-assurance')).toHaveCount(0)
  await expect(
    page.locator('.product-page').getByText('Preguntas frecuentes'),
  ).toHaveCount(0)
})

test('Galería, favoritos compartidos y recomendaciones son operables', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/producto/bois-clair')
  const intro = await page.locator('.product-intro').boundingBox()
  expect(intro?.x).toBeLessThanOrEqual(30)
  expect(intro?.width).toBeGreaterThanOrEqual(1380)
  const secondView = page.getByRole('button', {
    name: 'Ver imagen 2 de 4',
  })
  await secondView.focus()
  await page.keyboard.press('Enter')
  await expect(secondView).toHaveAttribute('aria-current', 'true')
  await expect(
    page.locator('.product-gallery-frame.is-active img'),
  ).toHaveAttribute('alt', 'Vista del atomizador de Bois Clair')

  const save = page.getByRole('button', { name: 'Guardar', exact: true })
  await save.click()
  await expect(
    page.getByRole('button', { name: 'Guardado', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.locator('.product-recommendations .product-card'),
  ).toHaveCount(3)
})

test('Un perfume agotado conserva precios de referencia y exploración', async ({
  page,
}) => {
  await page.goto('/producto/ambre-lent')
  await expect(page.locator('.product-selected-price')).toContainText('Agotado')
  await expect(
    page.getByRole('button', { name: 'Presentación agotada' }),
  ).toBeDisabled()
  await page.getByLabel('100 ml').check()
  await expect(page.locator('.product-selected-price')).toContainText('S/ 650')
  await expect(
    page.locator('.product-recommendations .product-card'),
  ).toHaveCount(3)
})

test('Móvil usa controles táctiles de galería y mantiene la compra cerca', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/producto/petale-nu')
  const thirdView = page.getByRole('button', { name: 'Ver imagen 3 de 4' })
  await thirdView.click()
  await expect(thirdView).toHaveAttribute('aria-current', 'true')
  await expect(
    page.locator('.product-gallery-mobile-controls > p'),
  ).toContainText('03')
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport()

  await page
    .locator('.product-info-nav')
    .getByRole('link', { name: /Descripción/ })
    .click()
  await expect(page.getByRole('tab', { name: 'Descripción' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.locator('#product-info-panel-description')).toBeVisible()
  await expect(page.locator('#product-info-panel-family')).toBeHidden()
})

test('La primera impresión mantiene identidad y precio dentro del viewport', async ({
  page,
}) => {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/producto/bois-clair')
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport()
    await expect(page.locator('.product-selected-price')).toBeInViewport()

    if (width >= 1024) {
      await expect(page.locator('.product-cart-button')).toBeInViewport()
      const gallery = await page
        .locator('.product-gallery-frame.is-active')
        .boundingBox()
      expect((gallery?.y ?? 0) + (gallery?.height ?? 0)).toBeLessThanOrEqual(
        900,
      )
    }
  }
})

test('En móvil la acción de compra queda disponible con un desplazamiento breve', async ({
  page,
}) => {
  const viewportHeight = 844
  await page.setViewportSize({ width: 390, height: viewportHeight })
  await page.goto('/producto/bois-clair')

  const addToCart = page.getByRole('button', { name: 'Añadir al carrito' })
  const box = await addToCart.boundingBox()
  expect(box).not.toBeNull()
  expect(box?.y).toBeLessThan(viewportHeight * 1.35)

  await addToCart.scrollIntoViewIfNeeded()
  await expect(addToCart).toBeInViewport()
  await expect(addToCart).toBeEnabled()
  const visibleBox = await addToCart.boundingBox()
  expect(visibleBox?.height).toBeGreaterThanOrEqual(44)
})

test('Los accesos internos abren un único detalle con contenido intercambiable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/producto/petale-nu')
  const infoNav = page.locator('.product-info-nav')
  const information = page.locator('#informacion-producto')
  const familyTab = page.getByRole('tab', { name: 'Familia olfativa' })
  const descriptionTab = page.getByRole('tab', { name: 'Descripción' })
  const familyPanel = page.locator('#product-info-panel-family')
  const descriptionPanel = page.locator('#product-info-panel-description')

  await infoNav.getByRole('link', { name: /Familia olfativa/ }).click()
  await expect(page).toHaveURL(/#informacion-producto$/)
  await expect(information).toBeInViewport()
  await expect(familyTab).toHaveAttribute('aria-selected', 'true')
  await expect(familyPanel).toBeVisible()
  await expect(descriptionPanel).toBeHidden()
  await expect(
    familyPanel.getByText('Floral · suave', { exact: true }),
  ).toBeVisible()

  await infoNav.getByRole('link', { name: /Descripción/ }).click()
  await expect(page).toHaveURL(/#informacion-producto$/)
  await expect(descriptionTab).toHaveAttribute('aria-selected', 'true')
  await expect(descriptionPanel).toBeVisible()
  await expect(familyPanel).toBeHidden()
  await expect(descriptionPanel.getByRole('heading')).toHaveCount(0)
  await expect(
    descriptionPanel.locator('.product-description-copy'),
  ).toContainText('Una interpretación floral')

  await descriptionTab.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(familyTab).toBeFocused()
  await expect(familyTab).toHaveAttribute('aria-selected', 'true')
  await expect(familyPanel).toBeVisible()
  await expect(descriptionPanel).toBeHidden()
})

test('Las reseñas de muestra se identifican como ficticias y no prometen validación real', async ({
  page,
}) => {
  await page.goto('/producto/petale-nu')
  const preview = page.locator('.product-reviews-preview')
  await expect(preview).toBeVisible()
  await expect(
    preview.getByText('Vista previa · contenido simulado'),
  ).toBeVisible()
  await expect(preview.locator('.product-review-list > li')).toHaveCount(3)
  await expect(preview.getByText('opiniones ficticias')).toBeVisible()
  await expect(preview).toContainText('compras verificadas')
})

test('El aviso de interés es sutil, no roba foco y se limita por producto y sesión', async ({
  page,
}) => {
  await page.goto('/producto/petale-nu')
  const focusBefore = await page.evaluate(
    () => `${document.activeElement?.tagName}:${document.activeElement?.id}`,
  )
  const preview = page.getByRole('complementary', {
    name: 'Interés en Pétale Nu',
  })
  await expect(preview).toBeVisible({ timeout: 4000 })
  await expect(preview).toContainText('Entre los más vendidos')
  await expect(preview).toContainText('favoritos de nuestra selección floral')
  await expect(preview.locator('img')).toHaveAttribute(
    'src',
    '/images/petale-480.webp',
  )
  expect(
    await page.evaluate(
      () => `${document.activeElement?.tagName}:${document.activeElement?.id}`,
    ),
  ).toBe(focusBefore)
  await preview
    .getByRole('button', { name: 'Cerrar aviso sobre Pétale Nu' })
    .click()
  await expect(preview).toHaveCount(0)
  await page.reload()
  await page.waitForTimeout(1900)
  await expect(preview).toHaveCount(0)
})

test('Todos los perfumes muestran una señal de interés, incluso si una presentación está agotada', async ({
  page,
}) => {
  for (const [slug, name] of [
    ['bois-clair', 'Bois Clair'],
    ['petale-nu', 'Pétale Nu'],
    ['vert-silence', 'Vert Silence'],
    ['ambre-lent', 'Ambre Lent'],
  ]) {
    await page.goto(`/producto/${slug}`)
    await expect(
      page.getByRole('complementary', { name: `Interés en ${name}` }),
    ).toBeVisible({ timeout: 4000 })
  }
})

test('La ficha inexistente ofrece regreso al catálogo', async ({ page }) => {
  await page.goto('/producto/inexistente')
  await expect(
    page.getByRole('heading', {
      name: 'Este perfume no está en la selección.',
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: /Explorar catálogo/ }),
  ).toHaveAttribute('href', '/catalogo')
})

for (const width of [360, 375, 390, 430, 768, 1024, 1280, 1440]) {
  test(`Ficha ${width}px: sin recortes, errores ni imágenes rotas`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning')
        errors.push(message.text())
    })
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/producto/vert-silence')
    await expect(page.locator('.product-gallery-frame')).toHaveCount(4)
    await page.locator('footer').scrollIntoViewIfNeeded()
    await page.locator('img').evaluateAll(async (elements) => {
      const images = elements as HTMLImageElement[]
      images.forEach((image) => {
        image.loading = 'eager'
      })
      await Promise.all(
        images.map(
          (image) =>
            new Promise<void>((resolve) => {
              if (image.complete) resolve()
              else {
                image.addEventListener('load', () => resolve(), { once: true })
                image.addEventListener('error', () => resolve(), { once: true })
              }
            }),
        ),
      )
    })
    expect(
      await page
        .locator('img')
        .evaluateAll(
          (elements) =>
            (elements as HTMLImageElement[]).filter(
              (image) => image.naturalWidth === 0,
            ).length,
        ),
    ).toBe(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    expect(errors).toEqual([])
  })
}
