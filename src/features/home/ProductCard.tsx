import { isPerfume, variantLabel } from '../../domain/product-type'
import { Link } from 'react-router'
import type { Brand, Product } from '../../types/catalog'
import { Icon } from '../../components/ui/Icon'
import { useFavorites } from '../favorites/favorites-context'
import { getProductPresentation } from '../../services/product-presentation'
import { getVariantPrice } from '../../services/product-discounts'
import { getCatalogProductGallery } from '../../services/catalog-service'
import { imageSource, imageSourceSet } from '../../services/image-source'
import { PriceDisplay } from '../../components/ui/PriceDisplay'
import { OfferBadge } from '../../components/ui/OfferBadge'
import { useOfferPriceRevision } from '../../services/offer-price-clock'
import { storefrontRepository } from '../../services/storefront-repository'
import { isRemoteCatalog } from '../../services/catalog-source'
import { PRODUCT_CARD_IMAGE_SIZES } from '../../domain/product-card-image'
import { useImageStatus } from '../../components/media/useImageStatus'
import { ImagePlaceholder } from '../../components/media/ImagePlaceholder'

interface ProductCardProps {
  product: Product
  brand: Brand | undefined
  variant?: 'standard' | 'editorial'
  showAction?: boolean
  imageSizes?: string
  headingLevel?: 2 | 3
  preview?: boolean
}
export function ProductCard({
  product: suppliedProduct,
  brand: suppliedBrand,
  variant = 'standard',
  imageSizes: imageSizesOverride,
  headingLevel = 3,
  showAction = false,
  preview = false,
}: ProductCardProps) {
  useOfferPriceRevision()
  const snapshot = storefrontRepository.peekSnapshot()
  const product =
    !preview && isRemoteCatalog
      ? (snapshot.products.find(
          (record) => record.product.id === suppliedProduct.id,
        )?.product ?? suppliedProduct)
      : suppliedProduct
  const brand =
    !preview && isRemoteCatalog
      ? (snapshot.brands.find((record) => record.id === product.brandId) ??
        suppliedBrand)
      : suppliedBrand
  const {
    favoriteIds,
    toggleFavorite,
    loading: favoritesLoading,
    pendingIds,
    error: favoritesError,
  } = useFavorites()
  const isFavorite = favoriteIds.has(product.id)
  const { inStock, variants } = getProductPresentation(product.variants)
  const variantPrices = variants.map((variant) =>
    getVariantPrice(product, variant),
  )
  const displayPrice = variantPrices.reduce<
    (typeof variantPrices)[number] | null
  >(
    (lowest, price) =>
      !lowest || price.finalCents < lowest.finalCents ? price : lowest,
    null,
  )
  const showFrom =
    inStock && new Set(variantPrices.map((price) => price.finalCents)).size > 1
  const imageSizes =
    imageSizesOverride ??
    (variant === 'standard'
      ? PRODUCT_CARD_IMAGE_SIZES
      : '(min-width: 1024px) 120px, 76px')
  const gallery = getCatalogProductGallery(product.id)
  const alternateImage = gallery?.[1]?.image
  const primarySource = imageSource(product.image)
  const primarySourceSet = imageSourceSet(product.image, [480, 960])
  const { ref: primaryImageRef, state: primaryImageState } = useImageStatus(
    primarySource,
    primarySourceSet,
  )
  const alternateSource = alternateImage ? imageSource(alternateImage) : ''
  const alternateSourceSet = alternateImage
    ? imageSourceSet(alternateImage, [480, 960])
    : undefined
  const { ref: alternateImageRef, state: alternateImageState } = useImageStatus(
    alternateSource,
    alternateSourceSet,
  )
  const productImageAlt =
    gallery[0]?.alt.trim() ||
    `${isPerfume(product) ? 'Frasco de ' : ''}${product.name}${brand ? ` de ${brand.name}` : ''}`
  const Heading = headingLevel === 2 ? 'h2' : 'h3'
  const favoriteButton = (
    <button
      type="button"
      className="icon-button product-favorite"
      aria-label={`${isFavorite ? 'Quitar' : 'Guardar'} ${product.name} ${isFavorite ? 'de' : 'en'} favoritos`}
      aria-pressed={isFavorite}
      disabled={
        !preview &&
        (favoritesLoading ||
          pendingIds.has(product.id) ||
          Boolean(favoritesError))
      }
      aria-busy={!preview && (favoritesLoading || pendingIds.has(product.id))}
      aria-disabled={
        preview ||
        favoritesLoading ||
        pendingIds.has(product.id) ||
        Boolean(favoritesError)
      }
      tabIndex={preview ? -1 : undefined}
      title={
        preview
          ? 'Disponible en la tienda'
          : favoritesError ||
            (isFavorite ? 'Quitar de favoritos' : 'Guardar en favoritos')
      }
      onClick={() => {
        if (!preview) toggleFavorite(product.id)
      }}
    >
      <Icon name="heart" />
    </button>
  )
  return (
    <article className={`product-card product-card--${variant}`}>
      <div className="product-photo">
        <Link
          className={
            alternateImage && alternateImageState === 'ready'
              ? 'product-image-link media-loading-frame product-image-link--swap'
              : 'product-image-link media-loading-frame'
          }
          to={`/producto/${product.slug}`}
          aria-label={`Ver ${product.name}`}
          aria-disabled={preview}
          tabIndex={preview ? -1 : undefined}
        >
          <img
            ref={primaryImageRef}
            className="product-image-primary media-image"
            data-media-state={primaryImageState}
            aria-busy={primaryImageState === 'pending' ? true : undefined}
            src={primarySource}
            srcSet={primarySourceSet}
            sizes={imageSizes}
            width={1024}
            height={1280}
            loading="lazy"
            decoding="async"
            alt={primaryImageState === 'error' ? '' : productImageAlt}
            aria-hidden={primaryImageState === 'error' ? true : undefined}
          />
          {alternateImage && (
            <img
              ref={alternateImageRef}
              className="product-image-alternate media-image"
              data-media-state={alternateImageState}
              src={alternateSource}
              srcSet={alternateSourceSet}
              sizes={imageSizes}
              width={1024}
              height={1280}
              loading="lazy"
              decoding="async"
              alt=""
              aria-hidden="true"
            />
          )}
          <ImagePlaceholder
            state={primaryImageState}
            label={`Imagen no disponible: ${productImageAlt}`}
          />
        </Link>
        <OfferBadge
          discount={product.discount}
          price={inStock ? displayPrice : null}
        />
        {favoriteButton}
        {!inStock && <span className="stock-label">Agotado</span>}
      </div>
      <div className="product-meta">
        <p className="eyebrow brand-label">{brand?.name}</p>
        <Heading>
          <Link
            to={`/producto/${product.slug}`}
            aria-disabled={preview}
            tabIndex={preview ? -1 : undefined}
          >
            {product.name}
            {!showAction && <Icon name="arrow" />}
          </Link>
        </Heading>
        {variant !== 'editorial' && (
          <p className="product-family">
            {isPerfume(product) ? product.family : 'Complemento'}
          </p>
        )}
        <div className="product-price">
          {displayPrice ? (
            <PriceDisplay
              originalCents={displayPrice.originalCents}
              finalCents={
                inStock ? displayPrice.finalCents : displayPrice.originalCents
              }
              prefix={showFrom ? 'Desde' : !inStock ? 'Referencia:' : undefined}
            />
          ) : (
            <span>Sin precio disponible</span>
          )}
          <span className="product-volume">
            {variants.map(variantLabel).join(' · ')}
          </span>
        </div>
        {showAction && (
          <Link
            className="text-link product-action"
            to={`/producto/${product.slug}`}
            aria-label={`${isPerfume(product) ? 'Ver perfume' : 'Ver complemento'} ${product.name}`}
            aria-disabled={preview}
            tabIndex={preview ? -1 : undefined}
          >
            {isPerfume(product) ? 'Ver perfume' : 'Ver complemento'}{' '}
            <Icon name="arrow" />
          </Link>
        )}
      </div>
    </article>
  )
}
