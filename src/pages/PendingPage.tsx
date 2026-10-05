import { Link, useLocation } from 'react-router'
import { Icon } from '../components/ui/Icon'

const titles: Record<string, string> = {
  tienda: 'Tienda',
  marcas: 'Universos de marca',
  producto: 'Detalle del perfume',
  favoritos: 'Tus favoritos',
  cuenta: 'Mi cuenta',
  carrito: 'Tu carrito',
  buscar: 'Búsqueda',
  nosotros: 'Nuestra historia',
  contacto: 'Contacto',
  envios: 'Envíos y entregas',
  devoluciones: 'Cambios y devoluciones',
  privacidad: 'Privacidad',
  terminos: 'Términos y condiciones',
  'libro-de-reclamaciones': 'Libro de reclamaciones',
}
export function PendingPage() {
  const { pathname, search } = useLocation()
  const segment = pathname.split('/')[1]
  const title = titles[segment]
    ? 'No encontramos esta página'
    : 'Página no encontrada'
  const query =
    segment === 'buscar' ? new URLSearchParams(search).get('q') : null
  return (
    <div
      className="store-page pending-page container"
      data-scroll-reveal="fade"
    >
      <p className="eyebrow">Página no encontrada</p>
      <h1>{title}</h1>
      {query && (
        <p className="search-query">
          Tu búsqueda: <strong>{query}</strong>
        </p>
      )}
      <p>
        El enlace no corresponde a una página disponible. Puedes volver al
        inicio o explorar los perfumes.
      </p>
      <Link className="button button--primary" to="/">
        Volver al inicio
        <Icon name="arrow" />
      </Link>
    </div>
  )
}
