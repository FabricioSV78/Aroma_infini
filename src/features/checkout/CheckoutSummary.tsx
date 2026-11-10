import { variantLabel } from '../../domain/product-type'
import { Link } from 'react-router'
import type { ResolvedCart } from '../../services/commerce-service'
import {
  calculateCheckout,
  type CheckoutDraft,
} from '../../services/checkout-service'
import { formatPEN } from '../../services/currency'
import { imageSource } from '../../services/image-source'
import { PriceDisplay } from '../../components/ui/PriceDisplay'
import { isRemoteCatalog } from '../../services/catalog-source'
import { useCheckout } from './checkout-context'

interface CheckoutSummaryProps {
  cart: ResolvedCart
  draft: CheckoutDraft
}

export function CheckoutSummary({ cart, draft }: CheckoutSummaryProps) {
  const { serverQuote, pendingConfirmation } = useCheckout()
  const amount = isRemoteCatalog
    ? (serverQuote ?? {
        subtotalCents: cart.subtotalCents,
        discountCents: 0,
        totalCents: null,
        shipping: { kind: 'pending' as const },
      })
    : calculateCheckout(cart, draft)
  return (
    <aside
      className="checkout-summary"
      aria-labelledby="checkout-summary-title"
    >
      <div className="checkout-summary-heading">
        <h2 id="checkout-summary-title">Tu selección</h2>
        <Link
          className="text-link"
          to="/carrito"
          aria-disabled={pendingConfirmation || undefined}
          onClick={(event) => {
            if (pendingConfirmation) event.preventDefault()
          }}
        >
          Editar
        </Link>
      </div>
      <ul className="checkout-summary-lines">
        {cart.lines.map((line) =>
          line.kind === 'ready' ? (
            <li key={line.item.variantId}>
              <img
                src={imageSource(line.product.image)}
                width={72}
                height={90}
                loading="lazy"
                decoding="async"
                alt=""
              />
              <div>
                <small>{line.brand?.name}</small>
                <strong>{line.product.name}</strong>
                <span>
                  {variantLabel(line.variant)} · Cant. {line.item.quantity}
                </span>
              </div>
              <span className="checkout-line-price">
                <PriceDisplay
                  originalCents={
                    (serverQuote?.lines.find(
                      (item) => item.variantId === line.item.variantId,
                    )?.originalUnitPriceCents ??
                      serverQuote?.lines.find(
                        (item) => item.variantId === line.item.variantId,
                      )?.unitPriceCents ??
                      line.originalUnitPriceCents) * line.item.quantity
                  }
                  finalCents={
                    (serverQuote?.lines.find(
                      (item) => item.variantId === line.item.variantId,
                    )?.unitPriceCents ?? line.unitPriceCents) *
                    line.item.quantity
                  }
                />
              </span>
            </li>
          ) : null,
        )}
      </ul>
      <dl className="checkout-totals">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatPEN(amount.subtotalCents)}</dd>
        </div>
        {amount.discountCents > 0 ? (
          <div>
            <dt>Descuento</dt>
            <dd>−{formatPEN(amount.discountCents)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Envío</dt>
          <dd>
            {amount.shipping.kind === 'quoted'
              ? amount.shipping.free
                ? 'Gratis'
                : formatPEN(amount.shipping.feeCents)
              : 'Por calcular'}
          </dd>
        </div>
        <div className="checkout-total">
          <dt>Total</dt>
          <dd>
            {amount.totalCents === null
              ? 'Pendiente'
              : formatPEN(amount.totalCents)}
          </dd>
        </div>
      </dl>
      {cart.productDiscountCents > 0 ? (
        <p className="checkout-product-savings">
          Ahorras {formatPEN(cart.productDiscountCents)} en productos
        </p>
      ) : null}
      {amount.discountCents > 0 ? (
        <p className="checkout-summary-note">
          El importe de entrega se calcula sobre el subtotal.
        </p>
      ) : null}
    </aside>
  )
}
