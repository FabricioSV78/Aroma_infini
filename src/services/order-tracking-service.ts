import type { CheckoutMode, MockOrder } from './checkout-service'
import type { OrderStatus } from '../types/commerce'
import { orderStatusService } from './order-status-service'
import { isRemoteCatalog } from './catalog-source'
import { requireSupabaseClient } from './supabase-client'
import { UserFacingError } from './admin-messages'

const STORAGE_KEY = 'aroma-infini:order-tracking:v1'
const REFERENCE_PATTERN = /^AI-(?:DEMO-|TEST-|SIM-)?[A-F0-9]{16,32}$/
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i
const MAX_RECORDS = 30

export interface TrackingRecord {
  reference: string
  placedAt: string
  status: OrderStatus
  mode: CheckoutMode
  simulation?: boolean
  trackingToken?: string
}

let memoryRecords: TrackingRecord[] = []

function isTrackingRecord(value: unknown): value is TrackingRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<TrackingRecord>
  return (
    typeof record.reference === 'string' &&
    REFERENCE_PATTERN.test(record.reference) &&
    typeof record.placedAt === 'string' &&
    !Number.isNaN(Date.parse(record.placedAt)) &&
    ['received', 'preparing', 'shipped', 'delivered'].includes(
      record.status ?? '',
    ) &&
    (record.mode === 'guest' || record.mode === 'demo-account') &&
    (record.trackingToken == null || TOKEN_PATTERN.test(record.trackingToken))
  )
}

export function readTrackingRecords(): TrackingRecord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return memoryRecords
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return memoryRecords
    const persisted = parsed.filter(isTrackingRecord) as TrackingRecord[]
    return [
      ...memoryRecords,
      ...persisted.filter(
        (record) =>
          !memoryRecords.some((item) => item.reference === record.reference),
      ),
    ].slice(0, MAX_RECORDS)
  } catch {
    return memoryRecords
  }
}

export function saveTrackingRecord(order: MockOrder): void {
  const remote = order as MockOrder & {
    simulation?: boolean
    trackingToken?: string
  }
  const record: TrackingRecord = {
    reference: order.reference,
    placedAt: order.placedAt,
    status: 'received',
    mode: order.mode,
    ...(remote.simulation ? { simulation: true } : {}),
    ...(remote.trackingToken && TOKEN_PATTERN.test(remote.trackingToken)
      ? { trackingToken: remote.trackingToken }
      : {}),
  }
  memoryRecords = [
    record,
    ...readTrackingRecords().filter(
      (item) => item.reference !== record.reference,
    ),
  ].slice(0, MAX_RECORDS)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryRecords))
  } catch {
    // El recorrido actual sigue disponible si el navegador bloquea almacenamiento.
  }
}

export function getTrackingRecord(reference: string): TrackingRecord | null {
  const normalized = reference.trim().toUpperCase()
  if (!REFERENCE_PATTERN.test(normalized)) return null
  const record = readTrackingRecords().find(
    (item) => item.reference === normalized,
  )
  if (!record) return null
  const adminOrder = orderStatusService.getByReference(normalized)
  return adminOrder ? { ...record, status: adminOrder.status } : record
}

export function trackingPath(
  reference: string,
  trackingToken?: string,
): string {
  const token =
    trackingToken ??
    readTrackingRecords().find((record) => record.reference === reference)
      ?.trackingToken
  return `/seguir-pedido?codigo=${encodeURIComponent(reference)}${token && TOKEN_PATTERN.test(token) ? `#acceso=${token}` : ''}`
}

/** Only an authenticated owner or the private receipt token can query a remote status. */
export async function loadTrackingRecord(
  reference: string,
  trackingToken?: string | null,
): Promise<TrackingRecord | null> {
  if (!isRemoteCatalog) return getTrackingRecord(reference)
  const normalized = reference.trim().toUpperCase()
  if (!REFERENCE_PATTERN.test(normalized)) return null
  const saved = readTrackingRecords().find(
    (record) => record.reference === normalized,
  )
  const token =
    trackingToken && TOKEN_PATTERN.test(trackingToken)
      ? trackingToken
      : saved?.trackingToken
  const response = await requireSupabaseClient().rpc('order_tracking', {
    p_reference: normalized,
    p_token: token ?? undefined,
  })
  if (response.error)
    throw new UserFacingError(
      'tracking-network',
      'No pudimos consultar el pedido. Revisa tu conexión y vuelve a intentar.',
    )
  if (response.data === null) return null
  const value = response.data as Record<string, unknown>
  const record: TrackingRecord = {
    reference: String(value.reference),
    placedAt: String(value.placedAt),
    status: value.status as OrderStatus,
    mode: value.mode as CheckoutMode,
    simulation: value.simulation === true,
    ...(token ? { trackingToken: token } : {}),
  }
  if (
    !isTrackingRecord(record) ||
    record.reference !== normalized ||
    record.simulation !== true ||
    Object.keys(value).some(
      (key) =>
        !['reference', 'placedAt', 'status', 'mode', 'simulation'].includes(
          key,
        ),
    )
  )
    throw new UserFacingError(
      'tracking-response',
      'No pudimos verificar el estado del pedido. Vuelve a intentar.',
    )
  return record
}
