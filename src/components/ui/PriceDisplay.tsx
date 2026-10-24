import { formatPEN } from '../../services/currency'

interface PriceDisplayProps {
  originalCents: number
  finalCents: number
  prefix?: string
  className?: string
}

/** Keeps the current price and its real reference price together everywhere. */
export function PriceDisplay({
  originalCents,
  finalCents,
  prefix,
  className,
}: PriceDisplayProps) {
  const discounted = finalCents < originalCents

  return (
    <span
      className={[
        'price-display',
        discounted ? 'price-display--discounted' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {prefix ? <span className="price-display__prefix">{prefix}</span> : null}
      <strong className="price-display__current">
        {formatPEN(finalCents)}
      </strong>
      {discounted ? (
        <del className="price-display__original">
          {formatPEN(originalCents)}
        </del>
      ) : null}
    </span>
  )
}
