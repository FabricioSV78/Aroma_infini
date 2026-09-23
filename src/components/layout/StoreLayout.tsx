import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Header } from './Header'
import { Footer } from './Footer'
import { Dialog } from '../ui/Dialog'
import { Icon } from '../ui/Icon'
import { CartProvider } from '../../features/cart/CartProvider'
import { FavoritesProvider } from '../../features/favorites/FavoritesProvider'
import { CartNotice } from '../../features/cart/CartNotice'
import { CheckoutProvider } from '../../features/checkout/CheckoutProvider'
import { SeoManager } from '../../seo/SeoManager'
import { AccountProvider } from '../../features/account/AccountProvider'
import { CommercialPreviewNotice } from '../../features/home/CommercialPreviewNotice'
import { useStoreReveal } from './useStoreReveal'

function StoreFrame() {
  const [helpOpen, setHelpOpen] = useState(false)
  const location = useLocation()
  const isCheckout = location.pathname.startsWith('/checkout')
  const previousKey = useRef(location.key)
  const previousPath = useRef(location.pathname)
  const storeRef = useRef<HTMLDivElement>(null)
  useStoreReveal(storeRef, location.key)
  useEffect(() => {
    if (previousKey.current === location.key) return
    previousKey.current = location.key
    if (previousPath.current === location.pathname && !location.hash) return
    previousPath.current = location.pathname
    const target = location.hash
      ? document.getElementById(location.hash.slice(1))
      : document.getElementById('contenido')
    target?.focus({ preventScroll: true })
    if (location.hash) target?.scrollIntoView()
    else window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location])
  return (
    <div
      ref={storeRef}
      className={
        location.pathname === '/'
          ? 'store-layout store-layout--home'
          : 'store-layout'
      }
    >
      <SeoManager />
      <Header />
      <main id="contenido" tabIndex={-1}>
        <Outlet />
      </main>
      {isCheckout ? (
        <aside className="checkout-help" aria-label="Ayuda durante el checkout">
          <div className="container checkout-help-inner">
            <p>¿Necesitas ayuda con tu selección?</p>
            <button
              className="text-link"
              type="button"
              onClick={() => setHelpOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={helpOpen}
              aria-controls="help"
            >
              Información de atención <Icon name="arrow" />
            </button>
          </div>
        </aside>
      ) : null}
      {!isCheckout ? (
        <button
          type="button"
          aria-label="Información de atención"
          className="help-button"
          onClick={() => setHelpOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={helpOpen}
          aria-controls="help"
        >
          <Icon name="chat" />
          <span className="help-button-label">Información de atención</span>
          <Icon className="help-button-arrow" name="arrow" />
        </button>
      ) : null}
      <Footer />
      <Dialog
        id="help"
        title="Información de atención"
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
      >
        <p>
          Publicaremos aquí el canal de contacto cuando la atención al cliente
          quede habilitada.
        </p>
      </Dialog>
      <CartNotice />
      {location.pathname === '/' ? <CommercialPreviewNotice /> : null}
    </div>
  )
}

export function StoreLayout() {
  return (
    <FavoritesProvider>
      <CartProvider>
        <AccountProvider>
          <CheckoutProvider>
            <StoreFrame />
          </CheckoutProvider>
        </AccountProvider>
      </CartProvider>
    </FavoritesProvider>
  )
}
