import { OlfactoryProfile } from './OlfactoryProfile'
import { isPerfume, variantLabel } from '../../domain/product-type'
import { useState, useSyncExternalStore } from 'react'
import { Link, useLoaderData, useRevalidator } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { ProductCard } from '../home/ProductCard'
import type { Brand, Product, ProductDetail } from '../../types/catalog'
import { ProductGallery } from './ProductGallery'
import { productLoader } from './product-loader'
import { useFavorites } from '../favorites/favorites-context'
import { useCart } from '../cart/cart-context'
import {
  FavoritesContext,
  type FavoritesContextValue,
} from '../favorites/favorites-context'
import { CartContext, type CartContextValue } from '../cart/cart-context'
import { formatPEN } from '../../services/currency'
import { getVariantPrice } from '../../services/product-discounts'
import { getProductRecommendations } from '../../services/product-recommendations'
import { shippingService } from '../../services/shipping-service'
import { useOfferPriceRevision } from '../../services/offer-price-clock'
import { PriceDisplay } from '../../components/ui/PriceDisplay'
import { OfferBadge } from '../../components/ui/OfferBadge'
import { ProductReviewsPreview } from './ProductReviewsPreview'
import { ProductPopularityPreview } from './ProductPopularityPreview'
import { getBestsellingProducts } from '../../services/home-service'
import { brandStorePath } from '../../utils/brand-store-path'
import {
  getOlfactoryAromaLabel,
  getProductOlfactoryFamilies,
} from '../../domain/olfactory-family'

interface ProductReadyProps {
  product: Product
  detail: ProductDetail
  brand: Brand | undefined
  recommendations: Product[]
  brands: Brand[]
  preview?: boolean
}

type ProductInfoPanel = 'family' | 'description' | 'reviews'

