import { expect, test, type Page } from '@playwright/test'

declare const process: { env: Record<string, string | undefined> }

const stage = process.env.ADMIN_AUDIT_STAGE
const shouldCapture = stage === 'before' || stage === 'after'
const onlyViewport = process.env.ADMIN_AUDIT_VIEWPORT

const viewports = [
  { name: 'monitor-1920', width: 1920, height: 1080 },
  { name: 'laptop-1366', width: 1366, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
] as const

const routes = [
  { name: 'dashboard', path: '/admin' },
  { name: 'productos', path: '/admin/productos' },
  { name: 'producto-nuevo', path: '/admin/productos/nuevo' },
  { name: 'producto-editar', path: '/admin/productos/cedre' },
  { name: 'pedidos', path: '/admin/pedidos' },
  { name: 'pedido-detalle', path: '/admin/pedidos/AI-210926-01' },
  { name: 'clientes', path: '/admin/clientes' },
  { name: 'marcas', path: '/admin/marcas' },
  { name: 'promociones', path: '/admin/promociones' },
  { name: 'envios', path: '/admin/envios' },
  { name: 'home-hero', path: '/admin/home' },
] as const

async function capture(page: Page, path: string, fullPage = true) {
  await page.evaluate(async () => {
    const focused = document.activeElement
    if (focused instanceof HTMLElement) focused.blur()
    window.scrollTo(0, 0)
    await document.fonts.ready
    await Promise.all(
      Array.from(document.images, async (img) => {
        img.loading = 'eager'
        await img.decode().catch(() => undefined)
      }),
    )
  })
  await page.screenshot({ path, fullPage, animations: 'disabled' })
}

test.skip(
  !shouldCapture,
  'Capture manually with ADMIN_AUDIT_STAGE=before or after',
)

test('Capturas completas del panel administrativo en cinco tamaños', async ({
  page,
}) => {
  test.setTimeout(900_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })

  for (const viewport of viewports) {
    if (onlyViewport && viewport.name !== onlyViewport) continue
    await page.setViewportSize(viewport)
    const base = `artifacts/admin-audit/${stage}/${viewport.name}`

    for (const route of routes) {
      await page.goto(route.path)
      await expect(page.locator('#admin-content h1')).toBeVisible()
      await capture(page, `${base}/${route.name}.png`)
    }

    for (const [label, name] of [
      ['Franja superior', 'home-franja'],
      ['Para él, para ella y unisex', 'home-categorias'],
      ['Marcas', 'home-marcas'],
      ['Video editorial', 'home-video'],
      ['Encuentra tu perfume ideal', 'home-recomendador'],
    ] as const) {
      const tab = page
        .getByRole('group', { name: 'Apartados del Home', exact: true })
        .getByRole('button', { name: label, exact: true })
      await tab.click()
      await expect(tab).toHaveAttribute('aria-pressed', 'true')
      await capture(page, `${base}/${name}.png`)
    }

    if (viewport.width < 1024) {
      await page
        .getByRole('button', { name: /Abrir menú administrativo/ })
        .click()
      await expect(
        page.getByRole('dialog', { name: 'Menú administrativo' }),
      ).toBeVisible()
      await capture(page, `${base}/menu-abierto.png`, false)
      await page.keyboard.press('Escape')
    }
  }
})

test('Estados interactivos del panel administrativo en cinco tamaños', async ({
  page,
}) => {
  test.setTimeout(600_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })

  for (const viewport of viewports) {
    if (onlyViewport && viewport.name !== onlyViewport) continue
    await page.setViewportSize(viewport)
    const base = `artifacts/admin-audit/${stage}/${viewport.name}`

    await page.goto('/admin/productos')
    await page
      .getByText('Importar productos con Excel', { exact: true })
      .click()
    await expect(
      page.getByRole('button', { name: 'Descargar plantilla .xlsx' }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Subir Excel' }),
    ).toBeVisible()
    await capture(page, `${base}/excel-abierto.png`)

    await page.goto('/admin/home')
    const finderTab = page
      .getByRole('group', { name: 'Apartados del Home', exact: true })
      .getByRole('button', { name: 'Encuentra tu perfume ideal', exact: true })
    await finderTab.click()
    await expect(finderTab).toHaveAttribute('aria-pressed', 'true')
    const questions = page.getByRole('button', {
      name: 'Preguntas y opciones',
      exact: true,
    })
    await questions.click()
    await expect(questions).toHaveAttribute('aria-pressed', 'true')
    await expect(
      page.getByRole('combobox', { name: 'Paso del cuestionario' }),
    ).toBeVisible()
    await capture(page, `${base}/home-preguntas-opciones.png`)

    await page.goto('/admin/envios')
    await page
      .getByRole('button', { name: 'Agregar tarifa por distrito' })
      .click()
    await expect(page.locator('.admin-shipping-editor')).toBeVisible()
    await capture(page, `${base}/envios-tarifa-distrito.png`)

    await page.goto('/admin/pedidos/AI-210926-01')
    await page.locator('.admin-shipping-summary-panel > summary').click()
    await expect(page.locator('.admin-shipping-sheet')).toBeVisible()
    await capture(page, `${base}/pedido-resumen-envio.png`)
    await page.getByRole('button', { name: /datos de entrega/ }).click()
    await expect(page.locator('.admin-delivery-editor')).toBeVisible()
    await capture(page, `${base}/pedido-editar-entrega.png`)
  }
})

test('Formularios de marcas, promociones y vista previa de producto', async ({
  page,
}) => {
  test.setTimeout(300_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })

  for (const viewport of viewports) {
    if (onlyViewport && viewport.name !== onlyViewport) continue
    await page.setViewportSize(viewport)
    const base = `artifacts/admin-audit/${stage}/${viewport.name}`

    await page.goto('/admin/marcas')
    await page.getByRole('button', { name: 'Nueva marca' }).click()
    await expect(
      page.getByRole('heading', { name: 'Nueva marca' }),
    ).toBeVisible()
    await capture(page, `${base}/marca-formulario.png`)

    await page.goto('/admin/promociones')
    const coupons = page.getByRole('tab', { name: 'Cupones', exact: true })
    await coupons.click()
    await expect(coupons).toHaveAttribute('aria-selected', 'true')
    await page.getByRole('button', { name: 'Nueva promoción' }).click()
    await expect(
      page.getByRole('heading', { name: 'Nueva promoción' }),
    ).toBeVisible()
    await capture(page, `${base}/promocion-formulario.png`)

    await page.goto('/admin/productos/cedre')
    await page
      .getByRole('button', { name: 'Vista previa', exact: true })
      .click()
    const preview = page.getByRole('dialog', {
      name: 'Vista previa del producto',
    })
    await expect(preview).toBeVisible()
    await expect(
      preview.getByRole('heading', { name: 'Bois Clair' }),
    ).toBeVisible()
    await expect(
      preview.getByRole('button', { name: 'Añadir al carrito' }),
    ).toBeVisible()
    await capture(page, `${base}/producto-vista-previa.png`)
    await page.keyboard.press('Escape')
    await expect(preview).not.toBeVisible()
  }
})
