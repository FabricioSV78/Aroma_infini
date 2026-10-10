import {
  useCallback,
  useEffect,
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
import { orderStatusService } from '../../services/order-status-service'

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

const accountStorageKey = 'aroma-infini-account-session-v1'

function restoreAccountState(): AccountState {
  const initial = createAccountState()
  try {
    const stored = sessionStorage.getItem(accountStorageKey)
    if (!stored) return initial
    const parsed: unknown = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object') return initial
    const value = parsed as Partial<AccountState>
    if (value.active !== true || !value.profile || !Array.isArray(value.orders))
      return initial
    return {
      active: true,
      profile: value.profile,
      address: value.address ?? null,
      orders: value.orders,
    }
  } catch {
    return initial
  }
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AccountState>(restoreAccountState)
  useEffect(() => {
    try {
      if (state.active)
        sessionStorage.setItem(accountStorageKey, JSON.stringify(state))
      else sessionStorage.removeItem(accountStorageKey)
    } catch {
      // La cuenta sigue disponible durante esta visita si el almacenamiento falla.
    }
  }, [state])
  const adminOrders = useSyncExternalStore(
    orderStatusService.subscribe,
    orderStatusService.getSnapshot,
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
      const adminOrder = adminOrders.find(
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
    adminOrders,
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
