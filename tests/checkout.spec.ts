import { expect, test } from '@playwright/test'
import { resolveCart } from '../src/services/commerce-service'
import {
  calculateCheckout,
  createCheckoutDraft,
  createMockOrder,
  evaluatePromotion,
  quoteShipping,
} from '../src/services/checkout-service'
import {
  getPeruDistrictOptions,
  getPeruProvinceOptions,
  isValidPeruLocation,
  peruDepartments,
  peruUbigeoSummary,
} from '../src/content/peru'

test('El ubigeo completo mantiene la jerarquía oficial del Perú', () => {
  expect(peruUbigeoSummary).toEqual({
    departments: 25,
    provinces: 196,
    districts: 1891,
  })
  expect(peruDepartments).toHaveLength(25)
  expect(getPeruProvinceOptions('lima')).toContainEqual({
    value: '1501',
    label: 'Lima',
  })
  expect(getPeruDistrictOptions('1501')).toContainEqual({
    value: '150122',
    label: 'Miraflores',
  })
  expect(isValidPeruLocation('lima', '1501', '150122')).toBe(true)
  expect(isValidPeruLocation('arequipa', '1501', '150122')).toBe(false)
})

test('Cotización y promociones de muestra mantienen importes y estados explícitos', () => {
  expect(quoteShipping('', 'courier', 39000).kind).toBe('pending')
  expect(
    quoteShipping('lima', 'courier', 39000, '1501', '150122'),
  ).toMatchObject({
    kind: 'quoted',
    feeCents: 2000,
    estimate: 'Hasta 48 horas',
  })
  expect(
    quoteShipping('callao', 'motorizado', 39000, '0701', '070101'),
  ).toMatchObject({
    kind: 'quoted',
    feeCents: 1500,
  })
  expect(
    quoteShipping('arequipa', 'motorizado', 39000, '0401', '040103').kind,
  ).toBe('unavailable')
  expect(
    quoteShipping('arequipa', 'courier', 39000, '0401', '040103'),
  ).toMatchObject({
    kind: 'quoted',
    feeCents: 3500,
    estimate: 'Hasta 5 días',
  })
  expect(
    quoteShipping('arequipa', 'courier', 45000, '0401', '040103'),
  ).toMatchObject({
    kind: 'quoted',
    feeCents: 0,
    free: true,
  })
  expect(quoteShipping('Cusco', 'courier', 39000).kind).toBe('pending')
  expect(quoteShipping('Cusco', 'motorizado', 39000).kind).toBe('unavailable')

  expect(evaluatePromotion('', 39000).kind).toBe('empty')
  expect(evaluatePromotion('demo10', 39000).kind).toBe('applied')
  expect(evaluatePromotion('MINIMO500', 39000).kind).toBe('minimum-not-met')
  expect(evaluatePromotion('MINIMO500', 59000).kind).toBe('applied')
  for (const [code, kind] of [
    ['DESCONOCIDO', 'not-found'],
    ['INACTIVO', 'inactive'],
    ['PROXIMO', 'not-started'],
    ['VENCIDO', 'expired'],
    ['LIMITE', 'limit-reached'],
    ['ERROR', 'error'],
  ] as const)
    expect(evaluatePromotion(code, 39000).kind).toBe(kind)

  const cart = resolveCart([{ variantId: 'cedre-50', quantity: 1 }])
  const draft = createCheckoutDraft()
  draft.address.department = 'lima'
  draft.address.province = '1501'
  draft.address.district = '150122'
  draft.deliveryMethod = 'motorizado'
  draft.appliedPromotion = 'DEMO10'
  expect(calculateCheckout(cart, draft)).toMatchObject({
    subtotalCents: 39000,
    discountCents: 3900,
    totalCents: 36600,
  })
  expect(createMockOrder(cart, draft)).toMatchObject({
    reference: expect.stringMatching(/^AI-DEMO-[A-F0-9]{16}$/),
    paymentProvider: 'mercado-pago',
  })
  expect(
    createMockOrder(
      resolveCart([{ variantId: 'missing', quantity: 1 }]),
      draft,
    ),
  ).toBeNull()
})

