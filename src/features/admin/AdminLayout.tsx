import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Icon, type IconName } from '../../components/ui/Icon'
import { SeoManager } from '../../seo/SeoManager'
import { adminService } from '../../services/admin-service'

const adminGroups = [
  {
    label: 'General',
    sections: [
      { to: '/admin', label: 'Resumen', icon: 'dashboard', end: true },
    ],
  },
  {
    label: 'Operación',
    sections: [
      { to: '/admin/pedidos', label: 'Pedidos', icon: 'orders' },
      { to: '/admin/clientes', label: 'Clientes', icon: 'user' },
    ],
  },
  {
    label: 'Tienda',
    sections: [
      { to: '/admin/productos', label: 'Productos', icon: 'package' },
      { to: '/admin/marcas', label: 'Marcas', icon: 'tag' },
    ],
  },
  {
    label: 'Comercial',
    sections: [
      { to: '/admin/promociones', label: 'Promociones', icon: 'percent' },
      { to: '/admin/home', label: 'Contenido del Home', icon: 'home' },
    ],
  },
  {
    label: 'Configuración',
    sections: [{ to: '/admin/envios', label: 'Envíos', icon: 'truck' }],
  },
] as const satisfies ReadonlyArray<{
  label: string
  sections: ReadonlyArray<{
    to: string
    label: string
    icon: IconName
    end?: boolean
  }>
}>

export function AdminLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const previousKey = useRef(location.key)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuCloseButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const currentSection = adminGroups
    .reduce<Array<{ to: string; label: string; end?: boolean }>>(
      (sections, group) => {
        group.sections.forEach((section) => sections.push(section))
        return sections
      },
      [],
    )
    .sort((a, b) => b.to.length - a.to.length)
    .find((section) =>
      section.end
        ? location.pathname === section.to
        : location.pathname.startsWith(section.to),
    )

  useEffect(() => {
    if (previousKey.current === location.key) return
    previousKey.current = location.key
    setNavigationOpen(false)
    document.getElementById('admin-content')?.focus({ preventScroll: true })
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.key])

  useEffect(() => {
    if (!navigationOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.requestAnimationFrame(() => menuCloseButtonRef.current?.focus({ preventScroll: true }))
    const handleDrawerKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNavigationOpen(false)
        window.requestAnimationFrame(() => menuButtonRef.current?.focus())
        return
      }
      if (event.key !== 'Tab' || !sidebarRef.current) return
      const items = [...sidebarRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')]
      const first = items[0]
      const last = items.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleDrawerKeys)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleDrawerKeys)
    }
  }, [navigationOpen])

  useEffect(function closeDrawerAtDesktopBreakpoint() {
    const desktop = window.matchMedia('(min-width: 1024px)')
    const closeDrawer = (event: MediaQueryListEvent) => {
      if (event.matches) setNavigationOpen(false)
    }
    desktop.addEventListener('change', closeDrawer)
    return () => desktop.removeEventListener('change', closeDrawer)
  }, [])

  function resetDemo() {
    if (
      window.confirm(
        '¿Restablecer productos, pedidos y configuración guardados en este navegador?',
      )
    ) {
      adminService.reset()
      void navigate('/admin')
    }
  }

  return (
    <div className="admin-shell">
      <SeoManager />
      <a className="skip-link" href="#admin-content">
        Saltar al contenido
      </a>
      <header className="admin-header" inert={navigationOpen}>
        <Link
          className="admin-brand"
          to="/admin"
          aria-label="Panel Aroma Infini"
        >
          Aroma Infini<span>.</span>
          <small>administración</small>
        </Link>
        <div className="admin-header-context" aria-label="Ubicación actual">
          <span>Panel administrativo</span>
          <Icon name="chevron" />
          <strong>{currentSection?.label ?? 'Resumen'}</strong>
        </div>
        <div className="admin-header-actions">
          <Link to="/">Ver tienda</Link>
          <button
            ref={menuButtonRef}
            className="admin-menu-toggle"
            type="button"
            aria-label={
              navigationOpen
                ? 'Cerrar menú administrativo'
                : 'Abrir menú administrativo'
            }
            aria-expanded={navigationOpen}
            aria-controls="admin-navigation"
            onClick={() => setNavigationOpen((open) => !open)}
          >
            <Icon name={navigationOpen ? 'close' : 'menu'} />
            <span>{navigationOpen ? 'Cerrar' : 'Menú'}</span>
          </button>
        </div>
      </header>
      <aside
        ref={sidebarRef}
        id="admin-navigation"
        role={navigationOpen ? 'dialog' : undefined}
        aria-modal={navigationOpen ? true : undefined}
        aria-label={navigationOpen ? 'Menú administrativo' : undefined}
        className={`admin-sidebar${navigationOpen ? ' is-open' : ''}`}
      >
        <div className="admin-sidebar-heading">
          <Link
            className="admin-sidebar-brand"
            to="/admin"
            aria-label="Resumen del panel Aroma Infini"
            onClick={() => setNavigationOpen(false)}
          >
            <span className="admin-sidebar-brand-mark" aria-hidden="true">
              <Icon name="store" />
            </span>
            <span>
              Aroma Infini<strong>.</strong>
              <small>Administración</small>
            </span>
          </Link>
          <button
            ref={menuCloseButtonRef}
            className="admin-sidebar-close"
            type="button"
            aria-label="Cerrar menú administrativo"
            onClick={() => {
              setNavigationOpen(false)
              window.requestAnimationFrame(() => menuButtonRef.current?.focus())
            }}
          >
            <Icon name="close" />
          </button>
        </div>
        <nav aria-label="Navegación administrativa">
          {adminGroups.map((group) => (
            <div className="admin-nav-group" key={group.label}>
              <p>{group.label}</p>
              <ul>
                {group.sections.map((section) => (
                  <li key={section.to}>
                    <NavLink
                      to={section.to}
                      end={'end' in section && section.end}
                      onClick={() => setNavigationOpen(false)}
                    >
                      <Icon name={section.icon} />
                      <span>{section.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <button className="admin-reset" type="button" onClick={resetDemo}>
            Restablecer datos
          </button>
          <span className="admin-side-status">
            <span aria-hidden="true" /> Sesión local
          </span>
        </div>
      </aside>
      <button
        className={`admin-sidebar-backdrop${navigationOpen ? ' is-visible' : ''}`}
        type="button"
        aria-label="Cerrar menú administrativo"
        tabIndex={-1}
        onClick={() => {
          setNavigationOpen(false)
          window.requestAnimationFrame(() => menuButtonRef.current?.focus())
        }}
      />
      <main id="admin-content" className="admin-main" tabIndex={-1} inert={navigationOpen}>
        <div className="admin-demo-banner">
          Los cambios de este panel se guardan en este navegador.
        </div>
        <Outlet />
      </main>
    </div>
  )
}
