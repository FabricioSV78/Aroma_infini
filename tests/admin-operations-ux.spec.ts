import { expect, test } from '@playwright/test'
import { answerAdminNotice } from './admin-notice-fixtures'

test('El resumen permite abrir un estado de pedidos desde todo el indicador', async ({
  page,
}) => {
  await page.goto('/admin')
  const indicator = page
    .locator('.admin-order-overview dl > div')
    .filter({ hasText: 'Nuevos' })
  await indicator.click({ position: { x: 8, y: 8 } })
  await expect(page).toHaveURL(/\/admin\/pedidos\?preparacion=received$/)
})

for (const width of [768, 1024]) {
  test(`La edición de entrega conserva campos legibles a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1024 })
    await page.goto('/admin/pedidos/AI-210926-01')
    await page
      .getByRole('button', { name: 'Completar datos de entrega' })
      .click()
    const geometry = await page.evaluate(() => {
      const layout = document.querySelector('.admin-order-layout')
      const primary = document.querySelector('.admin-order-primary')
      const delivery = document.querySelector(
        '.admin-order-primary > section:last-child',
      )
      const editor = document.querySelector('.admin-delivery-editor')
      const input = document.querySelector<HTMLInputElement>(
        '.admin-delivery-editor input',
      )
      return {
        layout: layout ? getComputedStyle(layout).display : '',
        primary: primary ? getComputedStyle(primary).display : '',
        layoutWidth: layout?.getBoundingClientRect().width ?? 0,
        deliveryWidth: delivery?.getBoundingClientRect().width ?? 0,
        editorWidth: editor?.getBoundingClientRect().width ?? 0,
        editorColumns: editor
          ? getComputedStyle(editor).gridTemplateColumns
          : '',
        nameWidth: input?.getBoundingClientRect().width ?? 0,
      }
    })
    expect(geometry.nameWidth, JSON.stringify(geometry)).toBeGreaterThanOrEqual(
      220,
    )
  })
}

test('Clientes permite buscar y abrir solo los pedidos de ese cliente', async ({
  page,
}) => {
  await page.goto('/admin/clientes')
  const search = page.getByRole('searchbox', { name: 'Buscar cliente' })
  await search.fill('Miraflores')
  await expect(page.locator('.admin-customers-page tbody tr')).toHaveCount(2)
  await page.getByRole('link', { name: 'Ver pedidos de Cliente 01' }).click()
  await expect(page).toHaveURL(/\/admin\/pedidos\?cliente=customer-demo-1$/)
  await expect(page.locator('.admin-orders-page tbody tr')).toHaveCount(1)
  await expect(page.locator('.admin-orders-page tbody tr')).toContainText(
    'Cliente 01',
  )
})

test('Un pedido heredado conserva ubicación al completar la entrega y se puede enviar', async ({
  page,
}) => {
  await page.goto('/admin/pedidos/AI-210926-01')
  await page.getByRole('button', { name: 'Completar datos de entrega' }).click()

  const editor = page.locator('.admin-delivery-editor')
  await expect(editor.getByLabel('Zona de entrega')).toHaveValue('lima')
  await expect(editor.getByLabel('Provincia')).toHaveCount(0)
  await expect(
    editor.getByLabel('Distrito').locator('option:checked'),
  ).toHaveText('San Isidro')

  await editor.getByLabel('Nombre del cliente').fill('Ana Valdez')
  await editor.getByLabel('Correo electrónico').fill('ana@ejemplo.com')
  await editor.getByLabel('Teléfono').fill('999888777')
  await editor.getByLabel('Dirección exacta').fill('Av. Los Cedros 123')
  await editor.getByRole('button', { name: 'Guardar datos de entrega' }).click()
  await expect(page.getByText('Datos de entrega guardados.')).toBeVisible()
  await expect(page.getByText('Completos', { exact: true })).toBeVisible()

  await page.getByText('Resumen de envío', { exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Imprimir resumen' }),
  ).toBeEnabled()
  await expect(page.locator('.admin-shipping-sheet')).toContainText(
    'San Isidro',
  )

  const status = page.getByRole('combobox', { name: 'Preparación del pedido' })
  await page.getByLabel('Responsable de los cambios').fill('Ana Operaciones')
  await status.selectOption('preparing')
  await page.getByRole('button', { name: 'Guardar estado' }).click()
  await expect(page.getByText('Estado actualizado.')).toBeVisible()
  await status.selectOption('shipped')
  await page.getByRole('button', { name: 'Guardar estado' }).click()
  await answerAdminNotice(page, 'accept')
  await expect(page.getByText('Enviado', { exact: true }).first()).toBeVisible()
})

test('Un pedido histórico fuera de cobertura conserva su destino al corregir el contacto', async ({
  page,
}) => {
  await page.goto('/admin/pedidos/AI-150926-01')
  await page.getByRole('button', { name: 'Completar datos de entrega' }).click()
  const editor = page.locator('.admin-delivery-editor')
  await expect(editor).toContainText(
    'destino histórico fuera de la cobertura actual',
  )
  await expect(editor.getByLabel('Zona de entrega')).toHaveCount(0)
  await editor.getByLabel('Nombre del cliente').fill('Ana Valdez')
  await editor.getByLabel('Correo electrónico').fill('ana@ejemplo.com')
  await editor.getByLabel('Teléfono').fill('999888777')
  await editor.getByLabel('Dirección exacta').fill('Av. Los Cedros 123')
  await editor.getByRole('button', { name: 'Guardar datos de entrega' }).click()
  await expect(page.getByText('Datos de entrega guardados.')).toBeVisible()
  await expect(page.locator('.admin-page--order-detail')).toContainText('Cayma')
})

test('Marcas genera una URL entendible desde el nombre', async ({ page }) => {
  await page.goto('/admin/marcas')
  await page.getByRole('button', { name: 'Nueva marca' }).click()
  await expect(page.getByRole('heading', { name: 'Nueva marca' })).toBeFocused()
  await page.getByLabel('Nombre', { exact: true }).fill('Casa Élite')
  await expect(page.getByLabel('URL de la marca')).toHaveValue('casa-elite')
  await page.getByRole('button', { name: 'Guardar marca' }).click()
  await expect(page.getByText('Marca guardada.')).toBeVisible()
  await expect(page.locator('.admin-brands-page tbody')).toContainText(
    'Casa élite',
  )
})

test('Promociones muestra vigencia y límite junto al código', async ({
  page,
}) => {
  await page.goto('/admin/promociones')
  await expect(
    page.getByRole('heading', { name: 'Aún no hay códigos' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Nueva promoción' }).click()
  await page.getByLabel('Código').fill('AROMA12')
  await page.getByLabel('Inicio').fill('2099-01-01T09:00')
  await page.getByLabel('Final').fill('2099-01-31T09:00')
  await page.getByLabel('Límite de usos').fill('25')
  await page.getByLabel('Promoción activa').check()
  await page.getByRole('button', { name: 'Guardar promoción' }).click()
  const promotion = page
    .locator('.admin-promotion-list > li')
    .filter({ hasText: 'AROMA12' })
  await expect(promotion).toContainText('0/25 usos')
  await expect(promotion).toContainText('Vigencia:')
  await expect(promotion).toContainText('Programada')
})

for (const width of [1600, 1280, 820, 390]) {
  test(`Operaciones ${width}px sin desbordamiento horizontal`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    for (const [name, path] of [
      ['pedidos', '/admin/pedidos'],
      ['detalle', '/admin/pedidos/AI-210926-01'],
      ['clientes', '/admin/clientes'],
      ['marcas', '/admin/marcas'],
      ['promociones', '/admin/promociones'],
    ]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const dimensions = await page.evaluate(() => ({
        content: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }))
      expect(dimensions.content, `${name} ${width}px`).toBeLessThanOrEqual(
        dimensions.viewport + 1,
      )
      await page.screenshot({
        path: `artifacts/admin-ux-${name}-${width}.png`,
        fullPage: true,
      })
    }
  })
}
