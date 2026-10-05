import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Header } from './Header'
import { Footer } from './Footer'
import { Icon } from '../ui/Icon'
import { CartProvider } from '../../features/cart/CartProvider'
import { FavoritesProvider } from '../../features/favorites/FavoritesProvider'
import { CartNotice } from '../../features/cart/CartNotice'
import { CheckoutProvider } from '../../features/checkout/CheckoutProvider'
import { SeoManager } from '../../seo/SeoManager'
import { AccountProvider } from '../../features/account/AccountProvider'
import { useStoreReveal } from './useStoreReveal'
import { ContactHelpDialog } from './ContactHelpDialog'
import { useCart } from '../../features/cart/cart-context'

function StoreFrame() {
  const [helpOpen, setHelpOpen] = useState(false)
  const [helpOffset, setHelpOffset] = useState(16)
  const location = useLocation()
  const { dismissNotice } = useCart()
  const helpTriggerRef = useRef<HTMLButtonElement>(null)
  const closeHelp = useCallback((restoreFocus = false) => {
    setHelpOpen(false)
    if (restoreFocus)
      requestAnimationFrame(() => helpTriggerRef.current?.focus())
  }, [])
  const previousKey = useRef(location.key)
  const previousPath = useRef(location.pathname)
  const storeRef = useRef<HTMLDivElement>(null)
  useStoreReveal(storeRef, location.key)
  useEffect(() => {
    if (helpOpen) return
    let frame = 0
    function placeHelp() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const trigger = helpTriggerRef.current
        if (!trigger) return
        const width = trigger.offsetWidth
        const height = trigger.offsetHeight
        const right = Math.max(16, Number.parseFloat(getComputedStyle(trigger).right) || 16)
        const left = window.innerWidth - right - width
        const actions = document.querySelectorAll<HTMLElement>(
          'main button, main a[href], main label, main input, main select, main textarea, footer button, footer a[href], [role="dialog"] button, .cart-notice, .product-popularity-preview',
        )
        const next = [16, 96, 176, 256, 336, 416, 496].find((bottom) => {
          const top = window.innerHeight - bottom - height
          if (top < 72) return false
          return !Array.from(actions).some((action) => {
            if (action === trigger || !action.getClientRects().length) return false
            const rect = action.getBoundingClientRect()
            if (action.tagName === 'A' && rect.height > 120 && !action.classList.contains('button'))
              return false
            return rect.right > left - 20 && rect.left < left + width + 20 &&
              rect.bottom > top - 8 && rect.top < top + height + 8
          })
        })
        setHelpOffset(next ?? 16)
      })
    }
    placeHelp()
    const observer = new MutationObserver(placeHelp)
    if (storeRef.current) observer.observe(storeRef.current, { childList: true, subtree: true })
    window.addEventListener('scroll', placeHelp, { passive: true })
    window.addEventListener('resize', placeHelp)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('scroll', placeHelp)
      window.removeEventListener('resize', placeHelp)
    }
  }, [helpOpen, location.key])
  useEffect(() => {
    if (previousKey.current === location.key) return
    previousKey.current = location.key
    if (previousPath.current === location.pathname && !location.hash) return
    previousPath.current = location.pathname
    setHelpOpen(false)
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
      style={{ '--help-offset': `${helpOffset}px` } as CSSProperties}
    >
      <SeoManager />
      <Header />
      <main id="contenido" tabIndex={-1}>
        <Outlet />
      </main>
      <button
        ref={helpTriggerRef}
        type="button"
        aria-label={
          helpOpen ? 'Cerrar ayuda y contacto' : 'Abrir ayuda y contacto'
        }
        className="help-button"
        onClick={() => {
          if (!helpOpen) {
            dismissNotice()
            setHelpOffset(16)
          }
          setHelpOpen((current) => !current)
        }}
        aria-haspopup="dialog"
        aria-expanded={helpOpen}
        aria-controls="help"
      >
        <Icon name={helpOpen ? 'close' : 'chat'} />
        <span>Ayuda</span>
      </button>
      <Footer />
      <ContactHelpDialog
        open={helpOpen}
        onClose={closeHelp}
        triggerRef={helpTriggerRef}
      />
      <CartNotice />
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
