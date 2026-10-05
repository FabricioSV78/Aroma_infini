import { Link } from 'react-router'
import { SectionHeading } from '../../components/ui/SectionHeading'
import { Icon } from '../../components/ui/Icon'
import { categories } from '../../content/home'
import type { HomeData } from '../../services/home-service'
import { imageSource, imageSourceSet } from '../../services/image-source'
import { ProductCard } from './ProductCard'

export function Categories({ media }: Pick<HomeData, 'media'>) {
  return (
    <section
      className="section container discovery-section"
      id="descubrir"
      tabIndex={-1}
      aria-labelledby="categories-title"
    >
      <SectionHeading
        id="categories-title"
        eyebrow="Tres formas de explorar"
        title="Elige por dónde empezar."
      />
      <div className="category-grid">
        {categories.map((category) => (
          <Link
            to={category.to}
            className={`category category--${category.layout}`}
            data-reveal={category.reveal}
            key={category.title}
          >
            <div className="category-image">
              <img
                src={imageSource(
                  media[category.id as keyof typeof media] ?? category.image,
                  480,
                )}
                srcSet={imageSourceSet(
                  media[category.id as keyof typeof media] ?? category.image,
                  [480, 960, 1536],
                )}
                sizes="(min-width: 1440px) 760px, (min-width: 768px) 55vw, (max-width: 767px) 100vw"
                width={category.width}
                height={category.height}
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
        ))}
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
            brand={brands.find((brand) => brand.id === product.brandId)}
          />
        ))}
      </div>
    </section>
  )
}

export function FeaturedPerfumes({
  brands,
  featured,
  media,
}: Pick<HomeData, 'brands' | 'featured' | 'media'>) {
  const title =
    featured.length === 2
      ? 'Dos aromas. Dos formas de dejar huella.'
      : featured.length === 1
        ? 'Un aroma. Una forma de dejar huella.'
        : 'Aromas para dejar huella.'
  return (
    <section
      className="featured-section"
      id="destacados"
      tabIndex={-1}
      aria-labelledby="featured-title"
    >
      <div className="featured-inner container">
        <header className="featured-intro" data-reveal="copy">
          <div>
            <p className="eyebrow">Encuentro editorial</p>
            <h2 id="featured-title">{title}</h2>
          </div>
          <Link
            className="text-link featured-action"
            to="/tienda?seleccion=destacados"
          >
            Explorar destacados <Icon name="arrow" />
          </Link>
        </header>
        <Link
          className="featured-visual"
          data-reveal="image"
          to="/tienda?seleccion=destacados"
          aria-label="Descubrir la selección editorial de perfumes destacados"
        >
          <img
            src={imageSource(media.featured ?? 'featured-duo-v3', 960)}
            srcSet={imageSourceSet(
              media.featured ?? 'featured-duo-v3',
              [480, 960, 1536],
            )}
            sizes="(min-width: 1440px) 800px, (min-width: 1024px) 56vw, (min-width: 768px) calc(100vw - 48px), calc(100vw - 32px)"
            width={1448}
            height={1086}
            loading="lazy"
            decoding="async"
            alt=""
          />
        </Link>
        <div className="featured-products" data-reveal="copy">
          {featured.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              variant="editorial"
              brand={brands.find((brand) => brand.id === product.brandId)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export function TrustInformation() {
  return (
    <section
      className="trust-section container"
      id="entregas"
      tabIndex={-1}
      aria-label="Información de entregas y atención"
      data-reveal="copy"
    >
      <div>
        <Icon name="truck" />
        <h2>Opciones de entrega</h2>
        <p>Consulta las opciones disponibles para tu ubicación.</p>
      </div>
      <div>
        <Icon name="clock" />
        <h2>Tu pedido</h2>
        <p>Encuentra el estado de tu selección con su código.</p>
      </div>
      <div>
        <Icon name="chat" />
        <h2>Conversemos</h2>
        <p>Escríbenos si necesitas orientación.</p>
        <Link className="text-link" to="/contacto">
          Ver contacto
          <Icon name="arrow" />
        </Link>
      </div>
    </section>
  )
}
