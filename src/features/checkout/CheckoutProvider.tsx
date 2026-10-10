import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { ResolvedCart } from '../../services/commerce-service'
import {
  createCheckoutDraft,
  createMockOrder,
  persistDemoCheckout,
  type MockOrder,
} from '../../services/checkout-service'
import { CheckoutContext, type CheckoutContextValue } from './checkout-context'
import { saveTrackingRecord } from '../../services/order-tracking-service'
import { useAccount } from '../account/account-context'

export function CheckoutProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState(createCheckoutDraft)
  const [order, setOrder] = useState<MockOrder | null>(null)
  const { addCheckoutOrder } = useAccount()

  const completeOrder = useCallback(
    async (cart: ResolvedCart) => {
      const result = createMockOrder(cart, draft)
      if (!result) return null
      if (!(await persistDemoCheckout(result))) return null
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
