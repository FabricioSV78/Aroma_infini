import { useEffect } from 'react'
import { Link } from 'react-router'
import { Icon } from '../components/ui/Icon'

export function RouteErrorPage() {
  useEffect(function updateErrorTitle() {
    document.title = 'No pudimos abrir esta página — Aroma Infini'
  }, [])

  return (
    <main id="contenido" tabIndex={-1}>
      <section
        className="store-page pending-page container"
        aria-labelledby="route-error-title"
      >
        <p className="eyebrow">Error de carga</p>
        <h1 id="route-error-title">No pudimos abrir esta página.</h1>
        <p>Inténtalo de nuevo o vuelve al inicio.</p>
        <button
          className="button button--primary"
          type="button"
          onClick={() => window.location.reload()}
        >
          Reintentar
        </button>
        <Link className="text-link" to="/">
          Volver al inicio <Icon name="arrow" />
        </Link>
      </section>
    </main>
  )
}
