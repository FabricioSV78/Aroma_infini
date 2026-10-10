import { expect, test, type Page } from '@playwright/test'
import { getProductReviews } from '../src/mocks/product-reviews'
import { products } from '../src/mocks/home'

async function openReviews(page: Page) {
  const button = page
    .locator('.product-info-tabs')
    .getByRole('button', { name: 'Reseñas' })
  await button.click()
  await expect(button).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#product-info-panel-reviews')).toBeVisible()
}

test('Los ocho perfumes incluyen 50 opiniones coherentes con sus presentaciones', () => {
  for (const product of products) {
    const reviews = getProductReviews(product.id)
    expect(reviews).toHaveLength(50)
    expect(new Set(reviews.map((review) => review.id)).size).toBe(50)
    expect(new Set(reviews.map((review) => review.rating)).size).toBe(5)
    for (const review of reviews)
      expect(
        product.variants.some((variant) => variant.ml === review.sizeMl),
      ).toBe(true)
  }
})

test('El video usa un archivo panorámico en escritorio y uno vertical en móvil', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const video = page.locator('.editorial-film video')
  await video.scrollIntoViewIfNeeded()
  await expect(video).toHaveAttribute(
    'src',
    '/videos/perfume-editorial-wide.mp4',
  )
  await expect
    .poll(() => video.evaluate((node: HTMLVideoElement) => node.videoWidth))
    .toBe(1920)
  expect(
    await video.evaluate((node: HTMLVideoElement) => node.duration),
  ).toBeLessThan(16)
  await page.setViewportSize({ width: 390, height: 844 })
  await video.scrollIntoViewIfNeeded()
  await expect(video).toHaveAttribute('src', '/videos/perfume-ritual.mp4')
  await expect
    .poll(() => video.evaluate((node: HTMLVideoElement) => node.videoHeight))
    .toBe(1280)
})

