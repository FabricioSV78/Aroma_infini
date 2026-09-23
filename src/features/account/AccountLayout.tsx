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
          <p className="eyebrow">Mi cuenta</p>
          <h1>Tu universo, siempre cerca.</h1>
          <p>Reúne tus pedidos, direcciones y favoritos en un solo lugar.</p>
        </header>
        <section aria-labelledby="demo-access-title">
          <p className="eyebrow">Recorrido de demostración</p>
          <h2 id="demo-access-title">Explora la experiencia de cuenta.</h2>
          <p>
            Usa una identidad ficticia. No se solicitarán ni guardarán
            credenciales.
          </p>
          <button
            className="button button--primary"
            type="button"
            onClick={activateDemo}
          >
            Explorar cuenta de demostración <Icon name="arrow" />
          </button>
          <div className="account-future-access" aria-label="Accesos futuros">
            <div>
              <strong>Continuar con Google</strong>
              <span>Disponible al conectar autenticación</span>
            </div>
            <div>
              <strong>Correo y contraseña</strong>
              <span>Disponible al conectar autenticación</span>
            </div>
          </div>
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
        Cuenta de demostración · Los cambios viven solo durante esta sesión.
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
            <p className="eyebrow">Mi cuenta</p>
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
              <li>
                <Link to="/favoritos" onClick={() => setNavigationOpen(false)}>
                  Favoritos <Icon name="arrow" />
                </Link>
              </li>
            </ul>
          </nav>
          <button className="account-leave" type="button" onClick={leaveDemo}>
            Salir de la demostración
          </button>
        </aside>
        <div className="account-content">
          <Outlet />
        </div>
      </div>
    </article>
  )
}
