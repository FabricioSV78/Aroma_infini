import { adminService } from './admin-service'
import type { AdminOrder } from '../types/admin'
import { isRemoteCatalog } from './catalog-source'

/** Read boundary shared by account and guest order tracking in the demo. */
export interface OrderStatusReadService {
  subscribe(listener: () => void): () => void
  getSnapshot(): readonly AdminOrder[]
  getByReference(reference: string): AdminOrder | undefined
}
const noPublicOrders: readonly AdminOrder[] = []

export const orderStatusService: OrderStatusReadService = {
  subscribe: adminService.subscribe,
  getSnapshot: () =>
    isRemoteCatalog ? noPublicOrders : adminService.getSnapshot().orders,
  getByReference: (reference) =>
    isRemoteCatalog
      ? undefined
      : adminService
          .getSnapshot()
          .orders.find((order) => order.reference === reference),
}
