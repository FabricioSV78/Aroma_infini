import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import {
  accountOrderFromCheckout,
  createDemoAddress,
  createDemoOrders,
  createDemoProfile,
  type AccountAddress,
  type AccountOrder,
  type AccountProfile,
} from '../../services/account-service'
import type { MockOrder } from '../../services/checkout-service'
import { AccountContext, type AccountContextValue } from './account-context'
import { adminService } from '../../services/admin-service'

interface AccountState {
  active: boolean
  profile: AccountProfile
  address: AccountAddress | null
  orders: AccountOrder[]
}

function createAccountState(): AccountState {
  return {
    active: false,
    profile: createDemoProfile(),
    address: createDemoAddress(),
    orders: createDemoOrders(),
  }
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccountState>(createAccountState)
  const adminState = useSyncExternalStore(
    adminService.subscribe,
    adminService.getSnapshot,
  )

  const activateDemo = useCallback(() => {
    setState((current) => ({ ...current, active: true }))
  }, [])
  const leaveDemo = useCallback(() => setState(createAccountState()), [])
  const updateProfile = useCallback((profile: AccountProfile) => {
    setState((current) => ({ ...current, profile }))
  }, [])
  const saveAddress = useCallback((address: AccountAddress) => {
    setState((current) => ({ ...current, address }))
  }, [])
  const removeAddress = useCallback(() => {
    setState((current) => ({ ...current, address: null }))
  }, [])
  const addCheckoutOrder = useCallback((order: MockOrder) => {
    const accountOrder = accountOrderFromCheckout(order)
    if (!accountOrder) return
    setState((current) => ({
      ...current,
      orders: [
        accountOrder,
        ...current.orders.filter(
          (item) => item.reference !== accountOrder.reference,
        ),
      ],
    }))
  }, [])

  const value = useMemo<AccountContextValue>(() => {
    const orders = state.orders.map((order) => {
      const adminOrder = adminState.orders.find(
        (item) => item.reference === order.reference,
      )
      return adminOrder ? { ...order, status: adminOrder.status } : order
    })
    return {
      active: state.active,
      profile: state.profile,
      address: state.address,
      orders,
      activateDemo,
      leaveDemo,
      updateProfile,
      saveAddress,
      removeAddress,
      addCheckoutOrder,
    }
  }, [
    activateDemo,
    addCheckoutOrder,
    adminState,
    leaveDemo,
    removeAddress,
    saveAddress,
    state,
    updateProfile,
  ])

  return (
    <AccountContext.Provider value={value}>{children}</AccountContext.Provider>
  )
}
