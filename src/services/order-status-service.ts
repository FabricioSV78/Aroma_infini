import {
  adminRuntime,
  loadAdminRuntime,
  subscribeAdminState,
} from './admin-runtime'
import type { AdminOrder } from '../types/admin'
import { isRemoteCatalog } from './catalog-source'

if (!isRemoteCatalog) await loadAdminRuntime()

/** Read boundary shared by account and guest order tracking in the demo. */
export interface OrderStatusReadService {
  subscribe(listener: () => void): () => void
  getSnapshot(): readonly AdminOrder[]
  getByReference(reference: string): AdminOrder | undefined
}
const noPublicOrders: readonly AdminOrder[] = []

export const orderStatusService: OrderStatusReadService = {
  subscribe: subscribeAdminState,
  getSnapshot: () =>
    isRemoteCatalog
      ? noPublicOrders
      : adminRuntime().adminService.getSnapshot().orders,
  getByReference: (reference) =>
    isRemoteCatalog
      ? undefined
      : adminRuntime()
          .adminService.getSnapshot()
          .orders.find((order) => order.reference === reference),
}
