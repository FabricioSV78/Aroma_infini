import { expect, test } from '@playwright/test'

for (const width of [320, 768]) {
  test(`El acceso principal del Home cabe en la primera vista de ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 667 })
    await page.goto('/')
    const button = page.locator('.hero-slide.is-active .hero-cta')
    await expect(button).toBeVisible()
    const bottom = await button.evaluate((element) => element.getBoundingClientRect().bottom)
    expect(bottom).toBeLessThanOrEqual(667)
  })
}

test('El aviso del perfume y la ayuda dejan libre la acción de compra en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 })
  await page.goto('/producto/bois-clair')
  await expect(page.locator('.product-popularity-preview')).toBeVisible()
  const overlaps = await page.evaluate(() => {
    const purchase = [...document.querySelectorAll('main button')].find((button) => button.textContent?.includes('Añadir al carrito'))!.getBoundingClientRect()
    const variant = document.querySelector('.product-variants')?.getBoundingClientRect()
    return ['.product-popularity-preview', '.help-button'].map((selector) => {
      const box = document.querySelector(selector)!.getBoundingClientRect()
      const touches = (target: DOMRect) => box.left < target.right && box.right > target.left && box.top < target.bottom && box.bottom > target.top
      return touches(purchase) || Boolean(variant && touches(variant))
    })
  })
  expect(overlaps).toEqual([false, false])
})

test('Las páginas informativas tienen acciones legibles y muestran la tarifa vigente', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of ['/privacidad', '/terminos', '/libro-de-reclamaciones']) {
    await page.goto(path)
    const action = page.locator('.institutional-legal-sections .button')
    await expect(action).toHaveText(/Escríbenos/)
    expect((await action.boundingBox())?.width).toBeGreaterThanOrEqual(140)
  }
  await page.goto('/envios')
  await expect(page.locator('.institutional-shipping-summary')).toContainText('S/ 35')
  await expect(page.locator('.institutional-shipping-summary')).toContainText('S/ 450')
})

test('Los editores de Home y Envíos avisan antes de descartar cambios', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/admin/home')
  await page.getByRole('button', { name: 'Destacados', exact: true }).click()
  await page.getByRole('button', { name: 'Invertir orden' }).click()
  let accept = false
  page.on('dialog', (dialog) => { void (accept ? dialog.accept() : dialog.dismiss()) })
  await page.getByRole('link', { name: 'Pedidos' }).click()
  await expect(page).toHaveURL('/admin/home')
  accept = true
  await page.getByRole('link', { name: 'Envíos' }).click()
  await expect(page).toHaveURL('/admin/envios')
  await page.getByLabel('Tarifa base de courier (S/)').fill('36')
  accept = false
  await page.getByRole('link', { name: 'Pedidos' }).click()
  await expect(page).toHaveURL('/admin/envios')
  await page.getByRole('button', { name: 'Guardar configuración' }).click()
  await expect(page.getByText('Configuración aplicada a la tienda.')).toBeVisible()
  await page.getByRole('link', { name: 'Pedidos' }).click()
  await expect(page).toHaveURL('/admin/pedidos')
})

test('El menú administrativo móvil retiene el foco y oculta el contenido de fondo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin')
  await page.getByRole('button', { name: 'Abrir menú administrativo' }).click()
  await expect(page.locator('#admin-content')).toHaveJSProperty('inert', true)
  await page.locator('.admin-reset').focus()
  await page.keyboard.press('Tab')
  await expect(page.locator('.admin-sidebar-brand')).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(page.locator('.admin-reset')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('#admin-content')).toHaveJSProperty('inert', false)
})

test('Un pedido con datos incompletos se puede completar antes de enviarlo', async ({ page }) => {
  await page.goto('/admin/pedidos/AI-200926-01')
  await expect(page.getByText('Faltan datos de contacto o una dirección verificable.')).toBeVisible()
  await page.getByRole('button', { name: 'Completar datos de entrega' }).click()
  await page.getByLabel('Nombre del cliente').fill('Ana Pérez')
  await page.getByLabel('Correo electrónico').fill('ana@example.invalid')
  await page.getByLabel('Teléfono').fill('999888777')
  await page.getByLabel('Dirección exacta').fill('Calle Los Olivos 123')
  await page.getByRole('button', { name: 'Guardar datos de entrega' }).click()
  await expect(page.getByText('Datos de entrega guardados.')).toBeVisible()
  await page.getByRole('combobox', { name: 'Preparación del pedido' }).selectOption('shipped')
  await expect(page.getByRole('button', { name: 'Guardar estado' })).toBeEnabled()
  await page.getByRole('button', { name: 'Guardar estado' }).click()
  await expect(page.getByText('Estado actualizado en esta sesión.')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Calle Los Olivos 123')).toBeVisible()
})

test('El editor de excepciones se trae a la vista y la lista de productos usa páginas cortas en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/admin/envios')
  await page.getByRole('button', { name: 'Agregar excepción' }).click()
  await expect.poll(() => page.locator('.admin-shipping-editor').evaluate((element) => element.getBoundingClientRect().top)).toBeLessThan(844)
  await page.goto('/admin/productos')
  await expect(page.locator('.admin-table--products tbody tr')).toHaveCount(4)
})
