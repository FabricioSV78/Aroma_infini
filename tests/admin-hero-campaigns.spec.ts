import { Buffer } from 'node:buffer'
import { mkdir } from 'node:fs/promises'
import { expect, test, type Page } from './test'
import { answerAdminNotice } from './admin-notice-fixtures'

const captures = 'artifacts/hero-campaigns-2026-11-04/admin-screenshots'
const campaigns = (page: Page) =>
  page.locator('.admin-home-slide-picker button')
const preview = (page: Page) =>
  page.getByRole('dialog', { name: 'Vista previa · Carrusel principal' })

async function openEditor(page: Page) {
  await page.goto('/admin/home')
  await expect(
    page.getByRole('heading', { name: 'Editar campaña', exact: true }),
  ).toBeVisible()
  await expect(campaigns(page)).toHaveCount(5)
}
async function save(page: Page) {
  await page
    .getByRole('button', { name: 'Guardar cambios del Home', exact: true })
    .click()
  await expect(page.locator('.admin-home-savebar')).toContainText(
    'Todo guardado',
  )
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
}

test('crea campañas ocultas y conserva el borrador publicado al guardar y recargar', async ({
  page,
}) => {
  await openEditor(page)
  await page.getByRole('button', { name: 'Nueva campaña', exact: true }).click()
  await expect(campaigns(page)).toHaveCount(6)
  await expect(
    page.getByLabel('Estado de campaña', { exact: true }),
  ).toHaveValue('hidden')
  await page
    .getByRole('button', { name: 'Abrir vista previa', exact: true })
    .click()
  await expect(preview(page).getByText('Borrador · Sin publicar')).toBeVisible()
  await expect(
    preview(page).locator('.admin-home-hero-preview img'),
  ).toHaveCount(0)
  await expect(
    preview(page).getByText('Sube una imagen para revisar esta campaña.'),
  ).toBeVisible()
  await preview(page)
    .getByRole('button', { name: 'Cerrar', exact: true })
    .click()
  await save(page)
  await page.reload()
  await expect(campaigns(page)).toHaveCount(6)
  await campaigns(page).last().click()
  await expect(
    page.getByLabel('Estado de campaña', { exact: true }),
  ).toHaveValue('hidden')
  await expect(page.getByRole('textbox', { name: /^Título/ })).toHaveValue('')
  await page.getByRole('link', { name: 'Ver en tienda ↗', exact: true }).click()
  await expect(page.locator('.hero-slide')).toHaveCount(5)
})

test('reordena por identidad y elimina con confirmación sin perder las campañas restantes', async ({
  page,
}) => {
  await openEditor(page)
  await page.getByRole('button', { name: 'Bajar campaña', exact: true }).click()
  await expect(campaigns(page).nth(1)).toContainText('Una fragancia')
  await expect(page.getByRole('textbox', { name: /^Título/ })).toHaveValue(
    /Una fragancia/,
  )
  await page.getByRole('button', { name: 'Subir campaña', exact: true }).click()
  await expect(campaigns(page).first()).toContainText('Una fragancia')
  await page
    .getByRole('button', { name: 'Eliminar campaña', exact: true })
    .click()
  await answerAdminNotice(page, 'accept', 'Eliminar campaña')
  await expect(campaigns(page)).toHaveCount(4)
  await save(page)
  await page.reload()
  await expect(campaigns(page)).toHaveCount(4)
  await expect(campaigns(page).first()).toContainText('Lo sutil también')
})

