import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from 'react'
import type { ResolvedCart } from '../../services/commerce-service'
import type {
  CheckoutContact,
  CheckoutDraft,
  MockOrder,
} from '../../services/checkout-service'
import type { ServerCheckoutQuote } from '../../services/checkout-server'

export interface CheckoutContextValue {
  draft: CheckoutDraft
  setDraft: Dispatch<SetStateAction<CheckoutDraft>>
  setContactField: (field: keyof CheckoutContact, value: string) => void
  order: MockOrder | null
  completeOrder: (cart: ResolvedCart) => Promise<MockOrder | null>
  serverQuote: ServerCheckoutQuote | null
  quoteLoading: boolean
  quoteError: string
  pendingConfirmation: boolean
  refreshQuote: () => void
}

export const CheckoutContext = createContext<CheckoutContextValue | null>(null)

export function useCheckout() {
  const context = useContext(CheckoutContext)
  if (!context)
    throw new Error('useCheckout debe utilizarse dentro de CheckoutProvider')
  return context
}
