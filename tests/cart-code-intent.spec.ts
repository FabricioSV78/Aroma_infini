import { expect, test } from './test'

for (const width of [390, 1440]) {
  test(`abrir el carrito prepara solo el código del siguiente destino a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const requests: string[] = []
    page.on('request', request => requests.push(new URL(request.url()).pathname))
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    await page.route('**/src/features/cart/CartPage.tsx*', async route => {
      await gate
      await route.continue()
    })
    await page.goto('/producto/bois-clair')
    await expect(page.getByRole('heading', { name: 'Bois Clair', exact: true })).toBeVisible()
    expect(requests.filter(path => path.endsWith('/CartPage.tsx'))).toHaveLength(0)
    await page.getByRole('button', { name: 'Añadir al carrito', exact: true }).click()
    await page.getByRole('button', { name: 'Carrito, 1 producto', exact: true }).click()
    const drawer = page.locator('.cart-dialog')
    await expect(drawer).toBeVisible()
    await expect.poll(() => requests.filter(path => path.endsWith('/CartPage.tsx')).length).toBe(1)
    await expect(page).toHaveURL('/producto/bois-clair')
    expect(requests.some(path => path.includes('/api/checkout/'))).toBe(false)
    // A slow code preload must not freeze the open dialog or close controls.
    await page.keyboard.press('Escape')
    await expect(drawer).not.toBeVisible()
    release()
    await page.getByRole('button', { name: 'Carrito, 1 producto', exact: true }).click()
    await drawer.getByRole('link', { name: 'Revisar carrito', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Tu carrito', exact: true })).toBeVisible()
    await expect.poll(() => requests.filter(path => path.endsWith('/CheckoutPage.tsx')).length).toBe(1)
    expect(requests.filter(path => path.endsWith('/CartPage.tsx'))).toHaveLength(1)
    expect(requests.some(path => path.includes('/api/checkout/'))).toBe(false)
    await page.getByRole('link', { name: 'Continuar al checkout', exact: true }).click()
    await expect(page).toHaveURL('/checkout')
    await expect(page.locator('.checkout-summary')).toBeVisible()
    expect(requests.filter(path => path.endsWith('/CheckoutPage.tsx'))).toHaveLength(1)
  })
}
