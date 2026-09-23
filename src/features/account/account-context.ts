import { createContext, useContext } from 'react'
import type { MockOrder } from '../../services/checkout-service'
import type {
  AccountAddress,
  AccountOrder,
  AccountProfile,
} from '../../services/account-service'

export interface AccountContextValue {
  active: boolean
  profile: AccountProfile
  address: AccountAddress | null
  orders: AccountOrder[]
  activateDemo: () => void
  leaveDemo: () => void
  updateProfile: (profile: AccountProfile) => void
  saveAddress: (address: AccountAddress) => void
  removeAddress: () => void
  addCheckoutOrder: (order: MockOrder) => void
}

export const AccountContext = createContext<AccountContextValue | null>(null)

export function useAccount() {
  const context = useContext(AccountContext)
  if (!context)
    throw new Error('useAccount debe utilizarse dentro de AccountProvider')
  return context
}
