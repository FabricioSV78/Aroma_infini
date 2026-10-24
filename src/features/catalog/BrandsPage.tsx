import { Link, useLoaderData, useRevalidator } from 'react-router'
import { brandsLoader } from './catalog-loaders'
import { Icon } from '../../components/ui/Icon'
import { EmptyState } from '../../components/ui/EmptyState'
import { InlineStatus } from '../../components/ui/InlineStatus'
import { imageSource } from '../../services/image-source'
import { brandStorePath } from '../../utils/brand-store-path'

export function BrandsPage() {
  const data = useLoaderData<typeof brandsLoader>()
  const revalidator = useRevalidator()
  const loading = revalidator.state !== 'idle'
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
      {loading ? <InlineStatus busy>Actualizando marcas…</InlineStatus> : null}
      <div
        className="brands-directory"
        data-scroll-reveal="stagger"
        aria-busy={loading}
      >
        {data.kind === 'error' ? (
          <EmptyState
            className="catalog-empty"
            title="No pudimos cargar las marcas"
            description="Inténtalo nuevamente para consultar la selección."
            role="alert"
          >
            <button
              className="text-link"
              disabled={loading}
              onClick={() => void revalidator.revalidate()}
            >
              Reintentar
            </button>
          </EmptyState>
        ) : data.brands.length === 0 ? (
          <EmptyState
            className="catalog-empty"
            icon="store"
            title="No hay marcas disponibles"
            description="La selección de marcas está en preparación."
          >
            <Link className="text-link" to="/">
              Volver al inicio <Icon name="arrow" />
            </Link>
          </EmptyState>
        ) : (
          data.brands.map((brand) => (
            <Link key={brand.id} to={brandStorePath(brand.slug)}>
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
