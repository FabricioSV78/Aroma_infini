import { useState, useSyncExternalStore } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import type { HomeData } from '../../services/home-service'
import type { Product } from '../../types/catalog'
import { getAdminProduct } from '../../services/admin-service'
import { imageSource, imageSourceSet } from '../../services/image-source'

function alternateImage(product: Product) {
  return (
    getAdminProduct(product.id)?.detail.gallery[1]?.image ??
    `${product.image}-alternate`
  )
}

const galleryMedia = '(min-width: 768px)'
function subscribeGalleryLayout(onChange: () => void) {
  const media = window.matchMedia(galleryMedia)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
const readGalleryLayout = () => window.matchMedia(galleryMedia).matches
const serverGalleryLayout = () => false

export function BrandGallery({
  brands,
  bestsellers,
}: Pick<HomeData, 'brands' | 'bestsellers'>) {
  const desktop = useSyncExternalStore(
    subscribeGalleryLayout,
    readGalleryLayout,
    serverGalleryLayout,
  )
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const activeId = focusedId ?? hoveredId ?? brands[0]?.id
  const selection = brands.map((brand) => ({
    brand,
    product: bestsellers.find((product) => product.brandId === brand.id),
  }))
  return (
    <section
      id="marcas"
      tabIndex={-1}
      className="brand-gallery"
      aria-labelledby="brands-title"
    >
      <div className="brand-gallery-inner container">
        <header className="brand-intro" data-reveal="copy">
          <div>
            <p className="eyebrow">El universo multimarca</p>
            <h2 id="brands-title">Firmas con carácter.</h2>
          </div>
          <Link to="/marcas" className="text-link brand-action">
            Explorar todas las marcas <Icon name="arrow" />
          </Link>
        </header>
        <div className="brand-list" data-reveal="copy">
          {selection.map(({ brand, product }, index) => (
            <Link
              to={`/tienda?marca=${brand.slug}`}
              key={brand.id}
              className={
                activeId === brand.id
                  ? 'brand-entry brand-entry--active'
                  : 'brand-entry'
              }
              onPointerEnter={() => setHoveredId(brand.id)}
              onPointerLeave={() => setHoveredId(null)}
              onFocus={() => setFocusedId(brand.id)}
              onBlur={() => setFocusedId(null)}
            >
              {product && !desktop && (
                <img
                  className="brand-thumbnail"
                  src={imageSource(alternateImage(product))}
                  srcSet={imageSourceSet(alternateImage(product), [480, 960])}
                  sizes="(max-width: 767px) calc((100vw - 48px) / 2), 1px"
                  width={960}
                  height={1200}
                  loading="lazy"
                  decoding="async"
                  alt=""
                />
              )}
              <span className="brand-index" aria-hidden="true">
                0{index + 1}
              </span>
              <span className="brand-entry-copy">
                <span className="brand-name">{brand.name}</span>
                {product && (
                  <span className="brand-scent">{product.family}</span>
                )}
              </span>
              <Icon name="arrow" />
            </Link>
          ))}
        </div>
        {desktop && (
          <div className="brand-preview" aria-hidden="true" data-reveal="image">
            {selection.map(
              ({ brand, product }, index) =>
                product && (
                  <figure
                    className={
                      activeId === brand.id
                        ? 'brand-preview-frame is-active'
                        : 'brand-preview-frame'
                    }
                    key={brand.id}
                  >
                    <img
                      src={imageSource(alternateImage(product), 960)}
                      srcSet={imageSourceSet(
                        alternateImage(product),
                        [480, 960],
                      )}
                      sizes="(min-width: 1440px) 432px, (min-width: 768px) 34vw, 1px"
                      width={960}
                      height={1200}
                      loading={activeId === brand.id ? 'eager' : 'lazy'}
                      decoding="async"
                      alt=""
                    />
                    <figcaption>
                      <span>
                        0{index + 1} / {brand.name}
                      </span>
                      <span>{product.name}</span>
                    </figcaption>
                  </figure>
                ),
            )}
          </div>
        )}
      </div>
    </section>
  )
}
