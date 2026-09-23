import { Link, useLoaderData, useRevalidator } from 'react-router'
import { brandsLoader } from './catalog-loaders'
import { Icon } from '../../components/ui/Icon'

export function BrandsPage() {
  const data = useLoaderData<typeof brandsLoader>()
  const revalidator = useRevalidator()
  return (
    <div className="store-page catalog-page container">
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
          <p className="eyebrow">La selección de Aroma Infini</p>
          <h1>
            Un universo.
            <br />
            Distintas firmas.
          </h1>
        </div>
        <p>Explora cada marca y encuentra tu próxima fragancia.</p>
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
            <Link key={brand.id} to={`/catalogo?marca=${brand.slug}`}>
              <h2>{brand.name}</h2>
              <span>
                Explorar perfumes <Icon name="arrow" />
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
