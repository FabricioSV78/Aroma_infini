import { adminService, type AdminOrder } from './admin-service'

/** Read boundary shared by account and guest order tracking in the demo. */
export interface OrderStatusReadService {
  subscribe(listener: () => void): () => void
  getSnapshot(): readonly AdminOrder[]
  getByReference(reference: string): AdminOrder | undefined
}

export const orderStatusService: OrderStatusReadService = {
  subscribe: adminService.subscribe,
  getSnapshot: () => adminService.getSnapshot().orders,
  getByReference: (reference) =>
    adminService
      .getSnapshot()
      .orders.find((order) => order.reference === reference),
}
