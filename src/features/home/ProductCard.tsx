import { Link } from 'react-router'
import type { Brand, Product } from '../../types/catalog'
import { Icon } from '../../components/ui/Icon'
import { useFavorites } from '../favorites/favorites-context'
import { getProductPresentation } from '../../services/product-presentation'
import { formatPEN } from '../../services/currency'

interface ProductCardProps {
  product: Product
  brand: Brand | undefined
  hoverImage?: string
  variant?: 'standard' | 'editorial'
}
export function ProductCard({
  product,
  brand,
  hoverImage,
  variant = 'standard',
}: ProductCardProps) {
  const { favoriteIds, toggleFavorite } = useFavorites()
  const isFavorite = favoriteIds.has(product.id)
  const { inStock, priceCents, showFrom, variants } = getProductPresentation(
    product.variants,
  )
  const imageSizes =
    variant === 'standard'
      ? '(min-width: 1440px) 296px, (min-width: 768px) 23vw, 46vw'
      : '(min-width: 1024px) 120px, 76px'
  return (
    <article className={`product-card product-card--${variant}`}>
      <div className="product-photo">
        <Link
          className={
            hoverImage
              ? 'product-image-link product-image-link--swap'
              : 'product-image-link'
          }
          to={`/producto/${product.slug}`}
          aria-label={`Ver ${product.name}`}
        >
          <img
            src={`/images/${product.image}-480.webp`}
            srcSet={`/images/${product.image}-480.webp 480w, /images/${product.image}-960.webp 960w`}
            sizes={imageSizes}
            width={1024}
            height={1280}
            loading="lazy"
            decoding="async"
            alt={`Frasco conceptual de ${product.name}; imagen temporal`}
          />
          {hoverImage && (
            <img
              className="product-image-alternate"
              src={`/images/${hoverImage}-480.webp`}
              srcSet={`/images/${hoverImage}-480.webp 480w, /images/${hoverImage}-960.webp 960w`}
              sizes={imageSizes}
              width={1024}
              height={1280}
              loading="lazy"
              decoding="async"
              alt=""
              aria-hidden="true"
            />
          )}
        </Link>
        <button
          type="button"
          className="icon-button product-favorite"
          aria-label={`${isFavorite ? 'Quitar' : 'Guardar'} ${product.name} ${isFavorite ? 'de' : 'en'} favoritos`}
          aria-pressed={isFavorite}
          title={isFavorite ? 'Quitar de favoritos' : 'Guardar en favoritos'}
          onClick={() => toggleFavorite(product.id)}
        >
          <Icon name="heart" />
        </button>
        {!inStock && <span className="stock-label">Agotado</span>}
      </div>
      <div className="product-meta">
        <p className="eyebrow">{brand?.name}</p>
        <h3>
          <Link to={`/producto/${product.slug}`}>
            {product.name}
            <Icon name="arrow" />
          </Link>
        </h3>
        <div className="product-price">
          <span>
            {showFrom && <span className="price-prefix">Desde </span>}
            {!inStock && priceCents !== null && (
              <span className="price-prefix">Referencia: </span>
            )}
            {priceCents === null
              ? 'Sin precio disponible'
              : formatPEN(priceCents)}
          </span>
          <span className="product-volume">
            {variants.map((variant) => `${variant.ml} ml`).join(' · ')}
          </span>
        </div>
      </div>
    </article>
  )
}
