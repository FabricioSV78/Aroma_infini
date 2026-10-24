import {
  getDeliveryArea,
  isCoveredDeliveryLocation,
  isValidPeruLocation,
  LIMA_DEPARTMENT,
  LIMA_PROVINCE,
} from '../content/peru'
import type { ShippingSettings } from '../types/shipping'

/** The same coverage rule is used by forms, quotes and approved orders. */
export function isShippingDestinationEnabled(
  shipping: ShippingSettings,
  department: string,
  province: string,
  district: string,
) {
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
