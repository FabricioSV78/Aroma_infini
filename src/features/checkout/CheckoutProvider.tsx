import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { ResolvedCart } from '../../services/commerce-service'
import {
  createCheckoutDraft,
  createMockOrder,
  type MockOrder,
} from '../../services/checkout-service'
import { CheckoutContext, type CheckoutContextValue } from './checkout-context'
import { saveTrackingRecord } from '../../services/order-tracking-service'
import { useAccount } from '../account/account-context'
import { adminService } from '../../services/admin-service'

export function CheckoutProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState(createCheckoutDraft)
  const [order, setOrder] = useState<MockOrder | null>(null)
  const { addCheckoutOrder } = useAccount()

  const completeOrder = useCallback(
    async (cart: ResolvedCart) => {
      const result = createMockOrder(cart, draft)
      if (!result) return null
      const registration = adminService.recordApprovedCheckout(result)
      if (registration.kind === 'validation') return null
      // Wait for the local snapshot before sending the shopper to confirmation.
      // The current session still works if private browsing blocks IndexedDB.
      await adminService.flush().catch(() => undefined)
      saveTrackingRecord(result)
      addCheckoutOrder(result)
      setOrder(result)
      setDraft(createCheckoutDraft())
      return result
    },
    [addCheckoutOrder, draft],
  )

  const value = useMemo<CheckoutContextValue>(
    () => ({ draft, setDraft, order, completeOrder }),
    [completeOrder, draft, order],
  )

  return (
    <CheckoutContext.Provider value={value}>
      {children}
    </CheckoutContext.Provider>
  )
}
