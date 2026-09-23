import { createContext, useContext } from 'react'
import type { CartItem } from '../../types/catalog'

export interface CartNotice {
  id: number
  message: string
}

export interface CartContextValue {
  items: readonly CartItem[]
  itemCount: number
  persistence: 'local' | 'session'
  drawerOpen: boolean
  notice: CartNotice | null
  addItem: (variantId: string, stock: number, productName: string) => void
  setQuantity: (variantId: string, quantity: number, stock: number) => void
  removeItem: (variantId: string) => void
  clearCart: () => void
  openCart: () => void
  closeCart: () => void
  dismissNotice: () => void
}

export const CartContext = createContext<CartContextValue | null>(null)

export function useCart() {
  const value = useContext(CartContext)
  if (!value) throw new Error('useCart debe utilizarse dentro de CartProvider')
  return value
}
