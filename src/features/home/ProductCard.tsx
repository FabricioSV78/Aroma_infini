import { Link } from 'react-router'
import type { Brand, Product } from '../../types/catalog'
import { Icon } from '../../components/ui/Icon'
import { useFavorites } from '../favorites/favorites-context'
import { getProductPresentation } from '../../services/product-presentation'
import { formatPEN } from '../../services/currency'
import { getCatalogProductGallery } from '../../services/catalog-service'
import { imageSource, imageSourceSet } from '../../services/image-source'

interface ProductCardProps {
  product: Product
  brand: Brand | undefined
  variant?: 'standard' | 'editorial'
  imageSizes?: string
  headingLevel?: 2 | 3
}
export function ProductCard({
  product,
  brand,
  variant = 'standard',
  imageSizes: imageSizesOverride,
  headingLevel = 3,
}: ProductCardProps) {
  const { favoriteIds, toggleFavorite } = useFavorites()
  const isFavorite = favoriteIds.has(product.id)
  const { inStock, priceCents, showFrom, variants } = getProductPresentation(
    product.variants,
  )
  const imageSizes =
    imageSizesOverride ??
    (variant === 'standard'
      ? '(min-width: 1440px) 296px, (min-width: 768px) 23vw, 46vw'
      : '(min-width: 1024px) 120px, 76px')
  const gallery = getCatalogProductGallery(product.id)
  const alternateImage = gallery?.[1]?.image
  const productImageAlt =
    gallery[0]?.alt.trim() ||
    `Frasco de ${product.name}${brand ? ` de ${brand.name}` : ''}`
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  return (
    <article className={`product-card product-card--${variant}`}>
      <div className="product-photo">
        <Link
          className={
            alternateImage
              ? 'product-image-link product-image-link--swap'
              : 'product-image-link'
          }
          to={`/producto/${product.slug}`}
          aria-label={`Ver ${product.name}`}
        >
          <img
            className="product-image-primary"
            src={imageSource(product.image)}
            srcSet={imageSourceSet(product.image, [480, 960])}
            sizes={imageSizes}
            width={1024}
            height={1280}
            loading="lazy"
            decoding="async"
            alt={productImageAlt}
          />
          {alternateImage && (
            <img
              className="product-image-alternate"
              src={imageSource(alternateImage)}
              srcSet={imageSourceSet(alternateImage, [480, 960])}
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
        <p className="eyebrow brand-label">{brand?.name}</p>
        <Heading>
          <Link to={`/producto/${product.slug}`}>
            {product.name}
            <Icon name="arrow" />
          </Link>
        </Heading>
        {variant === 'standard' && (
          <p className="product-family">{product.family}</p>
        )}
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
