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
    expect(ready.recommendations).toHaveLength(4)
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
  ).toHaveCount(0)
  await expect(page.locator('.olfactory-profile-family')).toContainText(
    'Amaderado',
  )
  await expect(page.locator('.olfactory-profile-card')).toHaveCSS(
    'border-top-width',
    '0px',
  )
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
  const breadcrumb = await page.locator('.product-breadcrumb').boundingBox()
  expect(intro?.x).toBe(breadcrumb?.x)
  expect(intro?.width).toBe(breadcrumb?.width)
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
  ).toHaveCount(4)
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
  ).toHaveCount(4)
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

test('La primera vista muestra imagen, presentación y compra sin desplazarse', async ({
  page,
}) => {
  for (const [width, height] of [
    [320, 640],
    [390, 844],
    [768, 700],
    [768, 900],
    [1024, 700],
    [1280, 720],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height })
    await page.goto('/producto/bois-clair')
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport()
    await expect(page.locator('.product-selected-price')).toBeInViewport()
    await expect(page.locator('.product-cart-button')).toBeInViewport()
    const gallery = await page
      .locator('.product-gallery-frame.is-active')
      .boundingBox()
    expect((gallery?.y ?? 0) + (gallery?.height ?? 0)).toBeLessThanOrEqual(
      height,
    )
  }
})

test('En móvil la acción de compra es visible y mantiene un área táctil cómoda', async ({
  page,
}) => {
  const viewportHeight = 844
  await page.setViewportSize({ width: 390, height: viewportHeight })
  await page.goto('/producto/bois-clair')

  const addToCart = page.getByRole('button', { name: 'Añadir al carrito' })
  const box = await addToCart.boundingBox()
  expect(box).not.toBeNull()
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewportHeight)
  await expect(addToCart).toBeInViewport()
  await expect(addToCart).toBeEnabled()
  const visibleBox = await addToCart.boundingBox()
  expect(visibleBox?.height).toBeGreaterThanOrEqual(44)
})

test('Las ocho fichas conservan la compra en la primera vista móvil', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 })
  for (const slug of [
    'bois-clair',
    'petale-nu',
    'vert-silence',
    'ambre-lent',
    'neroli-matin',
    'iris-velours',
    'figue-douce',
    'santal-nuit',
  ]) {
    await page.goto(`/producto/${slug}`)
    await page.evaluate(() => document.fonts.ready)
    await expect
      .poll(
        async () => {
          const button = await page
            .locator('.product-cart-button')
            .boundingBox()
          return (button?.y ?? 640) + (button?.height ?? 100)
        },
        { message: slug },
      )
      .toBeLessThanOrEqual(640)
    const button = await page.locator('.product-cart-button').boundingBox()
    const help = await page.locator('.help-button').boundingBox()
    expect((button?.x ?? 320) + (button?.width ?? 0)).toBeLessThanOrEqual(
      (help?.x ?? 0) - 8,
    )
  }
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

test('Las reseñas aparecen tras el perfil y antes de los productos sugeridos', async ({
  page,
}) => {
  await page.goto('/producto/petale-nu')
  const preview = page.locator('.product-reviews-preview')
  await expect(preview).toBeVisible()
  await expect(preview.getByRole('heading', { name: 'Reseñas.' })).toBeVisible()
  await expect(preview.locator('.product-review-list > li')).toHaveCount(3)
  await expect(preview).toContainText('Un floral delicado')
  await expect(preview).toContainText('Camila R.')
  await expect(preview).toContainText('12 de setiembre de 2026')
  await expect(preview.locator('time').first()).toHaveAttribute(
    'dateTime',
    '2026-09-12',
  )
  await expect(
    preview.getByRole('img', { name: '5 de 5 estrellas' }).first(),
  ).toBeVisible()
  expect(
    await page
      .locator(
        '.product-information, .product-reviews-preview, .product-recommendations',
      )
      .evaluateAll((elements) =>
        elements.map((element) => element.classList[0]),
      ),
  ).toEqual([
    'product-information',
    'product-reviews-preview',
    'product-recommendations',
  ])
  const notice = page.locator('.product-popularity-preview')
  await expect(notice).toBeVisible()
  await expect(notice).toContainText('Entre los más vendidos')
  await expect(notice).not.toContainText(/personas|visitas|compras recientes/i)
  await notice.getByRole('button', { name: /Cerrar aviso/ }).click()
  await expect(notice).toHaveCount(0)
  await page.goto('/tienda')
  await page.goto('/producto/petale-nu')
  await expect(notice).toBeVisible()
})

