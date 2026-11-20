/** Invalidation signal only. Receivers re-read through their verified admin
 * boundary; never publish an order, a credential or an authorization decision. */
export const ADMIN_ORDERS_CHANGED_EVENT = 'aroma-infini:orders-changed'

export function notifyAdminOrdersChanged() {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new Event(ADMIN_ORDERS_CHANGED_EVENT))
}
