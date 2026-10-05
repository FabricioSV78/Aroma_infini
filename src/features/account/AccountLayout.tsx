import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { useAccount } from './account-context'

const sections = [
  { to: '/cuenta', label: 'Resumen', end: true },
  { to: '/cuenta/datos', label: 'Mis datos' },
  { to: '/cuenta/direcciones', label: 'Direcciones' },
  { to: '/cuenta/pedidos', label: 'Mis pedidos' },
  { to: '/cuenta/pagos', label: 'Pagos' },
  { to: '/cuenta/favoritos', label: 'Favoritos' },
] as const

function AccountAccessPage() {
  const { activateDemo } = useAccount()
  return (
    <article className="store-page account-access container">
      <nav
        className="account-breadcrumb"
        aria-label="Ruta de navegación"
        data-scroll-reveal="fade"
      >
        <Link to="/">Inicio</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Mi cuenta</span>
      </nav>
      <div className="account-access-layout" data-scroll-reveal="stagger">
        <header>
          <h1>Tu universo, siempre cerca.</h1>
          <p>Reúne tus pedidos, direcciones y favoritos en un solo lugar.</p>
        </header>
        <section aria-labelledby="demo-access-title">
          <p className="eyebrow">Acceso a tu espacio</p>
          <h2 id="demo-access-title">Todo en un mismo lugar.</h2>
          <p>Consulta tu selección, tus pedidos y tus datos de entrega.</p>
          <button
            className="button button--primary"
            type="button"
            onClick={activateDemo}
          >
            Ver mi cuenta <Icon name="arrow" />
          </button>
        </section>
      </div>
    </article>
  )
}

export function AccountLayout() {
  const { active, leaveDemo } = useAccount()
  const location = useLocation()
  const [navigationOpen, setNavigationOpen] = useState(false)
  const activeSection =
    sections.find((section) =>
      'end' in section && section.end
        ? location.pathname === section.to
        : location.pathname.startsWith(section.to),
    )?.label ?? 'Mi cuenta'

  if (!active) return <AccountAccessPage />

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
      <div
        className="account-demo-note"
        role="status"
        data-scroll-reveal="copy"
      >
        Los cambios en tu cuenta se conservan durante esta sesión.
      </div>
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
          <button className="account-leave" type="button" onClick={leaveDemo}>
            Salir de mi cuenta
          </button>
        </aside>
        <div className="account-content">
          <Outlet />
        </div>
      </div>
    </article>
  )
}
