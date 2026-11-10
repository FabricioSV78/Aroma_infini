import { expect, test } from '@playwright/test'
import {
  emptyShippingSettings,
  parseShippingEnvelope,
  parseShippingSettings,
  publicShippingSettings,
} from '../src/services/commerce-settings-service'

function shipping() {
  return {
    freeThresholdCents: 45000,
    provinceShippingEnabled: false,
    nationalCourierFeeCents: 0,
    nationalEstimate: '',
    zones: [
      {
        id: 'zone-lima',
        name: 'Lima',
        department: 'lima',
        province: '1501',
        district: null,
        courierFeeCents: 2000,
        motorizadoFeeCents: 1500,
        estimate: 'Hasta 48 horas',
        active: true,
      },
    ],
  }
}

test('Una tienda sin configurar no recibe tarifas locales ni promociones ficticias', () => {
  expect(parseShippingEnvelope({ shipping: null, shippingVersion: 0 })).toEqual(
    { shipping: emptyShippingSettings(), shippingVersion: 0 },
  )
  expect(emptyShippingSettings().configured).toBe(false)
  expect(emptyShippingSettings().zones).toEqual([])
  expect(emptyShippingSettings().freeThresholdCents).toBe(0)
})

test('La configuración verificada conserva valores en céntimos y modalidades desactivadas', () => {
  const source = shipping()
  source.zones[0].motorizadoFeeCents = 0
  expect(parseShippingSettings(source)).toEqual({ ...source, configured: true })
  const noMotor = {
    ...source,
    zones: [{ ...source.zones[0], motorizadoFeeCents: null }],
  }
  expect(parseShippingSettings(noMotor).zones[0].motorizadoFeeCents).toBeNull()
})

test('Rechaza una versión incoherente, tarifas negativas y zonas repetidas', () => {
  expect(() =>
    parseShippingEnvelope({ shipping: shipping(), shippingVersion: 0 }),
  ).toThrow()
  expect(() =>
    parseShippingEnvelope({ shipping: null, shippingVersion: 1 }),
  ).toThrow()
  expect(() =>
    parseShippingSettings({ ...shipping(), freeThresholdCents: -1 }),
  ).toThrow()
  const source = shipping()
  expect(() =>
    parseShippingSettings({
      ...source,
      zones: [source.zones[0], { ...source.zones[0], id: 'second' }],
    }),
  ).toThrow()
  expect(() =>
    parseShippingSettings({
      ...source,
      zones: [source.zones[0], { ...source.zones[0], province: '1502' }],
    }),
  ).toThrow()
})

test('Rechaza ubicaciones de departamentos o provincias distintos y valores inseguros', () => {
  const source = shipping(),
    zone = source.zones[0]
  for (const patch of [
    { department: 'inventado' },
    { province: '0701' },
    { district: '070101' },
    { courierFeeCents: Number.MAX_SAFE_INTEGER + 1 },
    { estimate: '' },
  ]) {
    expect(() =>
      parseShippingSettings({ ...source, zones: [{ ...zone, ...patch }] }),
    ).toThrow()
  }
})

test('Una respuesta antigua no reemplaza tarifas confirmadas de una versión nueva', () => {
  publicShippingSettings.confirm({ shipping: shipping(), shippingVersion: 8 })
  const confirmed = publicShippingSettings.peek()
  publicShippingSettings.confirm({ shipping: null, shippingVersion: 0 })
  expect(publicShippingSettings.version()).toBe(8)
  expect(publicShippingSettings.peek()).toBe(confirmed)
})
