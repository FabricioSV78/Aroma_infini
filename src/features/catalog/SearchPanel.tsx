import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { catalogService } from '../../services/catalog-service'
import { getProductPresentation } from '../../services/product-presentation'
import { getVariantPrice } from '../../services/product-discounts'
import { useOfferPriceRevision } from '../../services/offer-price-clock'
import { imageSource } from '../../services/image-source'
import { PriceDisplay } from '../../components/ui/PriceDisplay'
import { EmptyState } from '../../components/ui/EmptyState'
import { InlineStatus } from '../../components/ui/InlineStatus'

type Suggestions = Awaited<ReturnType<typeof catalogService.suggest>>
type SearchState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; items: Suggestions }
export function SearchPanel({ onClose }: { onClose: () => void }) {
  useOfferPriceRevision()
  const [query, setQuery] = useState('')
  const [retry, setRetry] = useState(0)
  const [state, setState] = useState<SearchState>({ kind: 'loading' })
  const navigate = useNavigate()
  useEffect(
    function loadSuggestions() {
      let cancelled = false
      const timer = setTimeout(
        () => {
          catalogService
            .suggest(query.trim())
            .then((items) => {
              if (!cancelled) setState({ kind: 'ready', items })
            })
            .catch(() => {
              if (!cancelled) setState({ kind: 'error' })
            })
        },
        query.trim() ? 200 : 0,
      )
      return () => {
        cancelled = true
        clearTimeout(timer)
      }
    },
    [query, retry],
  )
  return (
    <>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          if (!query.trim()) return
          onClose()
          navigate('/buscar?q=' + encodeURIComponent(query.trim()))
        }}
      >
        <label htmlFor="perfume-search">Producto o marca</label>
        <div className="search-fields">
          <input
            id="perfume-search"
            autoFocus
            type="search"
            name="q"
            placeholder="Por ejemplo, Bois Clair"
            required
            maxLength={100}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setState({ kind: 'loading' })
            }}
          />
          <button className="button button--primary">Buscar</button>
        </div>
      </form>
      <div className="search-suggestions" aria-busy={state.kind === 'loading'}>
        <p className="eyebrow">
          {query.trim() ? 'Coincidencias' : 'Sugerencias de la selección'}
        </p>
        {state.kind === 'loading' && (
          <InlineStatus busy>Buscando productos…</InlineStatus>
        )}
        {state.kind === 'error' && (
          <EmptyState
            headingLevel="h3"
            title="No pudimos cargar las sugerencias"
            description="Puedes reintentar o buscar el nombre completo."
            role="alert"
          >
            <button
              className="text-link"
              onClick={() => {
                setState({ kind: 'loading' })
                setRetry((value) => value + 1)
              }}
            >
              Reintentar
            </button>
          </EmptyState>
        )}
        {state.kind === 'ready' && (
          <>
            {state.items.length > 0 ? (
              <p className="sr-only" role="status">
                {state.items.length} sugerencias disponibles
              </p>
            ) : null}
            {state.items.length ? (
              <ul>
                {state.items.map((product) => {
                  const price = getProductPresentation(product.variants)
                  const variantPrices = price.variants.map((variant) =>
                    getVariantPrice(product, variant),
                  )
                  const displayPrice = variantPrices.reduce<
                    (typeof variantPrices)[number] | null
                  >(
                    (lowest, candidate) =>
                      !lowest || candidate.finalCents < lowest.finalCents
                        ? candidate
                        : lowest,
                    null,
                  )
                  return (
                    <li key={product.id}>
                      <Link to={'/producto/' + product.slug} onClick={onClose}>
                        <img
                          src={imageSource(product.image)}
                          alt=""
                          width={48}
                          height={60}
                          loading="lazy"
                          decoding="async"
                        />
                        <span className="search-suggestion-name">
                          <small>{product.brand?.name}</small>
                          <strong>{product.name}</strong>
                        </span>
                        <span>
                          {!price.inStock ? (
                            'Agotado'
                          ) : displayPrice === null ? (
                            'Sin precio'
                          ) : (
                            <PriceDisplay
                              originalCents={displayPrice.originalCents}
                              finalCents={displayPrice.finalCents}
                              prefix={
                                new Set(
                                  variantPrices.map(
                                    (candidate) => candidate.finalCents,
                                  ),
                                ).size > 1
                                  ? 'Desde'
                                  : undefined
                              }
                            />
                          )}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState
                headingLevel="h3"
                role="status"
                icon={query.trim() ? 'search' : 'store'}
                title={
                  query.trim()
                    ? 'No encontramos coincidencias'
                    : 'No hay productos disponibles'
                }
                description={
                  query.trim()
                    ? 'Prueba otro nombre de producto o marca.'
                    : 'Puedes volver a consultar la selección más adelante.'
                }
              />
            )}
            {query.trim() && (
              <Link
                className="text-link"
                to={'/buscar?q=' + encodeURIComponent(query.trim())}
                onClick={onClose}
              >
                Ver todos los resultados
              </Link>
            )}
          </>
        )}
      </div>
    </>
  )
}
