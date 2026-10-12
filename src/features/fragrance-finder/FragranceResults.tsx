import { Link } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { formatPEN } from '../../services/currency'
import { imageSource } from '../../services/image-source'
import type { FinderResult } from '../../types/fragrance-finder'

import { resultCopy } from '../../content/fragrance-finder'

export function FragranceResults({
  result,
  onClose,
}: {
  result: FinderResult
  onClose: () => void
}) {
  return (
    <>
      {result.kind !== 'matches' && (
        <p className="finder-explanation">
          {resultCopy[result.kind].description}
        </p>
      )}
      {result.matches.length > 0 && (
        <div className="finder-results">
          {result.matches.map(
            ({ product, brand, variant, reasons }) => {
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
                        <strong>{formatPEN(variant.priceCents)}</strong>
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
            },
          )}
        </div>
      )}
    </>
  )
}
