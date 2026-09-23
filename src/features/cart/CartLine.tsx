import { Link } from 'react-router'
import type { ResolvedCartLine } from '../../services/commerce-service'
import { formatPEN } from '../../services/currency'
import { useCart } from './cart-context'

interface CartLineProps {
  line: ResolvedCartLine
  compact?: boolean
}

export function CartLine({ line, compact = false }: CartLineProps) {
  const { removeItem, setQuantity } = useCart()
  if (line.kind === 'missing')
    return (
      <article className="cart-line cart-line--unavailable">
        <div>
          <p className="eyebrow">Selección no disponible</p>
          <h3>Esta presentación cambió.</h3>
          <p>Retírala para continuar con tu selección.</p>
        </div>
        <button
          type="button"
          className="cart-remove"
          onClick={() => removeItem(line.item.variantId)}
        >
          Retirar
        </button>
      </article>
    )

  const { item, product, variant, brand, subtotalCents } = line
  const soldOut = variant.stock === 0
  const exceedsStock = item.quantity > variant.stock
  const issue = soldOut
    ? 'Esta presentación se agotó.'
    : exceedsStock
      ? `Quedan ${variant.stock} unidades. Ajusta la cantidad.`
      : item.quantity === variant.stock
        ? `Máximo disponible: ${variant.stock}.`
        : null

  return (
    <article className={`cart-line ${compact ? 'cart-line--compact' : ''}`}>
      <Link
        className="cart-line-image"
        to={`/producto/${product.slug}`}
        aria-label={`Ver ${product.name}`}
      >
        <img
          src={`/images/${product.image}-480.webp`}
          width={480}
          height={600}
          loading="lazy"
          decoding="async"
          alt=""
        />
      </Link>
      <div className="cart-line-main">
        <p className="eyebrow">{brand?.name}</p>
        <h3>
          <Link to={`/producto/${product.slug}`}>{product.name}</Link>
        </h3>
        <p className="cart-line-variant">
          {variant.ml} ml <span aria-hidden="true">·</span>{' '}
          {formatPEN(variant.priceCents)}
        </p>
        <div className="cart-line-actions">
          <div
            className="quantity-control"
            role="group"
            aria-label={`Cantidad de ${product.name}`}
          >
            <button
              type="button"
              aria-label={`Reducir cantidad de ${product.name}, ${variant.ml} ml`}
              disabled={item.quantity <= 1 || soldOut}
              onClick={() =>
                setQuantity(item.variantId, item.quantity - 1, variant.stock)
              }
            >
              <span aria-hidden="true">−</span>
            </button>
            <output aria-label={`${item.quantity} unidades`}>
              {item.quantity}
            </output>
            <button
              type="button"
              aria-label={`Aumentar cantidad de ${product.name}, ${variant.ml} ml`}
              disabled={soldOut || item.quantity >= variant.stock}
              onClick={() =>
                setQuantity(item.variantId, item.quantity + 1, variant.stock)
              }
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>
          <button
            type="button"
            className="cart-remove"
            onClick={() => removeItem(item.variantId)}
          >
            Retirar
          </button>
        </div>
        {issue ? (
          <p
            className="cart-line-note"
            role={line.needsAttention ? 'alert' : undefined}
          >
            {issue}
          </p>
        ) : null}
      </div>
      <p className="cart-line-subtotal">{formatPEN(subtotalCents)}</p>
    </article>
  )
}
