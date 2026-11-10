// Compatibility entry point; persistence is shared with route data loaders.
export {
  parseStoredCart,
  readCart,
  writeCart,
  isCartStorageEvent,
} from '../../services/cart-storage'
