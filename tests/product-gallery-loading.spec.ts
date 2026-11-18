import { expect, test } from './test'

for (const width of [390, 768, 1440]) {
  test(`la galería reserva su espacio y muestra una carga discreta a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    let release!: () => void
    const blocked = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/images/*.webp', async (route) => {
      await blocked
      await route.continue()
    })
    await page.goto('/producto/bois-clair', { waitUntil: 'domcontentloaded' })
    const frame = page.locator('.product-gallery-frame').first()
    const photo = frame.locator('img')
    const placeholder = frame.locator('[data-image-placeholder]')
    await expect(placeholder).toBeVisible()
    await expect(photo).toHaveAttribute('aria-busy', 'true')
    const before = await frame.boundingBox()
    expect(before?.height).toBeGreaterThan(100)
    await page.screenshot({ path: `artifacts/gallery-loading-${width}.png` })
    release()
    await expect(photo).toHaveAttribute('data-state', 'ready')
    await expect(placeholder).not.toBeVisible()
    const after = await frame.boundingBox()
    expect(after?.width).toBe(before?.width)
    expect(after?.height).toBe(before?.height)
    expect(
      await photo.evaluate((image) => (image as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true)
  })
}

test('una descarga fallida conserva la galería y ofrece un reemplazo accesible sin icono roto', async ({
  page,
}) => {
  await page.route('**/images/*.webp', (route) =>
    route.fulfill({ status: 404, body: '' }),
  )
  await page.goto('/producto/bois-clair')
  const frame = page.locator('.product-gallery-frame').first()
  await expect(frame.locator('img')).toHaveAttribute('data-state', 'error')
  await expect(frame.locator('img')).toBeHidden()
  await expect(
    frame.getByRole('img', { name: /Imagen no disponible/ }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Añadir al carrito', exact: true }),
  ).toBeEnabled()
  await page
    .getByRole('button', { name: 'Ver imagen 2 de 4', exact: true })
    .filter({ visible: true })
    .click()
  await expect(page.locator('.product-gallery-frame').nth(1)).toHaveClass(
    /is-active/,
  )
})

test('miniaturas y fotos comparten la variante correcta y una sola descarga por foto', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const requests: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'image') requests.push(request.url())
  })
  await page.goto('/producto/bois-clair')
  const photos = page.locator('.product-gallery-frame img')
  await expect(photos).toHaveCount(4)
  for (let index = 0; index < 4; index++) {
    const thumbnail = page.locator('.product-thumbnail').nth(index)
    await thumbnail.focus()
    await page.keyboard.press('Enter')
    await expect(photos.nth(index)).toHaveAttribute('data-state', 'ready')
    const source = await photos
      .nth(index)
      .evaluate((image) => (image as HTMLImageElement).currentSrc)
    await expect
      .poll(() =>
        thumbnail
          .locator('img')
          .evaluate((image) => (image as HTMLImageElement).currentSrc),
      )
      .toBe(source)
    expect(requests.filter((url) => url === source)).toHaveLength(1)
    await expect(thumbnail).toHaveAttribute('aria-current', 'true')
  }
  await page.reload()
  await expect(photos.first()).toHaveAttribute('data-state', 'ready')
  await expect(photos.first()).not.toHaveAttribute('aria-busy', 'true')
})
