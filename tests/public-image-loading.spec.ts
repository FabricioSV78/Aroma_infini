import { expect, test } from './test'

for (const width of [390, 1440]) {
  test(`las tarjetas reservan su fotografía durante la carga a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    await page.route('**/images/*.webp', async (route) => {
      await gate
      await route.continue()
    })
    await page.goto('/tienda', { waitUntil: 'domcontentloaded' })
    const link = page.locator('.catalog-listing .product-image-link').first()
    const image = link.locator('> img').first()
    await image.scrollIntoViewIfNeeded()
    await expect(image).toHaveAttribute('data-media-state', 'pending')
    await expect(image).toHaveCSS('visibility', 'visible')
    await expect(image).toHaveCSS('opacity', '1')
    await expect(link.locator('[data-media-placeholder]')).toBeVisible()
    const before = await link.boundingBox()
    release()
    await expect(image).toHaveAttribute('data-media-state', 'ready')
    await expect(link.locator('[data-media-placeholder]')).toHaveCount(0)
    expect(await link.boundingBox()).toEqual(before)
    await expect(image).toHaveAttribute('srcset', /480w/)
    await expect(image).toHaveAttribute('sizes', /vw|px/)
  })
}

test('una alternativa fallida mantiene la fotografía principal al pasar el puntero y usar teclado', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/cedre-alternate-*.webp', (route) => route.fulfill({ status: 404, body: '' }))
  await page.goto('/tienda')
  const link = page.locator('.catalog-listing .product-image-link[href="/producto/bois-clair"]')
  await link.scrollIntoViewIfNeeded()
  await expect(link.locator('.product-image-primary')).toHaveAttribute('data-media-state', 'ready')
  await expect(link.locator('.product-image-alternate')).toHaveAttribute('data-media-state', 'error')
  await link.hover()
  await expect(link.locator('.product-image-primary')).toHaveCSS('opacity', '1')
  await link.focus()
  await expect(link.locator('.product-image-primary')).toHaveCSS('opacity', '1')
  await expect(link).not.toHaveClass(/product-image-link--swap/)
})

test('una fotografía principal fallida ofrece un reemplazo accesible y conserva el enlace', async ({ page }) => {
  await page.route('**/cedre-*.webp', (route) => route.fulfill({ status: 404, body: '' }))
  await page.goto('/tienda')
  const link = page.locator('.catalog-listing .product-image-link[href="/producto/bois-clair"]')
  await link.scrollIntoViewIfNeeded()
  await expect(link.locator('.product-image-primary')).toHaveAttribute('data-media-state', 'error')
  await expect(link.locator('.product-image-primary')).toBeHidden()
  await expect(link.getByRole('img', { name: /Imagen no disponible/ })).toBeVisible()
  await link.click()
  await expect(page).toHaveURL('/producto/bois-clair')
})

test('Nosotros conserva picture, dimensiones y texto alternativo al fallar una imagen', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/editorial-essential-*.webp', async (route) => {
    await gate
    await route.fulfill({ status: 404, body: '' })
  })
  await page.goto('/nosotros', { waitUntil: 'domcontentloaded' })
  const picture = page.locator('.about-hero-media')
  const image = picture.locator('> img')
  await expect(image).toHaveAttribute('data-media-state', 'pending')
  await expect(picture).not.toHaveAttribute('data-media-error', '')
  const before = await picture.boundingBox()
  await expect(picture.locator('> source')).not.toHaveCount(0)
  expect(await picture.locator('> :not(source):not(img)').count()).toBe(0)
  release()
  await expect(image).toHaveAttribute('data-media-state', 'error')
  await expect(picture).toHaveAttribute('data-media-error', '')
  await expect(image).toHaveCSS('opacity', '0')
  await expect(image).toHaveAttribute('alt', /^Imagen no disponible:/)
  expect(await picture.boundingBox()).toEqual(before)
  expect(await picture.evaluate((node) => getComputedStyle(node, '::before').content)).toContain('Imagen no disponible')
})

test('el navegador puede pintar antes de decode y una respuesta tardía no sustituye la nueva fuente', async ({ page }) => {
  await page.goto('/contacto')
  await page.evaluate(async () => {
    const fixturePath = '/tests/public-image-loading.fixture.ts'
    const { mountLoadingImageFixture } = (await import(fixturePath)) as typeof import('./public-image-loading.fixture')
    mountLoadingImageFixture('hold-first')
  })
  const host = page.getByTestId('image-lifecycle-fixture')
  const image = host.locator('img')
  await image.scrollIntoViewIfNeeded()
  await expect(image).toHaveJSProperty('complete', true)
  await expect(image).toHaveAttribute('data-media-state', 'pending')
  expect(await image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await expect(image).toHaveCSS('opacity', '1')
  await expect(image).toHaveCSS('visibility', 'visible')
  await page.getByRole('button', { name: 'Cambiar fotografía de prueba' }).click()
  await expect(image).toHaveAttribute('src', '/images/petale-480.webp')
  await expect(image).toHaveAttribute('data-media-state', 'ready')
  await page.getByRole('button', { name: 'Liberar decodificación de prueba' }).click()
  await expect(image).toHaveAttribute('data-media-state', 'ready')
  await expect(host).toHaveAttribute('data-loads', '2')
  expect(await host.evaluate((node) => getComputedStyle(node, '::before').content)).toBe('none')
})

test('decode rechazado con fotografía completa y válida retira el skeleton', async ({ page }) => {
  await page.goto('/contacto')
  await page.evaluate(async () => {
    const fixturePath = '/tests/public-image-loading.fixture.ts'
    const { mountLoadingImageFixture } = (await import(fixturePath)) as typeof import('./public-image-loading.fixture')
    mountLoadingImageFixture('reject')
  })
  const image = page.getByTestId('image-lifecycle-fixture').locator('img')
  await image.scrollIntoViewIfNeeded()
  await expect(image).toHaveAttribute('data-media-state', 'ready')
  await expect(image).not.toHaveAttribute('aria-busy', 'true')
  expect(await image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
})

test('el error se limita al marco y se limpia al cambiar fuente y desmontar la fotografía', async ({ page }) => {
  await page.goto('/contacto')
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/qa-missing-*.webp', route => route.fulfill({ status: 404, body: '' }))
  await page.route('**/petale-480.webp', async route => {
    await gate
    await route.continue()
  })
  await page.evaluate(async () => {
    const fixturePath = '/tests/public-image-loading.fixture.ts'
    const { mountImageErrorOwnershipFixture } = (await import(fixturePath)) as typeof import('./public-image-loading.fixture')
    mountImageErrorOwnershipFixture()
  })
  const frame = page.getByTestId('image-error-frame-fixture')
  const image = page.locator('#first-error-owner')
  await expect(image).toHaveAttribute('data-media-state', 'error')
  await expect(frame).toHaveAttribute('data-media-error', '')
  await expect(page.locator('[data-media-error]')).toHaveCount(1)
  expect(await frame.evaluate(node => getComputedStyle(node, '::before').content)).toContain('Imagen no disponible')
  const before = await frame.boundingBox()
  await page.getByRole('button', { name: 'Restaurar primera fotografía', exact: true }).click()
  await expect(image).toHaveAttribute('data-media-state', 'pending')
  await expect(frame).not.toHaveAttribute('data-media-error', '')
  expect(await frame.evaluate(node => getComputedStyle(node, '::before').content)).toBe('none')
  release()
  await expect(image).toHaveAttribute('data-media-state', 'ready')
  const after = await frame.boundingBox()
  expect(after?.width).toBe(before?.width)
  expect(after?.height).toBe(before?.height)
  await expect(page.locator('[data-media-error]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Fallar primera fotografía', exact: true }).click()
  await expect(image).toHaveAttribute('data-media-state', 'error')
  await expect(frame).toHaveAttribute('data-media-error', '')
  await page.getByRole('button', { name: 'Desmontar fotografías', exact: true }).click()
  await expect(frame.locator('img')).toHaveCount(0)
  await expect(frame).not.toHaveAttribute('data-media-error', '')
})

test('retirar un error mantiene el fallback mientras otra fotografía comparte el mismo marco fallido', async ({ page }) => {
  await page.goto('/contacto')
  await page.route('**/qa-missing-*.webp', route => route.fulfill({ status: 404, body: '' }))
  await page.evaluate(async () => {
    const fixturePath = '/tests/public-image-loading.fixture.ts'
    const { mountImageErrorOwnershipFixture } = (await import(fixturePath)) as typeof import('./public-image-loading.fixture')
    mountImageErrorOwnershipFixture(true)
  })
  const frame = page.getByTestId('image-error-frame-fixture')
  await expect(page.locator('#first-error-owner')).toHaveAttribute('data-media-state', 'error')
  await expect(page.locator('#second-error-owner')).toHaveAttribute('data-media-state', 'error')
  await expect(frame).toHaveAttribute('data-media-error', '')
  await page.getByRole('button', { name: 'Restaurar primera fotografía', exact: true }).click()
  await expect(page.locator('#first-error-owner')).toHaveAttribute('data-media-state', 'ready')
  await expect(frame).toHaveAttribute('data-media-error', '')
  expect(await frame.evaluate(node => getComputedStyle(node, '::before').content)).toContain('Imagen no disponible')
  await page.getByRole('button', { name: 'Retirar segunda fotografía', exact: true }).click()
  await expect(page.locator('#second-error-owner')).toHaveCount(0)
  await expect(page.locator('#first-error-owner')).toHaveAttribute('data-media-state', 'ready')
  await expect(frame).not.toHaveAttribute('data-media-error', '')
  expect(await frame.evaluate(node => getComputedStyle(node, '::before').content)).toBe('none')
})

test('Hero mantiene tamaño, navegación y CTA mientras carga y si falla su portada', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/hero-*.webp', async (route) => {
    await gate
    await route.fulfill({ status: 404, body: '' })
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const hero = page.locator('.hero')
  const active = hero.locator('.hero-slide.is-active')
  await expect(active.locator('[data-media-placeholder]')).toBeVisible()
  const before = await hero.boundingBox()
  release()
  await expect(active.locator('[data-media-placeholder]')).toHaveAttribute('data-state', 'error')
  expect(await hero.boundingBox()).toEqual(before)
  await expect(active.locator('.hero-cta')).toBeVisible()
  await expect(hero.getByRole('button', { name: 'Diapositiva siguiente' })).toBeEnabled()
})
