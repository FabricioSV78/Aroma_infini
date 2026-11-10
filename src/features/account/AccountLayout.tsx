import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { useAccount } from './account-context'
import { authService } from '../../services/auth-service'
import { InlineStatus } from '../../components/ui/InlineStatus'

const sections = [
  { to: '/cuenta', label: 'Resumen', end: true },
  { to: '/cuenta/datos', label: 'Mis datos' },
  { to: '/cuenta/direcciones', label: 'Direcciones' },
  { to: '/cuenta/pedidos', label: 'Mis pedidos' },
  { to: '/cuenta/pagos', label: 'Pagos' },
  { to: '/cuenta/favoritos', label: 'Favoritos' },
] as const

export function AccountLayout() {
  const { active, status, error, reload } = useAccount()
  const location = useLocation()
  const [navigationOpen, setNavigationOpen] = useState(false)
  const activeSection =
    sections.find((section) =>
      'end' in section && section.end
        ? location.pathname === section.to
        : location.pathname.startsWith(section.to),
    )?.label ?? 'Mi cuenta'

  if (!active) return null

  return (
    <article className="store-page account-page container">
      <nav
        className="account-breadcrumb"
        aria-label="Ruta de navegación"
        data-scroll-reveal="fade"
      >
        <Link to="/">Inicio</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Mi cuenta</span>
      </nav>
      <div className="account-layout" data-scroll-reveal="stagger">
        <button
          className="account-menu-toggle"
          type="button"
          aria-expanded={navigationOpen}
          aria-controls="account-navigation"
          onClick={() => setNavigationOpen((open) => !open)}
        >
          <span>Sección</span>
          <strong>{activeSection}</strong>
          <Icon name="chevron" />
        </button>
        <aside
          id="account-navigation"
          className={`account-sidebar${navigationOpen ? ' is-open' : ''}`}
        >
          <nav aria-label="Secciones de mi cuenta">
            <ul>
              {sections.map((section) => (
                <li key={section.to}>
                  <NavLink
                    to={section.to}
                    end={'end' in section && section.end}
                    onClick={() => setNavigationOpen(false)}
                  >
                    {section.label} <Icon name="arrow" />
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <button
            className="account-leave"
            type="button"
            onClick={() => {
              void authService.signOut().catch(() => undefined)
            }}
          >
            Salir de mi cuenta
          </button>
        </aside>
        <div className="account-content">
          {status === 'loading' ? (
            <InlineStatus busy>Cargando tu cuenta…</InlineStatus>
          ) : status === 'error' ? (
            <section role="alert">
              <h1>No pudimos cargar tu cuenta</h1>
              <p>{error}</p>
              <button
                className="button button--secondary"
                type="button"
                onClick={reload}
              >
                Volver a intentar
              </button>
            </section>
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </article>
  )
}
