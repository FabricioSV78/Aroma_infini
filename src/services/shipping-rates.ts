import {
  getDeliveryArea,
  isCoveredDeliveryLocation,
  isValidPeruLocation,
  LIMA_DEPARTMENT,
  LIMA_PROVINCE,
} from '../content/peru-core'
import type { ShippingSettings, ShippingZone } from '../types/shipping'

export function emptyShippingSettings(): ShippingSettings {
  return {
    configured: false,
    freeThresholdCents: 0,
    provinceShippingEnabled: false,
    nationalCourierFeeCents: 0,
    nationalEstimate: '',
    zones: [],
  }
}

/** The same coverage rule is used by forms, quotes and approved orders. */
export function isShippingDestinationEnabled(
  shipping: ShippingSettings,
  department: string,
  province: string,
  district: string,
) {
  if (shipping.configured === false) return false
  if (isCoveredDeliveryLocation(department, province, district)) return true
  return (
    shipping.provinceShippingEnabled &&
    isValidPeruLocation(department, province, district)
  )
}

/** Base tarifaria visible y aplicable para cada zona actualmente cubierta. */
export function getAreaBaseShipping(
  shipping: ShippingSettings,
  department: string,
) {
  const area = getDeliveryArea(department)
  const base =
    shipping.zones.find(
      (zone) =>
        zone.active &&
        zone.department.trim().toLowerCase() === area?.department &&
        zone.province === area?.province &&
        !zone.district,
    ) ??
    shipping.zones.find(
      (zone) =>
        zone.active &&
        zone.department.trim().toLowerCase() === area?.department &&
        !zone.province &&
        !zone.district,
    )
  const lima =
    shipping.zones.find(
      (zone) =>
        zone.active &&
        zone.department.trim().toLowerCase() === LIMA_DEPARTMENT &&
        zone.province === LIMA_PROVINCE &&
        !zone.district,
    ) ??
    shipping.zones.find(
      (zone) =>
        zone.active &&
        zone.department.trim().toLowerCase() === LIMA_DEPARTMENT &&
        !zone.province &&
        !zone.district,
    )
  // Los registros antiguos no tienen una tarifa base para Callao.
  const fallback = department === LIMA_DEPARTMENT ? null : lima
  return {
    courierFeeCents:
      base?.courierFeeCents ??
      fallback?.courierFeeCents ??
      shipping.nationalCourierFeeCents,
    motorizadoFeeCents: base
      ? base.motorizadoFeeCents
      : (fallback?.motorizadoFeeCents ?? null),
    estimate: base?.estimate ?? fallback?.estimate ?? shipping.nationalEstimate,
  }
}

function normalizeKey(value: string) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function resolveShippingZone(
  shipping: ShippingSettings,
  department: string,
  province = '',
  district = '',
) {
  const normalizedDepartment = normalizeKey(department)
  if (
    !isShippingDestinationEnabled(
      shipping,
      normalizedDepartment,
      province,
      district,
    )
  )
    return undefined
  const isCapital = isCoveredDeliveryLocation(
    normalizedDepartment,
    province,
    district,
  )
  const override = shipping.zones
    .filter(
      (zone) =>
        zone.active &&
        normalizeKey(zone.department) === normalizedDepartment &&
        (!zone.province || zone.province === province) &&
        (!zone.district || zone.district === district) &&
        // Una tarifa departamental futura de Lima no reemplaza su tarifa local.
        (!isCapital || Boolean(zone.province || zone.district)),
    )
    .sort(
      (left, right) =>
        Number(Boolean(right.district)) - Number(Boolean(left.district)) ||
        Number(Boolean(right.province)) - Number(Boolean(left.province)),
    )[0]
  if (override) return override
  const area = getDeliveryArea(normalizedDepartment)
  if (!isCapital)
    return {
      id: 'province-base',
      name: 'Provincias',
      department: normalizedDepartment,
      province: null,
      district: null,
      courierFeeCents: shipping.nationalCourierFeeCents,
      motorizadoFeeCents: null,
      estimate: shipping.nationalEstimate,
      active: true,
    } satisfies ShippingZone
  return {
    id: `${area!.department}-base`,
    name: area!.label,
    department: area!.department,
    province: area!.province,
    district: null,
    ...getAreaBaseShipping(shipping, area!.department),
    active: true,
  } satisfies ShippingZone
}
