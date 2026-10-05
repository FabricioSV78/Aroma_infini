import { Link } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { resolveCart } from '../../services/commerce-service'
import { CartLine } from './CartLine'
import { useCart } from './cart-context'
import { CartSummary } from './CartSummary'

export function CartPage() {
  const { items, persistence } = useCart()
  const cart = resolveCart(items)
  return (
    <section
      className="store-page commerce-page container"
      aria-labelledby="cart-page-title"
    >
      <header className="commerce-heading" data-scroll-reveal="fade">
        <p className="eyebrow">Tu selección</p>
        <h1 id="cart-page-title">Tu carrito.</h1>
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
        <div className="commerce-empty" data-scroll-reveal="copy">
          <p className="eyebrow">Aún no elegiste un perfume</p>
          <h2>Tu próxima fragancia puede empezar aquí.</h2>
          <p>
            Explora la selección y añade la presentación que quieras comparar.
          </p>
          <Link className="button button--primary" to="/tienda">
            Explorar perfumes <Icon name="arrow" />
          </Link>
        </div>
      )}
    </section>
  )
}
