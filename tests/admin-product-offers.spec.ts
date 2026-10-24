import { expect, test } from '@playwright/test'
import { answerAdminNotice } from './admin-notice-fixtures'

test('Las pestañas de promociones se recorren con el teclado', async ({
  page,
}) => {
  await page.goto('/admin/promociones')
  const coupons = page.getByRole('tab', { name: 'Cupones' })
  const offers = page.getByRole('tab', { name: 'Ofertas de productos' })
  await coupons.focus()
  await coupons.press('ArrowRight')
  await expect(offers).toBeFocused()
  await expect(offers).toHaveAttribute('aria-selected', 'true')
  await offers.press('Home')
  await expect(coupons).toBeFocused()
  await expect(coupons).toHaveAttribute('aria-selected', 'true')
})

test('El panel calcula, edita, desactiva y retira una oferta por presentación', async ({
  page,
}) => {
  await page.goto('/admin/promociones')
  await expect(
    page.getByRole('heading', { name: 'Aún no hay códigos' }),
  ).toBeVisible()
  await page.getByRole('tab', { name: 'Ofertas de productos' }).click()
  await expect(page).toHaveURL(/vista=ofertas/)

  await page.getByRole('button', { name: 'Crear oferta de producto' }).click()
  const editor = page.locator('.admin-offers-editor')
  await editor.getByLabel('Producto').selectOption('cedre')
  await editor.getByLabel('Descuento (%)').fill('20')
  await editor
    .getByRole('button', { name: 'Ver precios finales por presentación' })
    .click()
  const pricePreview = page.getByRole('dialog', {
    name: 'Precios por presentación',
  })
  await expect(
    pricePreview.locator('.admin-offers-preview-list'),
  ).toContainText('S/ 312')
  await expect(
    pricePreview.locator('.admin-offers-preview-list'),
  ).toContainText('S/ 472')
  await pricePreview.getByRole('button', { name: 'Cerrar' }).click()
  await editor.getByRole('button', { name: 'Guardar oferta' }).click()

  const offer = page
    .locator('.admin-offers-list > li')
    .filter({ hasText: 'Bois Clair' })
  await expect(offer).toContainText('En oferta')
  await expect(offer).toContainText('S/ 312')
  await page.goto('/admin/productos')
  const productRow = page
    .locator('.admin-table--products tbody tr')
    .filter({ hasText: 'Bois Clair' })
  await expect(productRow).toContainText('Oferta')
  await expect(productRow).toContainText('S/ 312')
  await page.goto('/admin/promociones?vista=ofertas')

  await offer.getByRole('button', { name: 'Editar oferta' }).click()
  await editor.getByLabel('Tipo de descuento').selectOption('fixed')
  await editor.getByLabel('Descuento (S/)').fill('40')
  await editor
    .getByRole('button', { name: 'Ver precios finales por presentación' })
    .click()
  await expect(
    pricePreview.locator('.admin-offers-preview-list'),
  ).toContainText('S/ 350')
  await expect(
    pricePreview.locator('.admin-offers-preview-list'),
  ).toContainText('S/ 550')
  await pricePreview.getByRole('button', { name: 'Cerrar' }).click()
  await editor.getByRole('button', { name: 'Guardar oferta' }).click()
  await expect(offer).toContainText('S/ 350')

  await offer.getByRole('button', { name: 'Desactivar' }).click()
  await expect(offer).toContainText('Desactivada')
  await expect(offer).toContainText('S/ 390')
  await offer.getByRole('button', { name: 'Activar' }).click()
  await expect(offer).toContainText('En oferta')

  await offer.getByRole('button', { name: 'Editar oferta' }).click()
  await editor.getByRole('button', { name: 'Retirar oferta' }).click()
  await answerAdminNotice(page, 'accept')
  await expect(
    page.getByRole('heading', { name: 'Aún no hay productos en oferta' }),
  ).toBeVisible()
})

test('El panel programa fechas y evita descuentos mayores al precio', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2030-02-01T09:59:30') })
  await page.goto('/admin/promociones?vista=ofertas')
  await page.getByRole('button', { name: 'Crear oferta de producto' }).click()
  const editor = page.locator('.admin-offers-editor')
  await editor.getByLabel('Producto').selectOption('cedre')
  await editor.getByLabel('Tipo de descuento').selectOption('fixed')
  await editor.getByLabel('Descuento (S/)').fill('390')
  await expect(
    editor.getByRole('button', { name: 'Guardar oferta' }),
  ).toBeDisabled()
  await expect(editor.getByRole('alert')).toContainText('sin dejar en cero')

  await editor.getByLabel('Descuento (S/)').fill('40')
  await editor.getByLabel('Inicio (opcional)').fill('2030-02-01T10:00')
  await editor.getByLabel('Fin (opcional)').fill('2030-02-01T10:01')
  await editor.getByRole('button', { name: 'Guardar oferta' }).click()
  const offer = page
    .locator('.admin-offers-list > li')
    .filter({ hasText: 'Bois Clair' })
  await expect(offer).toContainText('Programada')
  // Verify the persisted browser state through the actual admin workflow.
  // A separate dynamic import can instantiate a second Vite module during HMR.
  await page.reload()
  await expect(offer).toContainText('Programada')
  await offer.getByRole('button', { name: 'Editar oferta' }).click()
  await expect(editor.getByLabel('Inicio (opcional)')).toHaveValue(
    '2030-02-01T10:00',
  )
  await expect(editor.getByLabel('Fin (opcional)')).toHaveValue(
    '2030-02-01T10:01',
  )
  await editor.getByRole('button', { name: 'Cancelar' }).click()
  await page.clock.runFor(31_000)
  await expect(offer).toContainText('En oferta')
  await page.clock.runFor(60_000)
  await expect(offer).toContainText('Vencida')
})

for (const size of [
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'laptop', width: 1366, height: 768 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`Vista previa de ofertas legible en ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height })
    await page.goto('/admin/promociones?vista=ofertas')
    await page.getByRole('button', { name: 'Crear oferta de producto' }).click()
    const editor = page.locator('.admin-offers-editor')
    await editor.getByLabel('Producto').selectOption('cedre')
    await editor
      .getByRole('button', { name: 'Ver precios finales por presentación' })
      .click()
    await expect(
      page.getByRole('dialog').locator('.admin-offers-preview-list'),
    ).toContainText('S/ 351')
    const geometry = await page.evaluate(() => ({
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      editorWidth:
        document.querySelector('.admin-offers-editor')?.getBoundingClientRect()
          .width ?? 0,
    }))
    expect(geometry.pageWidth, JSON.stringify(geometry)).toBeLessThanOrEqual(
      geometry.viewportWidth + 1,
    )
    expect(geometry.editorWidth).toBeGreaterThan(280)
    await page.screenshot({
      path: `artifacts/discount-ui/${size.name}-admin-offer-preview.png`,
      fullPage: true,
      animations: 'disabled',
    })
  })
}