test('el botón guarda una referencia de producto, permite buscar por SKU y refleja un producto oculto', async ({
  page,
}) => {
  await openEditor(page)
  await page
    .getByLabel('Destino del botón', { exact: true })
    .selectOption('product')
  const product = page.getByLabel('Producto de destino', { exact: true })
  const bois = product
    .locator('option')
    .filter({ hasText: 'Bois Clair' })
    .first()
  const productId = await bois.getAttribute('value')
  expect(productId).toBeTruthy()
  const label = await bois.textContent()
  const sku = label?.match(/SKU\s+(\S+)/)?.[1]
  await page
    .getByLabel('Buscar producto por nombre o SKU', { exact: true })
    .fill(sku ?? 'Bois Clair')
  await product.selectOption(productId!)
  await page
    .getByRole('textbox', { name: 'Texto del botón', exact: true })
    .fill('Descubrir Bois')
  await page
    .getByRole('button', { name: 'Abrir vista previa', exact: true })
    .click()
  await expect(
    preview(page).getByRole('link', { name: 'Descubrir Bois', exact: true }),
  ).toHaveAttribute('href', '/producto/bois-clair')
  await preview(page)
    .getByRole('button', { name: 'Cerrar', exact: true })
    .click()
  await save(page)
  await page.reload()
  await expect(
    page.getByLabel('Producto de destino', { exact: true }),
  ).toHaveValue(productId!)
  await page.evaluate(async (id) => {
    const source = '/src/services/admin-service.ts'
    const { adminService } = await import(source)
    adminService.setProductActive(id, false)
  }, productId!)
  await expect(page.locator('.admin-hero-warning')).toContainText(
    'El producto no está publicado',
  )
  await page
    .getByRole('button', { name: 'Abrir vista previa', exact: true })
    .click()
  await expect(
    preview(page).getByRole('link', { name: 'Descubrir Bois', exact: true }),
  ).toHaveCount(0)
})

test('categorías y páginas internas no requieren URLs y pueden ocultarse los textos o el botón', async ({
  page,
}) => {
  await openEditor(page)
  await page
    .getByLabel('Destino del botón', { exact: true })
    .selectOption('category')
  await page
    .getByLabel('Categoría de destino', { exact: true })
    .selectOption('mujer')
  await page
    .getByRole('button', { name: 'Abrir vista previa', exact: true })
    .click()
  await expect(
    preview(page).locator('.admin-home-hero-preview-cta'),
  ).toHaveAttribute('href', '/tienda?genero=mujer')
  await preview(page)
    .getByRole('button', { name: 'Cerrar', exact: true })
    .click()
  await page
    .getByLabel('Destino del botón', { exact: true })
    .selectOption('page')
  await page
    .getByLabel('Página de destino', { exact: true })
    .selectOption('/contacto')
  await page.getByLabel('Mostrar textos', { exact: true }).uncheck()
  await page.getByLabel('Mostrar botón', { exact: true }).uncheck()
  await page
    .getByRole('button', { name: 'Abrir vista previa', exact: true })
    .click()
  await expect(
    preview(page).locator('.admin-home-hero-preview-copy'),
  ).toHaveCount(0)
  await preview(page)
    .getByRole('button', { name: 'Cerrar', exact: true })
    .click()
  await save(page)
  await page.reload()
  await expect(
    page.getByLabel('Mostrar textos', { exact: true }),
  ).not.toBeChecked()
  await expect(
    page.getByLabel('Mostrar botón', { exact: true }),
  ).not.toBeChecked()
})

test('prepara un MP4 con portada, reproduce una sola vista previa y conserva las fuentes tras guardar', async ({
  page,
}) => {
  await openEditor(page)
  await page
    .getByLabel('Tipo de contenido', { exact: true })
    .selectOption('video')
  await page
    .getByLabel('Subir video de campaña 1', { exact: true })
    .setInputFiles('public/videos/perfume-editorial-wide.mp4')
  await expect(
    page.getByRole('button', { name: 'Quitar video', exact: true }),
  ).toBeVisible({ timeout: 20000 })
  await page
    .getByRole('button', { name: 'Abrir vista previa', exact: true })
    .click()
  const video = preview(page).locator('video')
  await expect(video).toHaveAttribute('src', /^data:video\/mp4;base64,/)
  await expect(video).toHaveAttribute('poster', /^data:image\/webp;base64,/)
  await preview(page)
    .getByRole('button', { name: 'Reproducir vista previa', exact: true })
    .click()
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.paused))
    .toBe(false)
  await preview(page)
    .getByRole('button', { name: 'Pausar vista previa', exact: true })
    .click()
  await expect
    .poll(() => video.evaluate((element: HTMLVideoElement) => element.paused))
    .toBe(true)
  await preview(page)
    .getByRole('button', { name: 'Cerrar', exact: true })
    .click()
  await expect(page.locator('.admin-home-hero-preview video')).toHaveCount(0)
  await save(page)
  await page.reload()
  await expect(
    page.getByLabel('Tipo de contenido', { exact: true }),
  ).toHaveValue('video')
  await expect(
    page.getByRole('button', { name: 'Quitar video', exact: true }),
  ).toBeVisible()
  await page
    .getByLabel('Subir video móvil de campaña 1', { exact: true })
    .setInputFiles('public/videos/perfume-editorial-mobile.mp4')
  await expect(
    page.getByRole('button', { name: 'Usar video principal', exact: true }),
  ).toBeVisible({ timeout: 20000 })
})

