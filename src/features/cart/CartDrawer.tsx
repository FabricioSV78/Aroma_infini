import { Link } from 'react-router'
import { Dialog } from '../../components/ui/Dialog'
import { Icon } from '../../components/ui/Icon'
import { resolveCart } from '../../services/commerce-service'
import { formatPEN } from '../../services/currency'
import { CartLine } from './CartLine'
import { useCart } from './cart-context'

export function CartDrawer() {
  const { items, drawerOpen, closeCart, persistence } = useCart()
  const cart = resolveCart(items)
  return (
    <Dialog
      id="cart-drawer"
      title={`Tu carrito${cart.quantity ? ` · ${cart.quantity}` : ''}`}
      open={drawerOpen}
      onClose={closeCart}
      className="cart-dialog"
    >
      {persistence === 'session' ? (
        <p className="storage-note" role="status">
          Tu selección se conservará solamente durante esta sesión.
        </p>
      ) : null}
      {cart.lines.length ? (
        <>
          <div className="cart-drawer-lines">
            {cart.lines.map((line) => (
              <CartLine key={line.item.variantId} line={line} compact />
            ))}
          </div>
          <div className="cart-drawer-footer">
            <div>
              <span>Subtotal</span>
              <strong>{formatPEN(cart.subtotalCents)}</strong>
            </div>
            <Link
              className="button button--primary"
              to="/carrito"
              onClick={closeCart}
            >
              Revisar carrito <Icon name="arrow" />
            </Link>
          </div>
        </>
      ) : (
        <div className="cart-drawer-empty">
          <p>Tu selección está vacía.</p>
          <Link
            className="button button--secondary"
            to="/carrito"
            onClick={closeCart}
          >
            Ver carrito <Icon name="arrow" />
          </Link>
          <Link className="text-link" to="/tienda" onClick={closeCart}>
            Explorar perfumes <Icon name="arrow" />
          </Link>
        </div>
      )}
    </Dialog>
  )
}
