import type { ProductDiscount } from '../../types/catalog'
import type { VariantPrice } from '../../services/product-discounts'
import { formatPEN } from '../../services/currency'

interface OfferBadgeProps {
  discount: ProductDiscount | null | undefined
  price: VariantPrice | null | undefined
  inline?: boolean
}

/** The badge describes the same valid, active offer as the displayed price. */
export function OfferBadge({
  discount,
  price,
  inline = false,
}: OfferBadgeProps) {
  if (!price?.discountActive || !discount) return null

  return (
    <span
      className={`offer-label${inline ? ' offer-label--inline' : ''}${discount?.type === 'fixed' ? ' offer-label--fixed' : ''}`}
    >
      {discount?.type === 'percent' ? (
        <>
          <span aria-hidden="true">−{discount.value} %</span>
          <span className="sr-only">
            Oferta: {discount.value} % de descuento
          </span>
        </>
      ) : (
        <>
          <span aria-hidden="true">−{formatPEN(price.discountCents)}</span>
          <span className="sr-only">
            Oferta: ahorra {formatPEN(price.discountCents)}
          </span>
        </>
      )}
    </span>
  )
}
