import { Link } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { EmptyState } from '../../components/ui/EmptyState'
import { resolveCart } from '../../services/commerce-service'
import { useOfferPriceRevision } from '../../services/offer-price-clock'
import { CartLine } from './CartLine'
import { useCart } from './cart-context'
import { CartSummary } from './CartSummary'

export function CartPage() {
  useOfferPriceRevision()
  const { items, persistence } = useCart()
  const cart = resolveCart(items)
  return (
    <section
      className="store-page commerce-page container"
      aria-labelledby="cart-page-title"
    >
      <header className="commerce-heading" data-scroll-reveal="fade">
        <p className="eyebrow">Tu selección</p>
        <h1 id="cart-page-title">Tu carrito</h1>
        <p>Revisa las presentaciones y cantidades antes de continuar.</p>
      </header>
      {persistence === 'session' ? (
        <p className="storage-note" role="status">
          No pudimos guardar el carrito en este navegador. Se conservará durante
          esta sesión.
        </p>
      ) : null}
      {cart.lines.length ? (
        <div className="cart-page-layout" data-scroll-reveal="stagger">
          <div className="cart-page-lines" aria-label="Productos en el carrito">
            {cart.lines.map((line) => (
              <CartLine key={line.item.variantId} line={line} />
            ))}
          </div>
          <CartSummary cart={cart} />
        </div>
      ) : (
        <EmptyState
          className="commerce-empty"
          icon="bag"
          title="Tu carrito está vacío"
          description="Explora la selección y añade tus favoritos para empezar."
          role="status"
        >
          <Link className="button button--primary" to="/tienda">
            Explorar tienda <Icon name="arrow" />
          </Link>
        </EmptyState>
      )}
    </section>
  )
}
