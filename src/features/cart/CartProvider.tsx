import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { CartItem } from '../../types/catalog'
import { isRemoteCatalog } from '../../services/catalog-source'
import { loadSelectionProducts } from '../../services/selection-catalog-service'
import {
  CartContext,
  type CartContextValue,
  type CartNotice,
} from './cart-context'
import {
  isCartStorageEvent,
  parseStoredCart,
  readCart,
  writeCart,
} from './cart-storage'

interface CartState {
  items: CartItem[]
  persistence: 'local' | 'session'
  notice: CartNotice | null
  writeToStorage: boolean
}

function readInitialState(): CartState {
  try {
    return {
      items: readCart(),
      persistence: 'local',
      notice: null,
      writeToStorage: false,
    }
  } catch {
    return {
      items: [],
      persistence: 'session',
      notice: null,
      writeToStorage: false,
    }
  }
}

function nextCartState(
  current: CartState,
  items: CartItem[],
  notice: CartNotice | null = current.notice,
): CartState {
  return { ...current, items, notice, writeToStorage: true }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CartState>(readInitialState)
  const [drawerOpen, setDrawerOpen] = useState(false)

  useEffect(() => {
    if (!isRemoteCatalog || !state.items.length) return
    let current = true
    void loadSelectionProducts(
      'cart',
      state.items.map((item) => item.variantId),
    ).catch(() => {
      if (current)
        setState((value) => ({
          ...value,
          notice: {
            id: Date.now(),
            message:
              'No pudimos actualizar tu carrito. Revisa tu conexión y vuelve a abrirlo.',
          },
        }))
    })
    return () => {
      current = false
    }
  }, [state.items, drawerOpen])

  useEffect(function synchronizeCart() {
    function handleStorage(event: StorageEvent) {
      if (!isCartStorageEvent(event)) return
      setState((current) => ({
        ...current,
        items: parseStoredCart(event.newValue),
        writeToStorage: false,
      }))
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  useEffect(
    function persistCart() {
      // Initial hydration and external storage events already reflect a stored
      // value. Echoing them can overwrite a newer edit from another tab.
      if (state.persistence === 'session' || !state.writeToStorage) return
      let fallbackTimer: number | undefined
      try {
        writeCart(state.items)
      } catch {
        fallbackTimer = window.setTimeout(() => {
          setState((current) => ({ ...current, persistence: 'session' }))
        }, 0)
      }
      return () => window.clearTimeout(fallbackTimer)
    },
    [state.items, state.persistence, state.writeToStorage],
  )

  const addItem = useCallback(
    (variantId: string, stock: number, productName: string) => {
      setState((current) => {
        if (!Number.isSafeInteger(stock) || stock < 1)
          return {
            ...current,
            notice: {
              id: Date.now(),
              message: 'Esta presentación está agotada.',
            },
          }
        const currentItem = current.items.find(
          (item) => item.variantId === variantId,
        )
        if (currentItem && currentItem.quantity >= stock)
          return {
            ...current,
            notice: {
              id: Date.now(),
              message: `Ya tienes el máximo disponible de ${productName}.`,
            },
          }
        const items = currentItem
          ? current.items.map((item) =>
              item.variantId === variantId
                ? { ...item, quantity: Math.min(item.quantity + 1, stock) }
                : item,
            )
          : [...current.items, { variantId, quantity: 1 }]
        return nextCartState(current, items, {
          id: Date.now(),
          message: `${productName} se añadió al carrito.`,
        })
      })
    },
    [],
  )

  const setQuantity = useCallback(
    (variantId: string, quantity: number, stock: number) => {
      if (!Number.isFinite(quantity) || stock < 1) return
      const nextQuantity = Math.max(1, Math.min(Math.floor(quantity), stock))
      setState((current) =>
        nextCartState(
          current,
          current.items.map((item) =>
            item.variantId === variantId
              ? { ...item, quantity: nextQuantity }
              : item,
          ),
        ),
      )
    },
    [],
  )

  const removeItem = useCallback((variantId: string) => {
    setState((current) =>
      nextCartState(
        current,
        current.items.filter((item) => item.variantId !== variantId),
      ),
    )
  }, [])

  const clearCart = useCallback(() => {
    setState((current) => nextCartState(current, [], null))
  }, [])

  const consumeItems = useCallback((purchased: readonly CartItem[]) => {
    const quantities = new Map<string, number>()
    for (const item of purchased) {
      if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) continue
      quantities.set(
        item.variantId,
        (quantities.get(item.variantId) ?? 0) + item.quantity,
      )
    }
    // Reconcile against the current cart: another tab may have added units
    // while the server was confirming the submitted selection.
    setState((current) =>
      nextCartState(
        current,
        current.items.flatMap((item) => {
          const quantity = item.quantity - (quantities.get(item.variantId) ?? 0)
          return quantity > 0 ? [{ ...item, quantity }] : []
        }),
        null,
      ),
    )
  }, [])

  const openCart = useCallback(() => setDrawerOpen(true), [])
  const closeCart = useCallback(() => setDrawerOpen(false), [])
  const dismissNotice = useCallback(
    () => setState((current) => ({ ...current, notice: null })),
    [],
  )

  const value = useMemo<CartContextValue>(
    () => ({
      items: state.items,
      itemCount: state.items.reduce((total, item) => total + item.quantity, 0),
      persistence: state.persistence,
      drawerOpen,
      notice: state.notice,
      addItem,
      setQuantity,
      removeItem,
      consumeItems,
      clearCart,
      openCart,
      closeCart,
      dismissNotice,
    }),
    [
      addItem,
      clearCart,
      closeCart,
      consumeItems,
      dismissNotice,
      drawerOpen,
      openCart,
      removeItem,
      setQuantity,
      state.items,
      state.notice,
      state.persistence,
    ],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
