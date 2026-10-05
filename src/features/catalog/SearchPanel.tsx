import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { catalogService } from '../../services/catalog-service'
import { getProductPresentation } from '../../services/product-presentation'
import { formatPEN } from '../../services/currency'
import { imageSource } from '../../services/image-source'

type Suggestions = Awaited<ReturnType<typeof catalogService.suggest>>
type SearchState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; items: Suggestions }
export function SearchPanel({ onClose }: { onClose: () => void }) {
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
        <label htmlFor="perfume-search">Perfume o marca</label>
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
        {state.kind === 'loading' && <p role="status">Buscando perfumes…</p>}
        {state.kind === 'error' && (
          <div role="status">
            <p>No pudimos cargar las sugerencias.</p>
            <button
              className="text-link"
              onClick={() => {
                setState({ kind: 'loading' })
                setRetry((value) => value + 1)
              }}
            >
              Reintentar
            </button>
          </div>
        )}
        {state.kind === 'ready' && (
          <>
            <p className="sr-only" role="status">
              {state.items.length} sugerencias disponibles
            </p>
            {state.items.length ? (
              <ul>
                {state.items.map((product) => {
                  const price = getProductPresentation(product.variants)
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
                          {!price.inStock
                            ? 'Agotado'
                            : price.priceCents === null
                              ? 'Sin precio'
                              : (price.showFrom ? 'Desde ' : '') +
                                formatPEN(price.priceCents)}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p>No hay coincidencias. Prueba otro nombre.</p>
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
