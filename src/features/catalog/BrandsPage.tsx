import { Link, useLoaderData, useRevalidator } from 'react-router'
import { brandsLoader } from './catalog-loaders'
import { Icon } from '../../components/ui/Icon'
import { imageSource } from '../../services/image-source'

export function BrandsPage() {
  const data = useLoaderData<typeof brandsLoader>()
  const revalidator = useRevalidator()
  return (
    <div className="store-page catalog-page brands-page container">
      <nav
        className="catalog-breadcrumb"
        aria-label="Ruta de navegación"
        data-scroll-reveal="fade"
      >
        <Link to="/">Inicio</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Marcas</span>
      </nav>
      <header className="catalog-heading" data-scroll-reveal="copy">
        <div>
          <p className="eyebrow brand-label">La selección de Aroma Infini</p>
          <h1>Marcas de perfume</h1>
        </div>
        <p>Conoce el estilo de cada firma y entra a su colección.</p>
      </header>
      <div className="brands-directory" data-scroll-reveal="stagger">
        {data.kind === 'error' ? (
          <div className="catalog-empty" role="status">
            <p>No pudimos cargar las marcas.</p>
            <button
              className="text-link"
              onClick={() => void revalidator.revalidate()}
            >
              Reintentar
            </button>
          </div>
        ) : (
          data.brands.map((brand) => (
            <Link key={brand.id} to={`/marcas/${brand.slug}`}>
              <h2>{brand.name}</h2>
              {brand.previewImage ? (
                <img
                  src={imageSource(brand.previewImage)}
                  alt=""
                  width="128"
                  height="128"
                  loading="lazy"
                />
              ) : null}
              <span>
                Ver perfumes <Icon name="arrow" />
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
