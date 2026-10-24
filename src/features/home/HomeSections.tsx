import { Link } from 'react-router'
import '../../styles/home-categories.css'
import { SectionHeading } from '../../components/ui/SectionHeading'
import { Icon } from '../../components/ui/Icon'
import { categories } from '../../content/home'
import { fourCategoryImages } from '../../content/category-images'
import type { HomeData } from '../../services/home-service'
import { imageSource, imageSourceSet } from '../../services/image-source'
import { ProductCard } from './ProductCard'

// Match the four-column desktop grid and two-column mobile/tablet layout,
// including the existing 2.5% hover zoom.
const fourCategorySizes =
  '(min-width: 1760px) 406px, (min-width: 1600px) calc((100vw - 176px) / 4 * 1.025), (min-width: 1024px) calc((94vw - 80px) / 4 * 1.025), (min-width: 768px) calc((100vw - 64px) / 2 * 1.025), (min-width: 360px) calc((100vw - 48px) / 2 * 1.025), calc((100vw - 44px) / 2 * 1.025)'

export function Categories({
  media,
  features,
}: Pick<HomeData, 'media' | 'features'>) {
  const visibleCategories = categories.filter(
    (category) => category.id !== 'complementos' || features.complementsEnabled,
  )
  const fourCategories = features.complementsEnabled
  return (
    <section
      className="section container discovery-section"
      id="descubrir"
      tabIndex={-1}
      aria-labelledby="categories-title"
    >
      <SectionHeading
        id="categories-title"
        eyebrow={`${fourCategories ? 'Cuatro' : 'Tres'} formas de explorar`}
        title="Elige por dónde empezar"
      />
      <div
        className={`category-grid${fourCategories ? ' category-grid--four' : ''}`}
      >
        {visibleCategories.map((category) => {
          const uploaded = media[category.id as keyof typeof media]
          const framed = fourCategories
            ? fourCategoryImages[category.id as keyof typeof fourCategoryImages]
            : undefined
          const image = uploaded ?? framed?.image ?? category.image
          return (
            <Link
              to={category.to}
              className={`category category--${category.layout}`}
              data-reveal={category.reveal}
              key={category.title}
            >
              <div className="category-image">
                <img
                  src={imageSource(image, 480)}
                  srcSet={imageSourceSet(
                    image,
                    framed?.widths ?? category.imageWidths ?? [480, 960, 1536],
                  )}
                  sizes={
                    fourCategories
                      ? fourCategorySizes
                      : '(min-width: 1440px) 760px, (min-width: 768px) 55vw, (max-width: 767px) 100vw'
                  }
                  style={{
                    objectPosition: uploaded || framed ? 'center' : undefined,
                  }}
                  width={framed?.width ?? category.width}
                  height={framed?.height ?? category.height}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <div className="category-copy">
                <div>
                  <h3>{category.title}</h3>
                  <p>{category.description}</p>
                </div>
                <span className="category-arrow">
                  <Icon name="arrow" />
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

export function Bestsellers({
  brands,
  bestsellers,
}: Pick<HomeData, 'brands' | 'bestsellers'>) {
  return (
    <section
      className="section container bestsellers-section"
      id="mas-vendidos"
      tabIndex={-1}
      aria-labelledby="bestsellers-title"
    >
      <SectionHeading
        id="bestsellers-title"
        eyebrow="Selección Aroma Infini"
        title="Más vendidos"
        action={
          <Link className="text-link" to="/tienda?orden=mas-vendidos">
            Ver selección
            <Icon name="arrow" />
          </Link>
        }
      />
      <div className="product-grid" data-reveal="image">
        {bestsellers.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            showAction
            imageSizes="(min-width: 1760px) 396px, (min-width: 1024px) 23vw, 46vw"
            brand={brands.find((brand) => brand.id === product.brandId)}
          />
        ))}
      </div>
    </section>
  )
}

export function TrustInformation() {
  const links = [
    {
      id: 'delivery',
      to: '/envios',
      icon: 'truck',
      title: 'Opciones de entrega',
      description: 'Consulta las opciones disponibles para tu ubicación.',
      action: 'Ver entregas',
    },
    {
      id: 'tracking',
      to: '/seguir-pedido',
      icon: 'clock',
      title: 'Seguimiento',
      description: 'Consulta el estado de tu pedido con su código.',
      action: 'Seguir pedido',
    },
    {
      id: 'contact',
      to: '/contacto',
      icon: 'chat',
      title: 'Conversemos',
      description: 'Escríbenos si necesitas orientación.',
      action: 'Ver contacto',
    },
  ] as const

  return (
    <section
      className="trust-section container"
      id="entregas"
      tabIndex={-1}
      aria-label="Información de entregas y atención"
      data-reveal="copy"
    >
      {links.map(({ id, to, icon, title, description, action }) => (
        <Link
          className="trust-item"
          to={to}
          aria-labelledby={`trust-${id}-title`}
          key={id}
        >
          <span className="trust-icon">
            <Icon name={icon} />
          </span>
          <div className="trust-content">
            <h2 id={`trust-${id}-title`}>{title}</h2>
            <p>{description}</p>
            <span className="trust-action">
              {action} <Icon name="arrow" />
            </span>
          </div>
        </Link>
      ))}
    </section>
  )
}
