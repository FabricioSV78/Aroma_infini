import type { DeliveryLocation } from '../types/commerce'

/** An optional delivery pin never replaces the written address or coverage. */
export function isDeliveryLocation(value: unknown): value is DeliveryLocation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const point = value as Record<string, unknown>
  return (
    typeof point.latitude === 'number' &&
    Number.isFinite(point.latitude) &&
    Math.abs(point.latitude) <= 90 &&
    typeof point.longitude === 'number' &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.longitude) <= 180
  )
}

export const initialDeliveryMapCenter: DeliveryLocation = {
  latitude: -12.073,
  longitude: -77.0365,
}
const tileSize = 256
const latitudeLimit = 85.05112878

export function locationToMapPixel(point: DeliveryLocation, zoom: number) {
  const scale = tileSize * 2 ** zoom
  const latitude = Math.max(
    -latitudeLimit,
    Math.min(latitudeLimit, point.latitude),
  )
  const sin = Math.sin((latitude * Math.PI) / 180)
  return {
    x: ((point.longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
  }
}

export function mapPixelToLocation(
  x: number,
  y: number,
  zoom: number,
): DeliveryLocation {
  const scale = tileSize * 2 ** zoom
  const wrappedX = ((x % scale) + scale) % scale
  const clampedY = Math.max(0, Math.min(scale, y))
  return {
    latitude:
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * clampedY) / scale))) * 180) /
      Math.PI,
    longitude: (wrappedX / scale) * 360 - 180,
  }
}

export function deliveryMapLink(point: DeliveryLocation): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${point.latitude},${point.longitude}`)}`
}
