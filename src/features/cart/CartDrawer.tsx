import { Link } from 'react-router'
import { Dialog } from '../../components/ui/Dialog'
import { Icon } from '../../components/ui/Icon'
import { EmptyState } from '../../components/ui/EmptyState'
import { resolveCart } from '../../services/commerce-service'
import { useOfferPriceRevision } from '../../services/offer-price-clock'
import { formatPEN } from '../../services/currency'
import { CartLine } from './CartLine'
import { useCart } from './cart-context'

export function CartDrawer() {
  useOfferPriceRevision()
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
            {cart.productDiscountCents > 0 ? (
              <p className="cart-product-savings">
                Ahorras {formatPEN(cart.productDiscountCents)} en productos
              </p>
            ) : null}
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
        <EmptyState
          className="cart-drawer-empty"
          icon="bag"
          title="Tu carrito está vacío"
          description="Encuentra tu próxima elección en la tienda."
        >
          <Link
            className="button button--primary"
            to="/tienda"
            onClick={closeCart}
          >
            Explorar tienda <Icon name="arrow" />
          </Link>
          <Link className="text-link" to="/carrito" onClick={closeCart}>
            Ver carrito <Icon name="arrow" />
          </Link>
        </EmptyState>
      )}
    </Dialog>
  )
}
