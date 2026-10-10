import { OlfactoryProfile } from './OlfactoryProfile'
import { useState } from 'react'
import { Link, useLoaderData, useRevalidator } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { ProductCard } from '../home/ProductCard'
import type { Brand, Product, ProductDetail } from '../../types/catalog'
import { ProductGallery } from './ProductGallery'
import { productLoader } from './product-loader'
import { useFavorites } from '../favorites/favorites-context'
import { useCart } from '../cart/cart-context'
import { formatPEN } from '../../services/currency'
import { ProductReviewsPreview } from './ProductReviewsPreview'
import { ProductPopularityPreview } from './ProductPopularityPreview'
import { getBestsellingProducts } from '../../services/home-service'
import { getOlfactoryImage } from '../../content/olfactory-imagery'

interface ProductReadyProps {
  product: Product
  detail: ProductDetail
  brand: Brand | undefined
  recommendations: Product[]
  brands: Brand[]
}

type ProductInfoPanel = 'family' | 'description' | 'reviews'

function ProductReady({
  product,
  detail,
  brand,
  recommendations,
  brands,
}: ProductReadyProps) {
  const initialVariant =
    product.variants.find(
      (variant) => variant.active !== false && variant.stock > 0,
    ) ?? product.variants.find((variant) => variant.active !== false)
  const [selectedVariantId, setSelectedVariantId] = useState(
    initialVariant?.id ?? '',
  )
  const { favoriteIds, toggleFavorite } = useFavorites()
  const { addItem } = useCart()
  const [openInfoPanel, setOpenInfoPanel] = useState<ProductInfoPanel | null>(
    null,
  )
  const selectedVariant =
    product.variants.find(
      (variant) => variant.id === selectedVariantId && variant.active !== false,
    ) ?? initialVariant
  const isAvailable = Boolean(selectedVariant && selectedVariant.stock > 0)
  const selectedPrice = selectedVariant
    ? formatPEN(selectedVariant.priceCents)
    : 'Precio no disponible'

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
        <Link to="/">Inicio</Link>
        <span aria-hidden="true">/</span>
        <Link to="/tienda">Perfumes</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{product.name}</span>
      </nav>

      <div className="product-intro container" data-scroll-reveal="stagger">
        <ProductGallery name={product.name} views={detail.gallery} />
        <section className="product-purchase" aria-labelledby="product-title">
          <div className="product-purchase-heading">
            <div>
              {brand ? (
                <Link
                  className="product-brand"
                  to={`/tienda?marca=${brand.slug}`}
                >
                  {brand.name}
                </Link>
              ) : null}
              <p className="product-kind">
                {detail.type} <span aria-hidden="true">·</span> {product.family}
              </p>
            </div>
            <button
              type="button"
              className="product-save"
              aria-pressed={favoriteIds.has(product.id)}
              onClick={() => toggleFavorite(product.id)}
            >
              <Icon name="heart" />
              {favoriteIds.has(product.id) ? 'Guardado' : 'Guardar'}
            </button>
          </div>
          <h1 id="product-title">{product.name}</h1>
          <div
            className="product-selected-price"
            aria-live="polite"
            aria-label={`${selectedPrice}. ${isAvailable ? 'Disponible' : 'Agotado'}`}
          >
            <strong>{selectedPrice}</strong>
            {isAvailable ? null : (
              <span className="is-unavailable">Agotado</span>
            )}
          </div>
          <p className="product-lead">{detail.shortDescription}</p>

          <fieldset className="product-variants">
            <legend>Presentación</legend>
            {product.variants
              .filter((variant) => variant.active !== false)
              .map((variant) => (
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
                    <strong>{variant.ml} ml</strong>
                    <small>{formatPEN(variant.priceCents)}</small>
                  </span>
                  {variant.stock === 0 ? <em>Agotado</em> : null}
                </label>
              ))}
          </fieldset>

          <button
            type="button"
            className="button button--primary product-cart-button"
            disabled={!isAvailable}
            aria-describedby="product-purchase-note"
            onClick={() => {
              if (selectedVariant)
                addItem(selectedVariant.id, selectedVariant.stock, product.name)
            }}
          >
            <span className="product-cart-button__label">
              {isAvailable ? 'Añadir al carrito' : 'Presentación agotada'}
            </span>
          </button>
          <p id="product-purchase-note" className="sr-only">
            {isAvailable
              ? 'La presentación se añadirá a tu carrito.'
              : 'Puedes explorar otras presentaciones o perfumes relacionados.'}
          </p>

          <nav
            className="product-info-nav"
            aria-label="Información de este perfume"
          >
            <a
              href="#informacion-producto"
              onClick={() => setOpenInfoPanel('family')}
            >
              Familia olfativa <span aria-hidden="true">↓</span>
            </a>
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
        aria-label="Información del perfume"
        tabIndex={-1}
        data-scroll-reveal="copy"
      >
        <div
          className="product-info-tabs"
          role="group"
          aria-label="Detalles del perfume"
        >
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
            image={getOlfactoryImage(product.id, detail.notes)}
          />
        </div>

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
            sizes={[...new Set(product.variants.map((variant) => variant.ml))]}
          />
        </div>
      </section>
      <ProductPopularityPreview
        productImage={product.image}
        productName={product.name}
        description={detail.shortDescription}
        bestseller={getBestsellingProducts().some(
          (item) => item.id === product.id,
        )}
      />

      <section
        className="product-recommendations container"
        aria-labelledby="recommendations-title"
      >
        <header data-scroll-reveal="copy">
          <div>
            <p className="eyebrow">Seguir descubriendo</p>
            <h2 id="recommendations-title">También te puede gustar.</h2>
          </div>
          <Link className="text-link" to="/tienda">
            Ver tienda <Icon name="arrow" />
          </Link>
        </header>
        <div className="product-grid" data-scroll-reveal="stagger">
          {recommendations.map((item) => (
            <ProductCard
              key={item.id}
              product={item}
              brand={brands.find((candidate) => candidate.id === item.brandId)}
            />
          ))}
        </div>
      </section>
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
            ? 'Este perfume no está en la selección.'
            : 'Volvamos a intentarlo.'}
        </h1>
        {data.kind === 'error' ? (
          <button
            className="button button--primary"
            onClick={() => revalidator.revalidate()}
          >
            Reintentar
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
