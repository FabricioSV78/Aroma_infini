import { Link } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { resolveFavoriteProducts } from '../../services/commerce-service'
import { ProductCard } from '../home/ProductCard'
import { useFavorites } from './favorites-context'

export function FavoritesCollection() {
  const { favoriteIds, persistence, removeFavorite } = useFavorites()
  const favorites = resolveFavoriteProducts([...favoriteIds])

  return (
    <>
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
      ) : favorites.missingIds.length === 0 ? (
        <div className="commerce-empty" data-scroll-reveal="copy">
          <p className="eyebrow">Tu selección está vacía</p>
          <h2>Encuentra un aroma para recordar.</h2>
          <p>
            Usa el corazón de cualquier perfume para guardarlo en esta página.
          </p>
          <Link className="button button--primary" to="/tienda">
            Explorar perfumes <Icon name="arrow" />
          </Link>
        </div>
      ) : null}
      {favorites.missingIds.length ? (
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
            <button key={id} type="button" onClick={() => removeFavorite(id)}>
              Retirar selección no disponible
            </button>
          ))}
        </div>
      ) : null}
    </>
  )
}
