import type * as AdminModule from './admin-service'

type AdminRuntime = Pick<
  typeof AdminModule,
  | 'adminService'
  | 'hydrateAdminStore'
  | 'getStoreBrands'
  | 'getStoreProductRecords'
  | 'getPromotionByCode'
  | 'getShippingSettings'
  | 'getShippingZoneForAddress'
  | 'applyRemoteCommerceSettings'
>
let runtime: AdminRuntime | undefined
let pendingCommerceReset:
  Parameters<AdminRuntime['applyRemoteCommerceSettings']>[0] | undefined
const listeners = new Set<() => void>()

/** Notifications contain no data. Public subscribers never initialize the
 * private/local store merely to observe invalidation of its confirmed edits. */
export function subscribeAdminState(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export function emitAdminState() {
  listeners.forEach((listener) => listener())
}
export function registerAdminRuntime(value: AdminRuntime) {
  runtime = value
  if (pendingCommerceReset) {
    const reset = pendingCommerceReset
    pendingCommerceReset = undefined
    value.applyRemoteCommerceSettings(reset)
  }
}
export function adminRuntime(): AdminRuntime {
  if (!runtime)
    throw new Error('El almacén administrativo no está inicializado.')
  return runtime
}
export async function loadAdminRuntime() {
  if (!runtime) await import('./admin-service')
  return adminRuntime()
}
export function applyLoadedCommerceSettings(
  value: Parameters<AdminRuntime['applyRemoteCommerceSettings']>[0],
) {
  if (runtime) runtime.applyRemoteCommerceSettings(value)
  else if (value.shippingVersion === 0 && value.promotions.length === 0) {
    // Retain the existing unconfigured/reset marker even if Auth resolves
    // before the lazy module. This contains no private records.
    pendingCommerceReset = value
  } else throw new Error('La configuración privada requiere inicialización.')
}