test('El checkout vacío o con variantes no disponibles pide corregir el carrito', async ({
  page,
}) => {
  await page.goto('/checkout')
  await expect(
    page.getByRole('heading', { name: 'Tu selección está vacía.' }),
  ).toBeVisible()
  await page.addInitScript(() => {
    localStorage.setItem(
      'aroma-infini:cart:v1',
      JSON.stringify({
        version: 1,
        items: [{ variantId: 'ambre-50', quantity: 1 }],
      }),
    )
  })
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Revisa tu carrito.' }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Revisar carrito' }),
  ).toHaveAttribute('href', '/carrito')
})

test('El seguimiento descarta registros locales dañados', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('aroma-infini:order-tracking:v1', '{roto')
  })
  await page.goto('/seguir-pedido?codigo=AI-DEMO-0000000000000000')
  await expect(
    page.getByText(/No encontramos ese pedido de prueba/),
  ).toBeVisible()
  await page.goto('/cuenta/pedidos')
  await expect(
    page.getByRole('heading', { name: 'Explora la experiencia de cuenta.' }),
  ).toBeVisible()
})

test('El recorrido normal muestra solo Mercado Pago y mantiene las pruebas fuera de vista', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'aroma-infini:cart:v1',
      JSON.stringify({
        version: 1,
        items: [{ variantId: 'cedre-50', quantity: 1 }],
      }),
    )
  })
  await page.goto('/checkout')
  await page.getByRole('radio', { name: /Cuenta de demostración/ }).check()
  await page.getByLabel('Celular').fill('912345678')
  await page.getByRole('button', { name: 'Continuar a entrega' }).click()
  await page.getByLabel('Departamento').selectOption('lima')
  await page.getByLabel('Provincia').selectOption('1501')
  await page.getByLabel('Distrito').selectOption('150122')
  await page
    .getByLabel('Dirección', { exact: true })
    .fill('Avenida de ejemplo 123')
  await page.getByRole('button', { name: 'Revisar selección' }).click()

  await expect(
    page.getByRole('heading', { name: 'Pago con Mercado Pago' }),
  ).toBeVisible()
  await expect(page.getByLabel('Resultado de prueba')).toHaveCount(0)
  await expect(
    page.getByRole('radio', { name: /Tarjeta|Transferencia/ }),
  ).toHaveCount(0)
  await expect(page.getByLabel('Código de descuento')).toBeHidden()
  await page.getByRole('button', { name: 'Ver confirmación de prueba' }).click()
  await expect(page).toHaveURL('/checkout/confirmacion')
  await expect(
    page.getByRole('heading', { name: 'Compra de prueba completada.' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Ver en Mis pedidos' }).click()
  await expect(page).toHaveURL('/cuenta/pedidos')
  await page
    .getByRole('button', { name: 'Explorar cuenta de demostración' })
    .click()
  await expect(page.locator('.account-order-list > li')).toHaveCount(2)
  await page.getByRole('link', { name: 'Ver pedido' }).first().click()
  await expect(page.getByRole('heading', { name: 'Recibido.' })).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'Explora la experiencia de cuenta.' }),
  ).toBeVisible()
})

