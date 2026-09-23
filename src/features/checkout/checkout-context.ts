import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from 'react'
import type { ResolvedCart } from '../../services/commerce-service'
import type { CheckoutDraft, MockOrder } from '../../services/checkout-service'

export interface CheckoutContextValue {
  draft: CheckoutDraft
  setDraft: Dispatch<SetStateAction<CheckoutDraft>>
  order: MockOrder | null
  completeOrder: (cart: ResolvedCart) => MockOrder | null
}

export const CheckoutContext = createContext<CheckoutContextValue | null>(null)

export function useCheckout() {
  const context = useContext(CheckoutContext)
  if (!context)
    throw new Error('useCheckout debe utilizarse dentro de CheckoutProvider')
  return context
}
