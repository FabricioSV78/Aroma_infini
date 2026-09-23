import type { CheckoutMode, MockOrder } from './checkout-service'
import { getAdminOrder, type AdminOrderStatus } from './admin-service'

const STORAGE_KEY = 'aroma-infini:order-tracking:v1'
const REFERENCE_PATTERN = /^AI-DEMO-[A-F0-9]{16}$/
const MAX_RECORDS = 30

export interface TrackingRecord {
  reference: string
  placedAt: string
  status: AdminOrderStatus
  mode: CheckoutMode
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
    (record.mode === 'guest' || record.mode === 'demo-account')
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
  const record: TrackingRecord = {
    reference: order.reference,
    placedAt: order.placedAt,
    status: 'received',
    mode: order.mode,
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
  const adminOrder = getAdminOrder(normalized)
  return adminOrder ? { ...record, status: adminOrder.status } : record
}

export function trackingPath(reference: string): string {
  return `/seguir-pedido?codigo=${encodeURIComponent(reference)}`
}