function ProductReady({
  product,
  detail,
  brand,
  recommendations,
  brands,
  preview = false,
}: ProductReadyProps) {
  useOfferPriceRevision()
  const initialVariant =
    product.variants.find(
      (variant) => variant.active !== false && variant.stock > 0,
    ) ?? product.variants.find((variant) => variant.active !== false)
  const [selectedVariantId, setSelectedVariantId] = useState(
    initialVariant?.id ?? '',
  )
  const { favoriteIds, toggleFavorite } = useFavorites()
  const { addItem } = useCart()
  const shipping = useSyncExternalStore(
    shippingService.subscribe,
    shippingService.getSnapshot,
  )
  const [openInfoPanel, setOpenInfoPanel] = useState<ProductInfoPanel | null>(
    isPerfume(product) ? null : 'description',
  )
  const [previewMessage, setPreviewMessage] = useState('')
  const selectedVariant =
    product.variants.find(
      (variant) => variant.id === selectedVariantId && variant.active !== false,
    ) ?? initialVariant
  const isAvailable = Boolean(selectedVariant && selectedVariant.stock > 0)
  const selectedPrice = selectedVariant
    ? getVariantPrice(product, selectedVariant)
    : null
  const displayedPrice =
    selectedPrice && !isAvailable
      ? {
          ...selectedPrice,
          finalCents: selectedPrice.originalCents,
          discountCents: 0,
          discountActive: false,
        }
      : selectedPrice
  const hasTimedOffer = Boolean(
    isAvailable &&
    displayedPrice?.discountActive &&
    product.discount?.endsAt.trim(),
  )
  const perfume = isPerfume(product)
  const olfactoryFamilies = perfume ? getProductOlfactoryFamilies(product) : []

  function toggleInfoPanel(panel: ProductInfoPanel) {
    setOpenInfoPanel((current) => (current === panel ? null : panel))
  }

  return (
    <article className="store-page product-page">
      <nav
        className="product-breadcrumb container"
        aria-label="Ruta de navegación"
        data-scroll-reveal="fade"
      >
        <Link
          to="/"
          aria-disabled={preview}
          tabIndex={preview ? -1 : undefined}
        >
          Inicio
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          to={
            isPerfume(product)
              ? '/tienda?tipo=perfume'
              : '/tienda?tipo=complemento'
          }
          aria-disabled={preview}
          tabIndex={preview ? -1 : undefined}
        >
          {isPerfume(product) ? 'Perfumes' : 'Complementos'}
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{product.name}</span>
      </nav>

      <div className="product-intro container" data-scroll-reveal="stagger">
        {detail.gallery.length ? (
          <ProductGallery name={product.name} views={detail.gallery} />
        ) : (
          <section
            className="product-gallery product-gallery--empty"
            aria-label="Galería del producto"
          >
            <p>Agrega una fotografía para completar la galería.</p>
          </section>
        )}
        <section className="product-purchase" aria-labelledby="product-title">
          <div className="product-purchase-heading">
            <div>
              {brand ? (
                <Link
                  className="product-brand"
                  to={brandStorePath(brand.slug)}
                  aria-disabled={preview}
                  tabIndex={preview ? -1 : undefined}
                >
                  {brand.name}
                </Link>
              ) : null}
              {!perfume || olfactoryFamilies.length ? (
                <p className="product-kind">
                  {perfume
                    ? olfactoryFamilies.map(getOlfactoryAromaLabel).join(' · ')
                    : 'Complemento'}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              className="product-save"
              aria-pressed={favoriteIds.has(product.id)}
              onClick={() =>
                preview
                  ? setPreviewMessage(
                      'Los favoritos estarán disponibles en la tienda.',
                    )
                  : toggleFavorite(product.id)
              }
            >
              <Icon name="heart" />
              {favoriteIds.has(product.id) ? 'Guardado' : 'Guardar'}
            </button>
          </div>
          <h1 id="product-title">{product.name}</h1>
          <div
            className="product-selected-price"
            aria-live="polite"
            aria-label={`${displayedPrice ? `Precio ${formatPEN(displayedPrice.finalCents)}${displayedPrice.discountActive ? `, antes ${formatPEN(displayedPrice.originalCents)}` : ''}` : 'Precio no disponible'}. ${isAvailable ? 'Disponible' : 'Agotado'}`}
          >
            <div className="product-selected-price__amounts">
              <OfferBadge
                discount={product.discount}
                price={displayedPrice}
                inline
              />
              {displayedPrice ? (
                <PriceDisplay
                  originalCents={displayedPrice.originalCents}
                  finalCents={displayedPrice.finalCents}
                />
              ) : (
                <strong>Precio no disponible</strong>
              )}
            </div>
            {isAvailable ? null : (
              <span className="is-unavailable">Agotado</span>
            )}
          </div>
          <p className="product-lead">{detail.shortDescription}</p>
          {hasTimedOffer || shipping.freeThresholdCents > 0 ? (
            <ul
              className="product-purchase-notices"
              aria-label="Condiciones de compra"
            >
              {hasTimedOffer ? (
                <li>
                  <Icon name="clock" />
                  <span>Oferta por tiempo limitado</span>
                </li>
              ) : null}
              {shipping.freeThresholdCents > 0 ? (
                <li>
                  <Icon name="truck" />
                  <span>
                    Envío gratis desde {formatPEN(shipping.freeThresholdCents)}
                  </span>
                </li>
              ) : null}
            </ul>
          ) : null}

          <fieldset className="product-variants">
            <legend>Presentación</legend>
            {product.variants
              .filter((variant) => variant.active !== false)
              .map((variant) => {
                const price = getVariantPrice(product, variant)
                return (
                  <label
                    key={variant.id}
                    className={variant.stock > 0 ? '' : 'is-unavailable'}
                  >
                    <input
                      type="radio"
                      name={`variant-${product.id}`}
                      value={variant.id}
                      checked={selectedVariantId === variant.id}
                      onChange={() => setSelectedVariantId(variant.id)}
                    />
                    <span>
                      <strong>{variantLabel(variant)}</strong>
                      <small>
                        <PriceDisplay
                          originalCents={price.originalCents}
                          finalCents={
                            variant.stock > 0
                              ? price.finalCents
                              : price.originalCents
                          }
                        />
                      </small>
                    </span>
                    {variant.stock === 0 ? <em>Agotado</em> : null}
                  </label>
                )
              })}
          </fieldset>

          <button
            type="button"
            className="button button--primary product-cart-button"
            disabled={!isAvailable}
            aria-describedby="product-purchase-note"
            onClick={() => {
              if (preview) {
                setPreviewMessage('La compra estará disponible en la tienda.')
              } else if (selectedVariant) {
                addItem(selectedVariant.id, selectedVariant.stock, product.name)
              }
            }}
          >
            <span className="product-cart-button__label">
              {isAvailable ? 'Añadir al carrito' : 'Presentación agotada'}
            </span>
          </button>
          <p id="product-purchase-note" className="sr-only">
            {isAvailable
              ? 'La presentación se añadirá a tu carrito.'
              : 'Puedes explorar otras presentaciones o productos relacionados.'}
          </p>
          {preview ? (
            <p
              className="product-preview-status"
              role="status"
              aria-live="polite"
            >
              {previewMessage}
            </p>
          ) : null}

          <ul
            className={`product-purchase-benefits${perfume ? '' : ' product-purchase-benefits--two'}`}
            aria-label="Beneficios de compra"
          >
            {perfume && (
              <li>
                <Icon name="shieldCheck" />
                <span>
                  <strong>100% original</strong>
                  <small>Productos garantizados</small>
                </span>
              </li>
            )}
            <li>
              <Icon name="card" />
              <span>
                <strong>Pago seguro</strong>
                <small>Compra protegida</small>
              </span>
            </li>
            <li>
              <Icon name="truck" />
              <span>
                <strong>
                  {shipping.provinceShippingEnabled
                    ? 'Envíos a todo el Perú'
                    : 'Envíos a Lima y Callao'}
                </strong>
                <small>Opciones de entrega disponibles</small>
              </span>
            </li>
          </ul>

          <nav
            className="product-info-nav"
            aria-label="Información de este producto"
          >
            {perfume && (
              <a
                href="#informacion-producto"
                onClick={() => setOpenInfoPanel('family')}
              >
                Familia olfativa <span aria-hidden="true">↓</span>
              </a>
            )}
            <a
              href="#informacion-producto"
              onClick={() => setOpenInfoPanel('description')}
            >
              Descripción <span aria-hidden="true">↓</span>
            </a>
            <a
              href="#informacion-producto"
              onClick={() => setOpenInfoPanel('reviews')}
            >
              Reseñas <span aria-hidden="true">↓</span>
            </a>
          </nav>
        </section>
      </div>

      <section
        id="informacion-producto"
        className="product-information"
        aria-label="Información del producto"
        tabIndex={-1}
        data-scroll-reveal="copy"
      >
        <div
          className="product-info-tabs"
          role="group"
          aria-label="Detalles del producto"
        >
          {perfume && (
            <button
              id="product-info-tab-family"
              type="button"
              aria-expanded={openInfoPanel === 'family'}
              aria-controls="product-info-panel-family"
              onClick={() => toggleInfoPanel('family')}
            >
              Familia olfativa
              <Icon name="chevron" className="product-info-chevron" />
            </button>
          )}
          <button
            id="product-info-tab-description"
            type="button"
            aria-expanded={openInfoPanel === 'description'}
            aria-controls="product-info-panel-description"
            onClick={() => toggleInfoPanel('description')}
          >
            Descripción
            <Icon name="chevron" className="product-info-chevron" />
          </button>
          <button
            id="product-info-tab-reviews"
            type="button"
            aria-expanded={openInfoPanel === 'reviews'}
            aria-controls="product-info-panel-reviews"
            onClick={() => toggleInfoPanel('reviews')}
          >
            Reseñas
            <Icon name="chevron" className="product-info-chevron" />
          </button>
        </div>

        {perfume && (
          <div
            id="product-info-panel-family"
            className="product-info-panel product-info-panel--family container"
            role="region"
            aria-labelledby="product-info-tab-family"
            hidden={openInfoPanel !== 'family'}
          >
            <OlfactoryProfile
              family={product.family}
              detail={detail}
              image={detail.olfactoryImage ?? undefined}
            />
          </div>
        )}

        <div
          id="product-info-panel-description"
          className="product-info-panel product-info-panel--description container"
          role="region"
          aria-labelledby="product-info-tab-description"
          hidden={openInfoPanel !== 'description'}
        >
          <p className="product-description-copy">{detail.description}</p>
        </div>

        <div
          id="product-info-panel-reviews"
          className="product-info-panel product-info-panel--reviews"
          role="region"
          aria-labelledby="product-info-tab-reviews"
          hidden={openInfoPanel !== 'reviews'}
        >
          <ProductReviewsPreview
            productId={product.id}
            productType={product.productType}
            sizes={[
              ...new Set(
                product.variants
                  .map((variant) => variant.ml)
                  .filter((ml): ml is number => ml !== null),
              ),
            ]}
            readOnly={preview}
          />
        </div>
      </section>
      {product.image ? (
        <ProductPopularityPreview
          productImage={product.image}
          productName={product.name}
          description={detail.shortDescription}
          bestseller={getBestsellingProducts().some(
            (item) => item.id === product.id,
          )}
        />
      ) : null}

      {recommendations.length > 0 && (
        <section
          className="product-recommendations container"
          aria-labelledby="recommendations-title"
        >
          <header data-scroll-reveal="copy">
            <div>
              <p className="eyebrow">Seguir descubriendo</p>
              <h2 id="recommendations-title">También te puede gustar</h2>
            </div>
            <Link
              className="text-link"
              to="/tienda"
              aria-disabled={preview}
              tabIndex={preview ? -1 : undefined}
            >
              Ver tienda <Icon name="arrow" />
            </Link>
          </header>
          <div className="product-grid" data-scroll-reveal="stagger">
            {recommendations.map((item) => (
              <ProductCard
                key={item.id}
                product={item}
                brand={brands.find(
                  (candidate) => candidate.id === item.brandId,
                )}
                preview={preview}
              />
            ))}
          </div>
        </section>
      )}
    </article>
  )
}

export function ProductPage() {
  const data = useLoaderData<typeof productLoader>()
  const revalidator = useRevalidator()
  if (data.kind !== 'ready') {
    return (
      <section
        className="store-page product-state container"
        data-scroll-reveal="fade"
      >
        <p className="eyebrow">
          {data.kind === 'missing'
            ? 'Producto no encontrado'
            : 'No pudimos cargar la ficha'}
        </p>
        <h1>
          {data.kind === 'missing'
            ? 'Este perfume no está en la selección'
            : 'Volvamos a intentarlo'}
        </h1>
        {data.kind === 'error' ? (
          <button
            className="button button--primary"
            disabled={revalidator.state !== 'idle'}
            aria-busy={revalidator.state !== 'idle'}
            onClick={() => revalidator.revalidate()}
          >
            {revalidator.state !== 'idle' ? 'Cargando el producto…' : 'Reintentar'}
          </button>
        ) : null}
        <Link className="text-link" to="/tienda">
          Explorar tienda <Icon name="arrow" />
        </Link>
      </section>
    )
  }

  return <ProductReady key={data.product.id} {...data} />
}

const ignorePreviewAction = () => {}
const previewFavorites: FavoritesContextValue = {
  favoriteIds: new Set<string>(),
  favoriteCount: 0,
  persistence: 'session',
  toggleFavorite: ignorePreviewAction,
  removeFavorite: ignorePreviewAction,
}
const previewCart: CartContextValue = {
  items: [],
  itemCount: 0,
  persistence: 'session',
  drawerOpen: false,
  notice: null,
  addItem: ignorePreviewAction,
  setQuantity: ignorePreviewAction,
  removeItem: ignorePreviewAction,
  clearCart: ignorePreviewAction,
  openCart: ignorePreviewAction,
  closeCart: ignorePreviewAction,
  dismissNotice: ignorePreviewAction,
}

interface ProductDetailPreviewProps {
  record: { product: Product; detail: ProductDetail }
  brands: Brand[]
  products: Product[]
}

/** Renders the customer detail from the unsaved form, without accessing the published record. */
export function ProductDetailPreview({
  record,
  brands,
  products,
}: ProductDetailPreviewProps) {
  const { product } = record
  const detail = {
    ...record.detail,
    gallery: record.detail.gallery.filter((view) => view.image.trim()),
  }
  if (!detail.gallery.length && product.image.trim()) {
    detail.gallery = [
      {
        image: product.image,
        alt: `Imagen de ${product.name}`,
        framing: 'full',
      },
    ]
  }
  const recommendations = getProductRecommendations(
    product,
    detail.recommendationIds,
    products,
  )

  return (
    <FavoritesContext.Provider value={previewFavorites}>
      <CartContext.Provider value={previewCart}>
        <div
          className="store-layout product-detail-preview"
          onClickCapture={(event) => {
            const anchor =
              event.target instanceof Element
                ? event.target.closest('a[href]')
                : null
            if (!anchor) return
            event.preventDefault()
            const href = anchor.getAttribute('href')
            if (href?.startsWith('#')) {
              event.currentTarget.querySelector(href)?.scrollIntoView({
                block: 'start',
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
                  .matches
                  ? 'auto'
                  : 'smooth',
              })
            }
          }}
        >
          <ProductReady
            key={product.id}
            product={product}
            detail={detail}
            brand={brands.find((item) => item.id === product.brandId)}
            recommendations={recommendations}
            brands={brands}
            preview
          />
        </div>
      </CartContext.Provider>
    </FavoritesContext.Provider>
  )
}
