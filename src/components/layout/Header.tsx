import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import {
  navigationGroups,
  type NavigationGroup,
} from '../../content/navigation'
import { SearchPanel } from '../../features/catalog/SearchPanel'
import { CartDrawer } from '../../features/cart/CartDrawer'
import { useCart } from '../../features/cart/cart-context'
import { useFavorites } from '../../features/favorites/favorites-context'
import { useAccount } from '../../features/account/account-context'
import { Dialog } from '../ui/Dialog'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { getFreeShippingThresholdCents } from '../../services/commerce-service'
import { formatPEN } from '../../services/currency'

interface NavigationColumnsProps {
  group: NavigationGroup
  onNavigate: () => void
}

function NavigationColumns({ group, onNavigate }: NavigationColumnsProps) {
  const location = useLocation()
  const current = `${location.pathname}${location.search}${location.hash}`
  return (
    <div className="navigation-columns">
      {group.columns.map((column) => (
        <div key={column.title}>
          <h3 className="eyebrow">{column.title}</h3>
          <ul>
            {column.links.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  onClick={onNavigate}
                  aria-current={
                    current === link.to
                      ? link.to.includes('#')
                        ? 'location'
                        : 'page'
                      : undefined
                  }
                >
                  {link.label}
                  <Icon name="arrow" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export function Header() {
  const { itemCount, drawerOpen, openCart } = useCart()
  const { favoriteCount } = useFavorites()
  const { active: accountActive } = useAccount()
  const favoritesPath = accountActive ? '/cuenta/favoritos' : '/favoritos'
  const [overlay, setOverlay] = useState<'menu' | 'search' | null>(null)
  const [expanded, setExpanded] = useState<{ id: string; key: string } | null>(
    null,
  )
  const [mobileGroup, setMobileGroup] = useState<string | null>('perfumes')
  const headerRef = useRef<HTMLElement>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const location = useLocation()
  const { pathname } = location
  const openGroup = expanded?.key === location.key ? expanded.id : null
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(() => window.scrollY > 26)
  const isTransparent = pathname === '/' && !scrolled && !openGroup
  const freeShippingThresholdCents = getFreeShippingThresholdCents()

  function cancelHover() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
  }
  function closeNavigation() {
    cancelHover()
    setExpanded(null)
    setOverlay(null)
  }
  function closeWithFocus() {
    if (!openGroup) return
    headerRef.current
      ?.querySelector<HTMLButtonElement>(`#nav-trigger-${openGroup}`)
      ?.focus()
    cancelHover()
    setExpanded(null)
  }
  useEffect(function navigationDismissal() {
    function outsidePointer(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !headerRef.current?.contains(event.target)
      ) {
        if (hoverTimer.current) clearTimeout(hoverTimer.current)
        setExpanded(null)
      }
    }
    const breakpoint = window.matchMedia('(min-width: 1200px)')
    function changedBreakpoint() {
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
      setExpanded(null)
      setOverlay((current) => (current === 'menu' ? null : current))
    }
    function changedHistory() {
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
      setExpanded(null)
      setOverlay(null)
    }
    document.addEventListener('pointerdown', outsidePointer)
    window.addEventListener('popstate', changedHistory)
    breakpoint.addEventListener('change', changedBreakpoint)
    return () => {
      document.removeEventListener('pointerdown', outsidePointer)
      window.removeEventListener('popstate', changedHistory)
      breakpoint.removeEventListener('change', changedBreakpoint)
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
    }
  }, [])

  useEffect(function observeHeaderPosition() {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(([entry]) => {
      setScrolled(!entry.isIntersecting)
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])
  return (
    <>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      {pathname === '/' ? (
        <div className="announcement">
          <span>Envíos a todo el Perú</span>
          {freeShippingThresholdCents > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span>
                Gratis desde {formatPEN(freeShippingThresholdCents)}
              </span>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="header-sentinel" ref={sentinelRef} aria-hidden="true" />
      <header
        ref={headerRef}
        className={`site-header ${isTransparent ? 'site-header--transparent' : 'site-header--solid'}`}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && openGroup) {
            event.preventDefault()
            closeWithFocus()
          }
        }}
      >
        <div className="header-main">
          <div className="header-leading">
            <IconButton
              icon="menu"
              label="Abrir menú"
              className="mobile-menu-button"
              onClick={() => {
                setMobileGroup('perfumes')
                setOverlay('menu')
              }}
              aria-haspopup="dialog"
              aria-expanded={overlay === 'menu'}
              aria-controls="mobile-navigation"
            />
          </div>
          <Link
            to="/"
            className="wordmark"
            aria-label="Aroma Infini, inicio"
            onClick={closeNavigation}
          >
            Aroma Infini<span className="wordmark-dot">.</span>
          </Link>
          <nav
            className="desktop-nav"
            aria-label="Navegación principal"
            onPointerLeave={() => {
              cancelHover()
              hoverTimer.current = setTimeout(() => {
                if (
                  !headerRef.current
                    ?.querySelector('.desktop-nav')
                    ?.contains(document.activeElement)
                )
                  setExpanded(null)
              }, 220)
            }}
            onPointerEnter={cancelHover}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                cancelHover()
                setExpanded(null)
              }
            }}
          >
            {navigationGroups.map((group) => (
              <div className="desktop-menu-item" key={group.id}>
                <button
                  id={`nav-trigger-${group.id}`}
                  className="nav-trigger"
                  type="button"
                  aria-expanded={openGroup === group.id}
                  aria-controls={`nav-panel-${group.id}`}
                  onPointerEnter={(event) => {
                    if (event.pointerType !== 'mouse') return
                    cancelHover()
                    hoverTimer.current = setTimeout(
                      () => setExpanded({ id: group.id, key: location.key }),
                      180,
                    )
                  }}
                  onClick={() => {
                    cancelHover()
                    setExpanded(
                      openGroup === group.id
                        ? null
                        : { id: group.id, key: location.key },
                    )
                  }}
                >
                  {group.label}
                  <Icon name="chevron" />
                </button>
                <div
                  id={`nav-panel-${group.id}`}
                  className="navigation-panel"
                  hidden={openGroup !== group.id}
                >
                  <div className="navigation-panel-inner">
                    <div className="navigation-intro">
                      <h2>{group.title}</h2>
                    </div>
                    <NavigationColumns
                      group={group}
                      onNavigate={closeNavigation}
                    />
                    <IconButton
                      className="navigation-close"
                      icon="close"
                      label={`Cerrar menú ${group.label}`}
                      onClick={closeWithFocus}
                    />
                  </div>
                </div>
              </div>
            ))}
          </nav>
          <div className="header-actions">
            <IconButton
              icon="search"
              label="Buscar perfumes"
              onClick={() => {
                cancelHover()
                setExpanded(null)
                setOverlay('search')
              }}
              aria-haspopup="dialog"
              aria-expanded={overlay === 'search'}
              aria-controls="search"
            />
            <Link
              className="icon-button desktop-access header-commerce-action"
              to={favoritesPath}
              onClick={closeNavigation}
              aria-label={
                favoriteCount
                  ? `Favoritos, ${favoriteCount} ${favoriteCount === 1 ? 'guardado' : 'guardados'}`
                  : 'Favoritos'
              }
            >
              <Icon name="heart" />
              {favoriteCount > 0 ? (
                <span className="header-count" aria-hidden="true">
                  {favoriteCount}
                </span>
              ) : null}
            </Link>
            <Link
              className="icon-button desktop-access"
              to="/cuenta"
              onClick={closeNavigation}
              aria-label="Mi cuenta"
            >
              <Icon name="user" />
            </Link>
            <button
              className="icon-button header-commerce-action"
              type="button"
              aria-label={
                itemCount
                  ? `Carrito, ${itemCount} ${itemCount === 1 ? 'producto' : 'productos'}`
                  : 'Carrito'
              }
              aria-haspopup="dialog"
              aria-expanded={drawerOpen}
              aria-controls="cart-drawer"
              onClick={() => {
                closeNavigation()
                openCart()
              }}
            >
              <Icon name="bag" />
              {itemCount > 0 ? (
                <span className="header-count" aria-hidden="true">
                  {itemCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </header>
      <Dialog
        id="mobile-navigation"
        title="Explorar"
        open={overlay === 'menu'}
        onClose={() => setOverlay(null)}
        className="menu-dialog"
      >
        <nav aria-label="Navegación móvil" className="mobile-navigation">
          <Link to="/" className="mobile-home-link" onClick={closeNavigation}>
            Inicio
            <Icon name="arrow" />
          </Link>
          {navigationGroups.map((group) => (
            <div className="mobile-nav-group" key={group.id}>
              <button
                type="button"
                aria-expanded={mobileGroup === group.id}
                aria-controls={`mobile-group-${group.id}`}
                onClick={() =>
                  setMobileGroup(mobileGroup === group.id ? null : group.id)
                }
              >
                {group.label}
                <Icon name="chevron" />
              </button>
              <div
                id={`mobile-group-${group.id}`}
                className="mobile-group-panel"
                hidden={mobileGroup !== group.id}
              >
                <NavigationColumns group={group} onNavigate={closeNavigation} />
              </div>
            </div>
          ))}
        </nav>
        <div className="mobile-secondary">
          <Link to={favoritesPath} onClick={() => setOverlay(null)}>
            <Icon name="heart" />
            Favoritos
          </Link>
          <Link to="/cuenta" onClick={() => setOverlay(null)}>
            <Icon name="user" />
            Mi cuenta
          </Link>
          <Link to="/carrito" onClick={closeNavigation}>
            <Icon name="bag" />
            Carrito
          </Link>
        </div>
      </Dialog>
      <Dialog
        id="search"
        title="¿Qué aroma tienes en mente?"
        open={overlay === 'search'}
        onClose={() => setOverlay(null)}
      >
        {overlay === 'search' && (
          <SearchPanel onClose={() => setOverlay(null)} />
        )}
      </Dialog>
      <CartDrawer />
    </>
  )
}