for (const viewport of [
  { width: 390, height: 844 },
  { width: 768, height: 900 },
  { width: 1440, height: 900 },
  { width: 1904, height: 947 },
  { width: 844, height: 390 },
  { width: 1280, height: 600 },
]) {
  test(`El video conserva el encuadre completo a ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')

    const section = page.locator('.editorial-film')
    const media = page.locator('.editorial-film-media')
    await section.scrollIntoViewIfNeeded()

    await expect(media.locator('video')).toHaveCSS('object-fit', 'contain')
    await expect(media.locator('img')).toHaveCSS('object-fit', 'contain')
    const bounds = await section.boundingBox()
    const copy = await section.locator('.editorial-film-copy').boundingBox()
    expect(bounds).not.toBeNull()
    expect(copy).not.toBeNull()
    expect(copy!.y).toBeGreaterThanOrEqual(bounds!.y)
    expect(copy!.y + copy!.height).toBeLessThanOrEqual(
      bounds!.y + bounds!.height,
    )
    const layoutWidth = await page.evaluate(() => document.body.clientWidth)
    expect(bounds?.width).toBeCloseTo(layoutWidth, 0)
    expect(bounds?.height).toBeLessThanOrEqual(viewport.height)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width)
  })
}

test('Un visitante debe acceder a su cuenta antes de escribir', async ({
  page,
}) => {
  await page.goto('/producto/petale-nu')
  await openReviews(page)
  const trigger = page.getByRole('button', { name: 'Escribir una reseña' })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Inicia sesión para opinar' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('form')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await trigger.click()
  await dialog.getByRole('link', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL('/cuenta')
  await expect(
    page.getByRole('button', { name: 'Ver mi cuenta' }),
  ).toBeVisible()
})

test('Con 50 reseñas la lista mantiene tres filas y permite saltar a la última página', async ({
  page,
}) => {
  await page.goto('/producto/petale-nu')
  await openReviews(page)
  const section = page.locator('.product-reviews-preview')
  const rows = section.locator('.product-review-list > li')
  await expect(rows).toHaveCount(3)
  await expect(section).toContainText('Mostrando 1–3 de 50 reseñas')
  await section.getByLabel('Página de reseñas').selectOption('17')
  await expect(rows).toHaveCount(2)
  await expect(section).toContainText('Mostrando 49–50 de 50 reseñas')
  await expect(
    section.getByRole('button', { name: 'Siguiente' }),
  ).toBeDisabled()
  await section.getByRole('button', { name: 'Anterior' }).click()
  await expect(rows).toHaveCount(3)
  await section.getByRole('button', { name: /^4 estrellas:/ }).click()
  await expect(section.getByLabel('Página de reseñas')).toHaveValue('1')
  await expect(rows).toHaveCount(3)
})

test('El video respeta movimiento reducido, ofrece control manual y se pausa fuera de vista', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const video = page.locator('.editorial-film video')
  await page.locator('.editorial-film').scrollIntoViewIfNeeded()
  await expect(video).not.toHaveAttribute('src')
  await expect(
    page.getByRole('button', { name: 'Reproducir video editorial' }),
  ).toBeVisible()
  expect(
    await video.evaluate(
      (node: HTMLVideoElement) => node.muted && node.playsInline,
    ),
  ).toBe(true)
  await expect
    .poll(() => video.evaluate((node: HTMLVideoElement) => node.paused))
    .toBe(true)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.reload()
  await expect(video).not.toHaveAttribute('src')
  await video.scrollIntoViewIfNeeded()
  await expect
    .poll(() => video.evaluate((node: HTMLVideoElement) => node.paused))
    .toBe(false)
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect
    .poll(() => video.evaluate((node: HTMLVideoElement) => node.paused))
    .toBe(true)
})

test('El video fallido conserva imagen y acceso a la tienda', async ({
  page,
}) => {
  await page.route('**/videos/*.mp4', (route) => route.abort())
  await page.goto('/')
  await page.locator('.editorial-film').scrollIntoViewIfNeeded()
  await expect(page.locator('.editorial-film-fallback')).toBeVisible()
  await expect(page.locator('.editorial-film img')).toBeVisible()
  await expect(page.locator('.editorial-film a')).toHaveAttribute(
    'href',
    '/tienda',
  )
})

test('Reseñas: filtrar, ordenar, añadir y conservar una opinión local', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/cuenta')
  await page.getByRole('button', { name: 'Ver mi cuenta' }).click()
  await page.goto('/producto/petale-nu')
  await openReviews(page)
  const section = page.locator('.product-reviews-preview')
  await section.scrollIntoViewIfNeeded()
  await section.getByRole('button', { name: /^4 estrellas:/ }).click()
  for (const stars of await section.locator('.product-review-stars').all()) {
    await expect(stars).toHaveAttribute('aria-label', '4 de 5 estrellas')
  }
  await section.getByRole('button', { name: /Ver todas/ }).click()
  await section.getByLabel('Ordenar').selectOption('lowest')
  await expect(
    section.locator('.product-review-stars').first(),
  ).toHaveAttribute('aria-label', '1 de 5 estrellas')
  await section.getByRole('button', { name: 'Escribir una reseña' }).click()
  await expect(
    page.getByRole('dialog', { name: 'Escribir una reseña' }),
  ).toBeVisible()
  await section.getByRole('radio', { name: '5 estrellas', exact: true }).check()
  await section.getByLabel('Nombre visible').fill('Ana')
  await section.getByLabel('Título', { exact: true }).fill('Un aroma suave')
  await section
    .getByLabel('Tu opinión', { exact: true })
    .fill('Me gusta su frescura y lo cómodo que se siente durante el día.')
  await section.getByRole('button', { name: 'Guardar reseña' }).click()
  await expect(section.locator('.review-status')).toHaveText(
    'Tu reseña se guardó en este navegador.',
  )
  await expect(
    section.getByRole('heading', { name: 'Un aroma suave' }),
  ).toBeVisible()
  await page.reload()
  await openReviews(page)
  await expect(
    section.getByRole('heading', { name: 'Un aroma suave' }),
  ).toBeVisible()
  await expect(section.locator('.product-reviews-footer')).toContainText(
    'de 51 reseñas',
  )
})

for (const width of [320, 390, 768, 1440]) {
  test(`Editorial y reseñas sin desbordamiento a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/cuenta')
    await page.getByRole('button', { name: 'Ver mi cuenta' }).click()
    for (const route of ['/', '/producto/petale-nu']) {
      await page.goto(route)
      if (route !== '/') await openReviews(page)
      const section = page.locator(
        route === '/' ? '.editorial-film' : '.product-reviews-preview',
      )
      await section.scrollIntoViewIfNeeded()
      if (route === '/') {
        const bounds = await page.locator('.editorial-film-media').boundingBox()
        const layoutWidth = await page.evaluate(() => document.body.clientWidth)
        expect(bounds?.x).toBe(0)
        expect(bounds?.width).toBe(layoutWidth)
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true)
      if (route !== '/') {
        await section
          .getByRole('button', { name: 'Escribir una reseña' })
          .click()
        const dialog = page.getByRole('dialog', { name: 'Escribir una reseña' })
        await expect(dialog).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(dialog).not.toBeVisible()
        await expect(
          section.getByRole('button', { name: 'Escribir una reseña' }),
        ).toBeFocused()
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true)
      }
    }
  })
}