test('Invitado: datos, entrega, promoción, rechazo, error, aprobación y confirmación', async ({
  page,
}) => {
  await page.goto('/producto/bois-clair')
  await page.getByRole('button', { name: 'Añadir al carrito' }).click()
  await page.goto('/carrito')
  await page.getByRole('link', { name: 'Continuar al checkout' }).click()
  await expect(page).toHaveURL('/checkout')
  await page.goto('/checkout?demo=1')
  await expect(page.getByRole('radio', { name: /Como invitado/ })).toBeChecked()
  await expect(page.locator('.help-button')).toHaveCount(0)
  const helpButton = page.getByRole('button', {
    name: 'Información de atención',
  })
  await helpButton.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(helpButton).toBeFocused()

  await page.getByRole('button', { name: 'Continuar a entrega' }).click()
  await expect(page.getByRole('heading', { name: 'Tus datos.' })).toBeVisible()
  await page.getByLabel('Nombre', { exact: true }).fill('María')
  await page.getByLabel('Apellido').fill('Prueba')
  await page.getByLabel('Correo electrónico').fill('maria@ejemplo.invalid')
  await page.getByLabel('Celular').fill('912345678')
  await page.getByRole('button', { name: 'Continuar a entrega' }).click()

  await page.getByLabel('Departamento').selectOption('lima')
  await page.getByLabel('Provincia').selectOption('1501')
  await page.getByLabel('Distrito').selectOption('150122')
  await page
    .getByLabel('Dirección', { exact: true })
    .fill('Avenida de ejemplo 123')
  await page.getByRole('radio', { name: /Motorizado/ }).check()
  await expect(page.locator('.checkout-delivery-quote')).toContainText('S/ 15')
  await page.getByRole('button', { name: 'Revisar selección' }).click()

  await expect(
    page.getByRole('heading', { name: 'Revisa tu pedido.' }),
  ).toBeVisible()
  const stored = await page.evaluate(() =>
    Object.values(localStorage).join(' '),
  )
  expect(stored).not.toContain('maria@ejemplo.invalid')
  expect(stored).not.toContain('Avenida de ejemplo')

  await expect(page.getByRole('radio', { name: /Transferencia/ })).toHaveCount(
    0,
  )
  await expect(
    page.getByRole('heading', { name: 'Pago con Mercado Pago' }),
  ).toBeVisible()
  await page.getByText('¿Tienes un código de descuento?').click()
  await page.getByLabel('Código de descuento').fill('DEMO10')
  await page.getByRole('button', { name: 'Aplicar' }).click()
  await expect(page.locator('.checkout-promotion-message')).toContainText(
    '10 %',
  )
  await expect(page.locator('.checkout-summary')).toContainText('S/ 366')

  await page.getByLabel('Resultado de prueba').selectOption('rejected')
  await page.getByRole('button', { name: 'Ver confirmación de prueba' }).click()
  await expect(page.getByRole('alert')).toContainText('rechazado')
  await expect(
    page.getByRole('button', { name: 'Carrito, 1 producto' }),
  ).toBeVisible()

  await page.getByLabel('Resultado de prueba').selectOption('error')
  await page.getByRole('button', { name: 'Ver confirmación de prueba' }).click()
  await expect(page.getByRole('alert')).toContainText('completar la prueba')

  await page.getByLabel('Resultado de prueba').selectOption('approved')
  await page.getByRole('button', { name: 'Ver confirmación de prueba' }).click()
  await expect(page).toHaveURL('/checkout/confirmacion')
  await expect(
    page.getByRole('heading', { name: 'Compra de prueba completada.' }),
  ).toBeVisible()
  await expect(
    page.locator('.checkout-confirmation-tracking strong'),
  ).toHaveText(/^AI-DEMO-[A-F0-9]{16}$/)
  await expect(
    page.getByRole('button', { name: 'Carrito', exact: true }),
  ).toBeVisible()
  await expect(page.locator('.checkout-confirmation')).toContainText('S/ 366')
  const trackingLink = page.getByRole('link', { name: 'Ver estado del pedido' })
  const trackingHref = await trackingLink.getAttribute('href')
  expect(trackingHref).toMatch(/^\/seguir-pedido\?codigo=AI-DEMO-[A-F0-9]{16}$/)
  const saved = await page.evaluate(() =>
    localStorage.getItem('aroma-infini:order-tracking:v1'),
  )
  expect(saved).not.toContain('maria@ejemplo.invalid')
  expect(saved).not.toContain('Avenida de ejemplo')
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'No hay una simulación activa.' }),
  ).toBeVisible()
  await page.goto(trackingHref!)
  await expect(
    page.getByRole('heading', { name: 'Pedido de prueba: recibido.' }),
  ).toBeVisible()
  await expect(page.getByText('María Prueba')).toHaveCount(0)
  await page.getByLabel('Código de pedido').fill('AI-DEMO-0000000000000000')
  await page.getByRole('button', { name: 'Consultar' }).click()
  await expect(
    page.getByText(/No encontramos ese pedido de prueba/),
  ).toBeVisible()
  await page.goto('/cuenta/pedidos')
  await page
    .getByRole('button', { name: 'Explorar cuenta de demostración' })
    .click()
  await expect(page.locator('.account-order-list > li')).toHaveCount(1)
  await expect(page.getByText(trackingHref!.split('codigo=')[1])).toHaveCount(0)
})

