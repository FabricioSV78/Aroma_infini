import { Link } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { getVariantPrice } from '../../services/product-discounts'
import { useOfferPriceRevision } from '../../services/offer-price-clock'
import { imageSource } from '../../services/image-source'
import { PriceDisplay } from '../../components/ui/PriceDisplay'
import { OfferBadge } from '../../components/ui/OfferBadge'
import type { FinderResult } from '../../types/fragrance-finder'
import type { HomeFinderContent } from '../../types/home'

export function FragranceResults({
  result,
  onClose,
  content,
}: {
  result: FinderResult
  onClose: () => void
  content: HomeFinderContent
}) {
  useOfferPriceRevision()
  return (
    <>
      {result.kind !== 'matches' && (
        <p className="finder-explanation">
          {content.resultCopy[result.kind].description}
        </p>
      )}
      {result.matches.length > 0 && (
        <div className="finder-results">
          {result.matches.map(({ product, brand, variant, reasons }) => {
            const price = getVariantPrice(product, variant)
            // The product profile and price already show these facts. Keep the
            // explanation focused on other preferences from the product record.
            const distinctReasons = reasons.filter(
              (reason) =>
                !reason.startsWith('Perfil ') &&
                !reason.includes('dentro de tu presupuesto.'),
            )
            const visibleReasons =
              result.kind === 'budget' ? [] : distinctReasons.slice(0, 2)

            return (
              <article className="finder-result" key={product.id}>
                <div className="finder-result-photo">
                  <img
                    src={imageSource(product.image)}
                    width="480"
                    height="600"
                    alt={`Frasco de ${product.name}`}
                    decoding="async"
                  />
                  <OfferBadge discount={product.discount} price={price} />
                </div>
                <div className="finder-result-body">
                  <div className="finder-result-identity">
                    <span className="finder-brand">{brand?.name}</span>
                    <h4>{product.name}</h4>
                    <p className="finder-profile">{product.family}</p>
                  </div>
                  {visibleReasons.length > 0 && (
                    <div className="finder-reason-group">
                      <p className="finder-reason-label">Coincide contigo</p>
                      <ul className="finder-reasons">
                        {visibleReasons.map((reason) => (
                          <li key={reason}>
                            <Icon name="check" />
                            <span>{reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="finder-result-offer">
                    <p className="finder-price">
                      <PriceDisplay
                        originalCents={price.originalCents}
                        finalCents={price.finalCents}
                      />
                      <span>{variant.ml} ml · Disponible</span>
                    </p>
                    <Link
                      className="finder-product-link"
                      to={`/producto/${product.slug}`}
                      onClick={onClose}
                    >
                      Ver perfume <Icon name="arrow" />
                    </Link>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}