test('rechaza videos incompatibles y demasiado grandes sin perder textos ni la configuración anterior', async ({
  page,
}) => {
  await openEditor(page)
  await page
    .getByRole('textbox', { name: /^Título/ })
    .fill('Campaña que se conserva')
  await page
    .getByLabel('Tipo de contenido', { exact: true })
    .selectOption('video')
  await page
    .getByLabel('Subir video de campaña 1', { exact: true })
    .setInputFiles({
      name: 'incompatible.webm',
      mimeType: 'video/webm',
      buffer: Buffer.from('fixture'),
    })
  await expect(page.locator('.admin-notice-dialog')).toContainText('MP4')
  await page.keyboard.press('Escape')
  await expect(page.locator('.admin-notice-dialog')).not.toBeVisible()
  await expect(page.getByRole('textbox', { name: /^Título/ })).toHaveValue(
    'Campaña que se conserva',
  )
  await page
    .getByLabel('Subir video de campaña 1', { exact: true })
    .setInputFiles({
      name: 'demasiado-grande.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
    })
  await expect(page.locator('.admin-notice-dialog')).toContainText('10 MB')
  await page.keyboard.press('Escape')
  await expect(page.locator('.admin-notice-dialog')).not.toBeVisible()
  await expect(page.getByRole('textbox', { name: /^Título/ })).toHaveValue(
    'Campaña que se conserva',
  )
  await expect(
    page.getByRole('button', { name: 'Quitar video', exact: true }),
  ).toHaveCount(0)
})

test('limita el carrusel a diez campañas sin eliminar las anteriores', async ({
  page,
}) => {
  await openEditor(page)
  for (let index = 5; index < 10; index++)
    await page
      .getByRole('button', { name: 'Nueva campaña', exact: true })
      .click()
  await expect(campaigns(page)).toHaveCount(10)
  await expect(
    page.getByRole('button', { name: 'Nueva campaña', exact: true }),
  ).toBeDisabled()
  await expect(campaigns(page).first()).toContainText('Una fragancia')
})

for (const viewport of [
  { name: 'monitor', width: 1920, height: 1080 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`editor y vista previa mantienen composición en ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await openEditor(page)
    await mkdir(captures, { recursive: true })
    await page.evaluate(() => document.fonts.ready)
    await expect(campaigns(page).first().locator('span')).toBeVisible()
    await noOverflow(page)
    await page.screenshot({
      path: `${captures}/editor-${viewport.name}.png`,
      fullPage: true,
    })
    await page
      .getByRole('button', { name: 'Abrir vista previa', exact: true })
      .click()
    await expect(
      preview(page).locator('.admin-home-hero-preview'),
    ).toBeVisible()
    await noOverflow(page)
    await page.screenshot({
      path: `${captures}/preview-${viewport.name}.png`,
      fullPage: true,
    })
    await preview(page)
      .getByRole('button', { name: 'Móvil', exact: true })
      .click()
    await expect(preview(page).locator('.admin-home-hero-preview')).toHaveClass(
      /--mobile/,
    )
    await noOverflow(page)
    await preview(page)
      .getByRole('button', { name: 'Cerrar', exact: true })
      .click()
    await page
      .getByLabel('Tipo de contenido', { exact: true })
      .selectOption('video')
    await noOverflow(page)
    await page.screenshot({
      path: `${captures}/video-editor-${viewport.name}.png`,
      fullPage: true,
    })
  })
}
