import { Link } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { EmptyState } from '../../components/ui/EmptyState'
import { Spinner } from '../../components/ui/Spinner'
import { resolveFavoriteProducts } from '../../services/commerce-service'
import { ProductCard } from '../home/ProductCard'
import { useFavorites } from './favorites-context'
import { useStorefrontSnapshot } from '../../services/offer-price-clock'

export function FavoritesCollection() {
  useStorefrontSnapshot()
  const {
    favoriteIds,
    persistence,
    removeFavorite,
    loading,
    pendingIds,
    error,
    refreshFavorites,
  } = useFavorites()
  const favorites = resolveFavoriteProducts([...favoriteIds])

  return (
    <>
      {loading && favorites.found.length === 0 ? (
        <div className="commerce-empty" role="status" aria-live="polite">
          <Spinner />
          <p>Cargando tus favoritos…</p>
        </div>
      ) : null}
      {error ? (
        <div className="storage-note" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="text-link"
            onClick={refreshFavorites}
          >
            Reintentar
          </button>
        </div>
      ) : null}
      {persistence === 'session' ? (
        <p className="storage-note" role="status">
          Tus favoritos se conservarán solamente durante esta sesión.
        </p>
      ) : null}
      {favorites.found.length ? (
        <div
          className="favorites-grid product-grid"
          data-scroll-reveal="stagger"
        >
          {favorites.found.map(({ product, brand }) => (
            <ProductCard key={product.id} product={product} brand={brand} />
          ))}
        </div>
      ) : !loading && !error && favorites.missingIds.length === 0 ? (
        <EmptyState
          className="commerce-empty"
          icon="heart"
          title="Tu próxima elección empieza aquí"
          description="Usa el corazón de un producto para guardarlo en tus favoritos."
          role="status"
        >
          <Link className="button button--primary" to="/tienda">
            Explorar tienda <Icon name="arrow" />
          </Link>
        </EmptyState>
      ) : null}
      {!loading && !error && favorites.missingIds.length ? (
        <div
          className="favorite-unavailable"
          role="status"
          data-scroll-reveal="copy"
        >
          <p>
            {favorites.missingIds.length === 1
              ? 'Un favorito ya no está disponible en la selección.'
              : `${favorites.missingIds.length} favoritos ya no están disponibles en la selección.`}
          </p>
          {favorites.missingIds.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => removeFavorite(id)}
              disabled={pendingIds.has(id)}
              aria-busy={pendingIds.has(id)}
            >
              Retirar selección no disponible
            </button>
          ))}
          {favorites.found.length === 0 ? (
            <Link className="text-link" to="/tienda">
              Explorar tienda <Icon name="arrow" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