test('La compra aprobada se refleja en pedidos, inventario y seguimiento administrativo', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'aroma-infini:cart:v1',
      JSON.stringify({
        version: 1,
        items: [{ variantId: 'cedre-50', quantity: 1 }],
      }),
    )
  })
  await page.goto('/checkout')
  await page.getByLabel('Nombre', { exact: true }).fill('Lucía')
  await page.getByLabel('Apellido').fill('Compradora')
  await page.getByLabel('Correo electrónico').fill('lucia@ejemplo.invalid')
  await page.getByLabel('Celular').fill('912345678')
  await page.getByRole('button', { name: 'Continuar a entrega' }).click()
  await page.getByLabel('Departamento').selectOption('lima')
  await page.getByLabel('Provincia').selectOption('1501')
  await page.getByLabel('Distrito').selectOption('150122')
  await page
    .getByLabel('Dirección', { exact: true })
    .fill('Avenida de prueba 123')
  await page.getByRole('button', { name: 'Revisar selección' }).click()
  await page.getByRole('button', { name: 'Ver confirmación de prueba' }).click()

  const reference = await page
    .locator('.checkout-confirmation-tracking strong')
    .textContent()
  expect(reference).toMatch(/^AI-DEMO-[A-F0-9]{16}$/)
  const trackingHref = `/seguir-pedido?codigo=${reference}`

  await page.evaluate((path) => {
    window.history.pushState(null, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, `/admin/pedidos?q=${reference}`)
  const orderRow = page.locator('.admin-table tbody tr')
  await expect(orderRow).toHaveCount(1)
  await expect(orderRow).toContainText('Lucía Compradora')
  await expect(orderRow).toContainText('Pagado')

  await orderRow
    .getByRole('link', { name: new RegExp(`Ver ${reference}`) })
    .click()
  await page
    .getByRole('combobox', { name: /Preparación del pedido/ })
    .selectOption('preparing')
  await page.getByRole('button', { name: 'Guardar estado' }).click()

  await page.evaluate((path) => {
    window.history.pushState(null, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, '/admin/productos/cedre')
  await expect(page.getByLabel('Stock de presentación 50 ml')).toHaveValue('4')

  await page.evaluate((path) => {
    window.history.pushState(null, '', path)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, trackingHref)
  await expect(
    page.getByRole('heading', { name: 'Pedido de prueba: en preparación.' }),
  ).toBeVisible()
  await expect(
    page.locator('.tracking-steps li[aria-current="step"]'),
  ).toHaveText('En preparación')
})

test('Un pago rechazado no crea pedido ni cliente en administración', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'aroma-infini:cart:v1',
      JSON.stringify({
        version: 1,
        items: [{ variantId: 'cedre-50', quantity: 1 }],
      }),
    )
  })
  await page.goto('/checkout?demo=1')
  await page.getByLabel('Nombre', { exact: true }).fill('Pago')
  await page.getByLabel('Apellido').fill('Rechazado')
  await page.getByLabel('Correo electrónico').fill('rechazado@ejemplo.invalid')
  await page.getByLabel('Celular').fill('912345678')
  await page.getByRole('button', { name: 'Continuar a entrega' }).click()
  await page.getByLabel('Departamento').selectOption('lima')
  await page.getByLabel('Provincia').selectOption('1501')
  await page.getByLabel('Distrito').selectOption('150122')
  await page
    .getByLabel('Dirección', { exact: true })
    .fill('Avenida de prueba 456')
  await page.getByRole('button', { name: 'Revisar selección' }).click()
  await page.getByLabel('Resultado de prueba').selectOption('rejected')
  await page.getByRole('button', { name: 'Ver confirmación de prueba' }).click()
  await expect(page.getByRole('alert')).toContainText('rechazado')

  await page.evaluate(() => {
    window.history.pushState(null, '', '/admin/pedidos')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.locator('.admin-table tbody tr')).toHaveCount(4)
  await expect(page.getByText('Pago Rechazado')).toHaveCount(0)
  await page.getByRole('link', { name: 'Clientes' }).click()
  await expect(page.getByText('rechazado@ejemplo.invalid')).toHaveCount(0)
})

