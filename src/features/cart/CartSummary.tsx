import { Link } from 'react-router'
import {
  getFreeShippingThresholdCents,
  type ResolvedCart,
} from '../../services/commerce-service'
import { formatPEN } from '../../services/currency'

export function CartSummary({ cart }: { cart: ResolvedCart }) {
  const remaining = Math.max(
    0,
    getFreeShippingThresholdCents() - cart.subtotalCents,
  )
  const qualifies = remaining === 0
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
          <dd>{qualifies ? 'Gratis' : 'Por definir según destino'}</dd>
        </div>
        <div className="cart-summary-total">
          <dt>Total estimado</dt>
          <dd>
            {formatPEN(cart.subtotalCents)}
            {!qualifies ? ' + envío' : ''}
          </dd>
        </div>
      </dl>
      <p className="cart-shipping-note">
        {qualifies
          ? 'Tu selección alcanza el envío gratis.'
          : `Te faltan ${formatPEN(remaining)} para el envío gratis.`}
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
        Recorrido de demostración; sin cobros ni pedidos reales.
      </p>
    </aside>
  )
}
