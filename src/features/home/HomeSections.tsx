import { Link } from 'react-router'
import { SectionHeading } from '../../components/ui/SectionHeading'
import { Icon } from '../../components/ui/Icon'
import { categories } from '../../content/home'
import type { HomeData } from '../../services/home-service'
import { formatPEN } from '../../services/currency'
import { ProductCard } from './ProductCard'

export function Categories() {
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
                src={`/images/${category.image}-480.webp`}
                srcSet={`/images/${category.image}-480.webp 480w, /images/${category.image}-960.webp 960w, /images/${category.image}-1536.webp 1536w`}
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
          <Link className="text-link" to="/catalogo?orden=mas-vendidos">
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
            hoverImage={`${product.image}-alternate`}
            brand={brands.find((brand) => brand.id === product.brandId)}
          />
        ))}
      </div>
    </section>
  )
}

export function BrandEditorial() {
  return (
    <section
      id="marca-destacada"
      tabIndex={-1}
      className="editorial"
      aria-labelledby="editorial-title"
    >
      <div className="editorial-copy" data-reveal="copy">
        <p className="eyebrow">En foco · ATELIER 01</p>
        <h2 id="editorial-title">
          <span>El carácter</span>
          <span>de lo esencial.</span>
        </h2>
        <p>Bois Clair · madera clara, aire fresco.</p>
        <Link className="text-link" to="/catalogo?marca=atelier-01">
          Descubrir ATELIER 01
          <Icon name="arrow" />
        </Link>
      </div>
      <picture className="editorial-image" data-reveal="image">
        <source
          media="(max-width: 767px)"
          srcSet="/images/editorial-essential-v3-mobile-480.webp 480w, /images/editorial-essential-v3-mobile-780.webp 780w"
          sizes="100vw"
          width={780}
          height={858}
        />
        <img
          src="/images/editorial-essential-v3-1536.webp"
          srcSet="/images/editorial-essential-v3-480.webp 480w, /images/editorial-essential-v3-960.webp 960w, /images/editorial-essential-v3-1536.webp 1536w"
          sizes="100vw"
          width={1672}
          height={941}
          loading="lazy"
          decoding="async"
          alt="El frasco conceptual de Bois Clair sobre piedra clara, junto a una pieza de madera"
        />
      </picture>
    </section>
  )
}

export function FeaturedPerfumes({
  brands,
  featured,
}: Pick<HomeData, 'brands' | 'featured'>) {
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
            to="/catalogo?seleccion=destacados"
          >
            Explorar destacados <Icon name="arrow" />
          </Link>
        </header>
        <Link
          className="featured-visual"
          data-reveal="image"
          to="/catalogo?seleccion=destacados"
          aria-label="Descubrir la selección editorial de perfumes destacados"
        >
          <img
            src="/images/featured-duo-v3-960.webp"
            srcSet="/images/featured-duo-v3-480.webp 480w, /images/featured-duo-v3-960.webp 960w, /images/featured-duo-v3-1536.webp 1448w"
            sizes="(min-width: 1440px) 800px, (min-width: 1024px) 56vw, (min-width: 768px) calc(100vw - 48px), calc(100vw - 32px)"
            width={1448}
            height={1086}
            loading="lazy"
            decoding="async"
            alt="Dos frascos conceptuales de perfumes destacados en una composición de luz y piedra"
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

export function TrustInformation({ shipping }: Pick<HomeData, 'shipping'>) {
  const activeZones = shipping.zones.filter((zone) => zone.active)
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
        <h2>Envíos en Perú</h2>
        <p>Gratis desde {formatPEN(shipping.freeThresholdCents)}.</p>
      </div>
      <div>
        <Icon name="clock" />
        <h2>Tiempos de entrega</h2>
        <p>
          {activeZones.length
            ? activeZones
                .map((zone) => `${zone.name}: ${zone.estimate.toLowerCase()}`)
                .join(' · ')
            : 'Consulta la cobertura disponible.'}
        </p>
      </div>
      <div>
        <Icon name="chat" />
        <h2>Conversemos</h2>
        <p>Canal de atención en preparación.</p>
        <Link className="text-link" to="/contacto">
          Ver contacto
          <Icon name="arrow" />
        </Link>
      </div>
    </section>
  )
}
