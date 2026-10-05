import { Link } from 'react-router'
import type { ResolvedCart } from '../../services/commerce-service'
import { formatPEN } from '../../services/currency'

export function CartSummary({ cart }: { cart: ResolvedCart }) {
  return (
    <aside className="cart-summary" aria-labelledby="cart-summary-title">
      <p className="eyebrow">Resumen</p>
      <h2 id="cart-summary-title">Tu selección</h2>
      <dl>
        <div>
          <dt>Subtotal</dt>
          <dd>{formatPEN(cart.subtotalCents)}</dd>
        </div>
        <div>
          <dt>Envío</dt>
          <dd>Según destino</dd>
        </div>
        <div className="cart-summary-total">
          <dt>Total estimado</dt>
          <dd>
            {formatPEN(cart.subtotalCents)}
            {' + envío'}
          </dd>
        </div>
      </dl>
      <p className="cart-shipping-note">
        Las opciones de entrega se muestran al elegir tu ubicación.
      </p>
      {cart.needsAttention ? (
        <p className="cart-attention" role="alert">
          Revisa las presentaciones señaladas antes de continuar.
        </p>
      ) : null}
      {cart.needsAttention ? (
        <button
          className="button button--primary cart-checkout"
          type="button"
          disabled
        >
          Revisa tu selección
        </button>
      ) : (
        <Link className="button button--primary cart-checkout" to="/checkout">
          Continuar al checkout
        </Link>
      )}
      <p className="cart-summary-caption">
        Puedes revisar los datos de entrega antes de guardar tu selección.
      </p>
    </aside>
  )
}