test('La cuenta de ejemplo no autentica y el borrador se conserva al editar el carrito', async ({
  page,
}) => {
  await page.goto('/producto/bois-clair')
  await page.getByRole('button', { name: 'Añadir al carrito' }).click()
  await page.goto('/checkout')
  await page.getByRole('radio', { name: /Cuenta de demostración/ }).check()
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(
    'Cliente',
  )
  await expect(page.getByLabel('Correo electrónico')).toHaveValue(
    'cliente@ejemplo.invalid',
  )
  await page.getByLabel('Celular').fill('912345678')
  await page.getByRole('button', { name: 'Continuar a entrega' }).click()
  await expect(page.getByLabel('Departamento')).toHaveValue('')
  await expect(
    page.getByRole('button', { name: 'Revisar selección' }),
  ).toBeDisabled()
  await page.getByLabel('Departamento').selectOption('arequipa')
  await page.getByLabel('Provincia').selectOption('0401')
  await page.getByLabel('Distrito').selectOption('040103')
  await page
    .getByLabel('Dirección', { exact: true })
    .fill('Calle de ejemplo 45')
  await expect(page.getByRole('radio', { name: /Motorizado/ })).toBeDisabled()
  await expect(page.locator('.checkout-delivery-quote')).toContainText('S/ 35')
  await page.getByRole('button', { name: 'Revisar selección' }).click()
  await page
    .locator('.checkout-summary')
    .getByRole('link', { name: 'Editar' })
    .click()
  await expect(page).toHaveURL('/carrito')
  await page.getByRole('link', { name: 'Continuar al checkout' }).click()
  await expect(
    page.getByRole('heading', { name: 'Revisa tu pedido.' }),
  ).toBeVisible()
  await expect(page.locator('.checkout-review-detail')).toContainText('Cayma')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Tus datos.' })).toBeVisible()
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('')
})

for (const width of [360, 375, 390, 430, 768, 1024, 1280, 1440]) {
  test(`Checkout ${width}px: sin desbordamiento, imágenes rotas ni errores`, async ({
    page,
  }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning')
        errors.push(message.text())
    })
    await page.addInitScript(() => {
      localStorage.setItem(
        'aroma-infini:cart:v1',
        JSON.stringify({
          version: 1,
          items: [{ variantId: 'cedre-50', quantity: 1 }],
        }),
      )
    })
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/checkout')
    await page.locator('footer').scrollIntoViewIfNeeded()
    await page
      .locator('.checkout-summary img')
      .evaluateAll(async (elements) => {
        await Promise.all(
          (elements as HTMLImageElement[]).map(
            (image) =>
              new Promise<void>((resolve) => {
                if (image.complete) resolve()
                else {
                  image.addEventListener('load', () => resolve(), {
                    once: true,
                  })
                  image.addEventListener('error', () => resolve(), {
                    once: true,
                  })
                }
              }),
          ),
        )
      })
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true)
    expect(
      await page
        .locator('.checkout-summary img')
        .evaluateAll((elements) =>
          (elements as HTMLImageElement[]).every(
            (image) => image.naturalWidth > 0,
          ),
        ),
    ).toBe(true)
    expect(errors).toEqual([])
  })
}
