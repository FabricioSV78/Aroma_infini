import { expect, test, type Page } from '@playwright/test'
import { isShippingDestinationEnabled } from '../src/services/shipping-rates'
import type { ShippingSettings } from '../src/types/shipping'

async function openDeliveryStep(page: Page) {
  await page.goto('/checkout')
  await page.getByLabel('Nombre', { exact: true }).fill('Ana')
  await page.getByLabel('Apellido').fill('Prueba')
  await page.getByLabel('Correo electrónico').fill('ana@ejemplo.invalid')
  await page.getByLabel('Celular').fill('912345678')
  await page.getByRole('button', { name: 'Continuar a entrega' }).click()
}

test('Las tarifas provinciales se preparan ocultas sin publicar destinos nuevos', async ({
  page,
}) => {
  await page.goto('/admin/envios')
  const provinces = page.locator('.admin-shipping-provinces')
  const disclosure = provinces.getByRole('button', {
    name: 'Ver configuración',
  })
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  await expect(
    provinces.getByRole('checkbox', { name: 'Permitir envíos a provincias' }),
  ).toHaveCount(0)
  await expect(provinces.getByRole('status')).toContainText('Desactivados')

  await disclosure.click()
  const provinceToggle = provinces.getByRole('checkbox', {
    name: 'Permitir envíos a provincias',
  })
  await expect(provinceToggle).not.toBeChecked()
  await provinces.getByLabel('Courier a provincias (S/)').fill('48')
  await provinces
    .locator('.admin-shipping-provinces-base')
    .getByLabel('Plazo estimado')
    .fill('De 3 a 5 días')

  await provinces
    .getByRole('button', { name: 'Registrar tarifa especial' })
    .click()
  const override = provinces.locator('#admin-shipping-province-editor')
  await override
    .getByRole('combobox', { name: 'Departamento' })
    .selectOption('arequipa')
  await override
    .getByRole('combobox', { name: 'Alcance' })
    .selectOption('province')
  await override
    .getByRole('combobox', { name: 'Provincia' })
    .selectOption('0401')
  await override.getByLabel('Nombre de la tarifa').fill('Arequipa provincia')
  await override.getByLabel('Courier (S/)').fill('17')
  await override
    .getByLabel('Dejar lista para cuando se activen los envíos')
    .check()
  await page.getByRole('button', { name: 'Guardar configuración' }).click()
  await expect(
    page.getByText('Configuración aplicada a la tienda.'),
  ).toBeVisible()

  await page.reload()
  await provinces.getByRole('button', { name: 'Ver configuración' }).click()
  await expect(provinceToggle).not.toBeChecked()
  await expect(
    provinces.getByRole('button', { name: /Arequipa provincia/ }),
  ).toContainText('Preparada')
  await expect(provinces.getByLabel('Courier a provincias (S/)')).toHaveValue(
    '48',
  )

  await provinces
    .getByRole('button', { name: 'Registrar tarifa especial' })
    .click()
  const limaOverride = provinces.locator('#admin-shipping-province-editor')
  await limaOverride
    .getByRole('combobox', { name: 'Departamento' })
    .selectOption('lima')
  await expect(
    limaOverride.getByRole('combobox', { name: 'Alcance' }),
  ).toHaveValue('province')
  await expect(
    limaOverride.getByRole('combobox', { name: 'Provincia' }),
  ).toBeVisible()
  await limaOverride.getByLabel('Courier (S/)').fill('5')
  await limaOverride
    .getByLabel('Dejar lista para cuando se activen los envíos')
    .check()
  await page.getByRole('button', { name: 'Guardar configuración' }).click()
  await expect(
    page.getByText('Configuración aplicada a la tienda.'),
  ).toBeVisible()

  await page.goto('/envios')
  await expect(page.locator('.delivery-rates')).not.toContainText(
    'Courier en otras provincias',
  )
  await page.evaluate(() => {
    localStorage.setItem(
      'aroma-infini:cart:v1',
      JSON.stringify({
        version: 1,
        items: [{ variantId: 'cedre-50', quantity: 1 }],
      }),
    )
  })
  await openDeliveryStep(page)
  const capitalZone = page.getByLabel('Zona de entrega')
  await expect(capitalZone.locator('option')).toHaveCount(3)
  await expect(capitalZone.locator('option[value="arequipa"]')).toHaveCount(0)
  await capitalZone.selectOption('lima')
  await page.getByLabel('Distrito de entrega').selectOption('150122')
  await expect(page.locator('.checkout-delivery-quote')).toContainText('S/ 20')
  await capitalZone.selectOption('callao')
  await page.getByLabel('Distrito de entrega').selectOption('070101')
  await expect(page.locator('.checkout-delivery-quote')).toContainText('S/ 20')
})

test('La cobertura provincial futura depende únicamente de la activación explícita', () => {
  const prepared: ShippingSettings = {
    freeThresholdCents: 45000,
    provinceShippingEnabled: false,
    nationalCourierFeeCents: 4800,
    nationalEstimate: 'De 3 a 5 días',
    zones: [
      {
        id: 'zone-arequipa-province',
        name: 'Arequipa provincia',
        department: 'arequipa',
        province: '0401',
        district: null,
        courierFeeCents: 1700,
        motorizadoFeeCents: null,
        estimate: 'De 2 a 3 días',
        active: true,
      },
    ],
  }

  expect(
    isShippingDestinationEnabled(prepared, 'arequipa', '0401', '040103'),
  ).toBe(false)
  expect(isShippingDestinationEnabled(prepared, 'lima', '1501', '150122')).toBe(
    true,
  )
  expect(
    isShippingDestinationEnabled(prepared, 'callao', '0701', '070101'),
  ).toBe(true)

  const enabledInMemory = { ...prepared, provinceShippingEnabled: true }
  expect(
    isShippingDestinationEnabled(enabledInMemory, 'arequipa', '0401', '040103'),
  ).toBe(true)
  expect(
    isShippingDestinationEnabled(enabledInMemory, 'arequipa', '0401', '040199'),
  ).toBe(false)
})

test('La configuración provincial abierta cabe en escritorio, laptop, tablet y móvil', async ({
  page,
}) => {
  for (const viewport of [
    { name: 'desktop', width: 1600, height: 1000 },
    { name: 'laptop', width: 1280, height: 900 },
    { name: 'tablet', width: 820, height: 1180 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport)
    await page.goto('/admin/envios')
    const provinces = page.locator('.admin-shipping-provinces')
    await provinces.getByRole('button', { name: 'Ver configuración' }).click()
    await expect(
      provinces.getByLabel('Courier a provincias (S/)'),
    ).toBeVisible()
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width)
    await provinces.screenshot({
      path: `artifacts/admin-integral/provinces-${viewport.name}.png`,
      animations: 'disabled',
    })
  }
})
