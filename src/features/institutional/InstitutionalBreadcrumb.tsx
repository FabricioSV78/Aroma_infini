import { Link } from 'react-router'

interface InstitutionalBreadcrumbProps {
  current: string
}

export function InstitutionalBreadcrumb({
  current,
}: InstitutionalBreadcrumbProps) {
  return (
    <nav
      className="institutional-breadcrumb"
      aria-label="Ruta de navegación"
      data-scroll-reveal="fade"
    >
      <Link to="/">Inicio</Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{current}</span>
    </nav>
  )
}