test('Reseñas y recomendaciones comparten el ancho de la ficha sin agrandar las tarjetas', async ({
  page,
}) => {
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/producto/petale-nu')
    const intro = await page.locator('.product-intro').boundingBox()
    const reviews = await page.locator('.product-reviews-inner').boundingBox()
    const recommendations = await page
      .locator('.product-recommendations')
      .boundingBox()
    const card = await page
      .locator('.product-recommendations .product-card')
      .first()
      .boundingBox()

    expect(reviews?.x).toBeCloseTo(intro?.x ?? 0, 0)
    expect(reviews?.width).toBeCloseTo(intro?.width ?? 0, 0)
    expect(recommendations?.x).toBeCloseTo(intro?.x ?? 0, 0)
    expect(recommendations?.width).toBeCloseTo(intro?.width ?? 0, 0)
    expect(card?.width).toBeLessThanOrEqual(280)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width)
  }
})

test('La ficha aprovecha monitores amplios y conserva proporciones de laptop', async ({
  page,
}) => {
  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1904, height: 947 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/producto/petale-nu')

    const intro = await page.locator('.product-intro').boundingBox()
    const breadcrumb = await page.locator('.product-breadcrumb').boundingBox()
    const gallery = await page.locator('.product-gallery-track').boundingBox()
    const purchase = await page.locator('.product-purchase').boundingBox()
    const layoutWidth = await page.evaluate(() => document.body.clientWidth)

    expect(intro).not.toBeNull()
    expect(breadcrumb?.x).toBeCloseTo(intro?.x ?? 0, 0)
    expect(breadcrumb?.width).toBeCloseTo(intro?.width ?? 0, 0)
    expect(intro?.x).toBeCloseTo(
      layoutWidth - ((intro?.x ?? 0) + (intro?.width ?? 0)),
      0,
    )
    expect((gallery?.x ?? 0) + (gallery?.width ?? 0)).toBeLessThan(
      purchase?.x ?? 0,
    )
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width)

    if (viewport.width >= 1600) {
      expect(intro?.width).toBeGreaterThanOrEqual(1600)
      expect(intro?.width).toBeLessThanOrEqual(1680)
      expect(gallery?.width).toBeGreaterThanOrEqual(520)
      expect(gallery?.width).toBeLessThanOrEqual(560)
      expect(purchase?.width).toBeLessThanOrEqual(640)
    } else {
      expect(intro?.width).toBeLessThanOrEqual(1280)
      expect(gallery?.width).toBeLessThanOrEqual(520)
    }
  }
})

test('Las reseñas numerosas se muestran por tandas y conservan el foco', async ({
  page,
}) => {
  await page.goto('/producto/petale-nu')
  const preview = page.locator('.product-reviews-preview')
  const reviews = preview.locator('.product-review-list > li')
  const more = preview.getByRole('button', { name: 'Siguiente' })

  await expect(reviews).toHaveCount(3)
  await expect(preview).toContainText('Mostrando 1–3 de 50 reseñas')
  await more.click()
  await expect(reviews).toHaveCount(3)
  await expect(
    page.getByRole('heading', { name: 'Bonito en piel' }),
  ).toBeFocused()
  await expect(preview).toContainText('Mostrando 4–6 de 50 reseñas')
  await more.click()
  await expect(reviews).toHaveCount(3)
  await expect(
    page.getByRole('heading', { name: 'Un floral muy cómodo' }),
  ).toBeFocused()
  await expect(more).toBeEnabled()
  await expect(preview).toContainText('Mostrando 7–9 de 50 reseñas')
})

test('El aviso de producto cabe en móvil y distingue la selección de los más vendidos', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/producto/neroli-matin')
  const notice = page.locator('.product-popularity-preview')
  await expect(notice).toBeVisible()
  await expect(notice).not.toContainText('Entre los más vendidos')
  expect(
    await notice.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return bounds.left >= 0 && bounds.right <= window.innerWidth
    }),
  ).toBe(true)
  await expect(page.locator('.announcement')).toHaveCount(0)
})

test('La ficha inexistente ofrece regreso a la tienda', async ({ page }) => {
  await page.goto('/producto/inexistente')
  await expect(
    page.getByRole('heading', {
      name: 'Este perfume no está en la selección.',
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: /Explorar tienda/ }),
  ).toHaveAttribute('href', '/tienda')
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
