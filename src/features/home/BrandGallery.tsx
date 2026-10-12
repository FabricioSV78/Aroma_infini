import { Link } from 'react-router'
import { useState, type CSSProperties } from 'react'
import { Icon } from '../../components/ui/Icon'
import type { HomeData } from '../../services/home-service'
import { BrandMonogram } from './BrandMonogram'

export function BrandGallery({
  brands,
  brandProfiles,
}: Pick<HomeData, 'brands' | 'brandProfiles'>) {
  const [paused, setPaused] = useState(false)
  const looping = brands.length > 1
  // Enough repeated groups to fill a wide viewport even with only two brands.
  const groupCount = looping ? Math.ceil(4 / brands.length) + 1 : 1

  return (
    <section
      id="marcas"
      tabIndex={-1}
      className="brand-signatures"
      aria-labelledby="brands-title"
      data-loop={looping}
      data-paused={paused}
    >
      <div className="container brand-signatures-inner">
        <header className="brand-signatures-heading" data-reveal="copy">
          <h2 id="brands-title">Firmas con carácter.</h2>
          <div className="brand-signatures-controls">
            <Link to="/marcas" className="text-link">
              Todas las marcas <Icon name="arrow" />
            </Link>
            {looping ? (
              <button
                type="button"
                className="brand-signatures-toggle"
                aria-pressed={paused}
                onClick={() => setPaused((current) => !current)}
              >
                {paused ? 'Reanudar movimiento' : 'Pausar movimiento'}
              </button>
            ) : null}
          </div>
        </header>
        <div
          className="brand-signatures-viewport"
          data-reveal="copy"
          onFocusCapture={(event) => {
            if (
              event.target instanceof HTMLElement &&
              event.target.matches(':focus-visible')
            )
              event.target.scrollIntoView({
                block: 'nearest',
                inline: 'center',
                behavior: 'instant',
              })
          }}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget))
              event.currentTarget.scrollLeft = 0
          }}
        >
          <div
            className="brand-signatures-track"
            style={
              {
                '--brand-group-count': groupCount,
                '--brand-count': brands.length,
              } as CSSProperties
            }
          >
            {Array.from({ length: groupCount }, (_, copy) => (
              <div
                key={copy}
                className="brand-signatures-group"
                aria-hidden={copy > 0 || undefined}
              >
                {brands.map((brand) => (
                  <Link
                    key={brand.id}
                    to={`/marcas/${brand.slug}`}
                    className="brand-signature"
                    aria-label={`Ver perfumes de ${brand.name}`}
                    tabIndex={copy > 0 ? -1 : undefined}
                  >
                    <BrandMonogram name={brand.name} />
                    <span className="brand-signature-copy">
                      <span className="brand-signature-name">{brand.name}</span>
                      {brandProfiles[brand.id]?.length ? (
                        <span className="brand-signature-profile">
                          {brandProfiles[brand.id].join(' · ')}
                        </span>
                      ) : null}
                      <span className="brand-signature-action">
                        Ver perfumes
                        <Icon name="arrow" className="brand-signature-arrow" />
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
