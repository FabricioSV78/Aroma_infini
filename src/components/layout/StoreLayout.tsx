import { useEffect, useRef, useState, type CSSProperties } from 'react'
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
import { contactDetails } from '../../content/institutional'
import { buildWhatsAppUrl } from '../../utils/whatsapp'

function StoreFrame() {
  const [helpOffset, setHelpOffset] = useState(16)
  const location = useLocation()
  const helpTriggerRef = useRef<HTMLAnchorElement>(null)
  const whatsappUrl = buildWhatsAppUrl(contactDetails.whatsappNumber)
  const previousKey = useRef(location.key)
  const previousPath = useRef(location.pathname)
  const storeRef = useRef<HTMLDivElement>(null)
  useStoreReveal(storeRef, location.key)
  useEffect(() => {
    let frame = 0
    function placeHelp() {
      cancelAnimationFrame(frame)
      if (window.matchMedia('(max-width: 1199px)').matches) {
        setHelpOffset((current) => (current === 16 ? current : 16))
        return
      }
      frame = requestAnimationFrame(() => {
        const trigger = helpTriggerRef.current
        if (!trigger) return
        const width = trigger.offsetWidth
        const height = trigger.offsetHeight
        const right = Math.max(
          16,
          Number.parseFloat(getComputedStyle(trigger).right) || 16,
        )
        const left = window.innerWidth - right - width
        const actions = document.querySelectorAll<HTMLElement>(
          'main button, main a[href], main label, main input, main select, main textarea, main .product-variants, footer button, footer a[href], [role="dialog"] button, .cart-notice, .product-popularity-preview',
        )
        const actionRects = Array.from(actions).flatMap((action) => {
          if (action === trigger || !action.getClientRects().length) return []
          const rect = action.getBoundingClientRect()
          if (rect.bottom < 72 || rect.top > window.innerHeight) return []
          if (
            action.tagName === 'A' &&
            rect.height > 120 &&
            !action.classList.contains('button')
          )
            return []
          return [rect]
        })
        const textRects = Array.from(
          document.querySelectorAll<HTMLElement>(
            'main h1, main h2, main h3, main p, main .product-selected-price, footer h2, footer p',
          ),
        ).flatMap((element) => {
          if (!element.getClientRects().length) return []
          const rect = element.getBoundingClientRect()
          if (rect.bottom < 72 || rect.top > window.innerHeight) return []
          const range = document.createRange()
          range.selectNodeContents(element)
          return Array.from(range.getClientRects())
        })
        const candidates = Array.from(
          { length: Math.ceil(window.innerHeight / 64) },
          (_, index) => 16 + index * 64,
        ).filter((bottom) => window.innerHeight - bottom - height >= 72)
        const scored = candidates.map((bottom) => {
          const top = window.innerHeight - bottom - height
          const overlap = (rects: DOMRect[]) =>
            rects.reduce((total, rect) => {
              const sharedWidth = Math.max(
                0,
                Math.min(rect.right, left + width + 8) -
                  Math.max(rect.left, left - 8),
              )
              const sharedHeight = Math.max(
                0,
                Math.min(rect.bottom, top + height + 8) -
                  Math.max(rect.top, top - 8),
              )
              return total + sharedWidth * sharedHeight
            }, 0)
          return {
            bottom,
            actionOverlap: overlap(actionRects),
            textOverlap: overlap(textRects),
          }
        })
        const next =
          scored.find(
            (candidate) =>
              candidate.actionOverlap === 0 && candidate.textOverlap === 0,
          )?.bottom ??
          scored
            .filter((candidate) => candidate.actionOverlap === 0)
            .sort((a, b) => a.textOverlap - b.textOverlap)[0]?.bottom ??
          scored.sort(
            (a, b) =>
              a.actionOverlap - b.actionOverlap ||
              a.textOverlap - b.textOverlap,
          )[0]?.bottom
        setHelpOffset(next ?? 16)
      })
    }
    placeHelp()
    const observer = new MutationObserver(placeHelp)
    if (storeRef.current)
      observer.observe(storeRef.current, { childList: true, subtree: true })
    window.addEventListener('scroll', placeHelp, { passive: true })
    window.addEventListener('resize', placeHelp)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('scroll', placeHelp)
      window.removeEventListener('resize', placeHelp)
    }
  }, [location.key])
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
      style={{ '--help-offset': `${helpOffset}px` } as CSSProperties}
    >
      <SeoManager />
      <Header />
      <main id="contenido" tabIndex={-1}>
        <Outlet />
      </main>
      <a
        ref={helpTriggerRef}
        href={whatsappUrl ?? '/contacto'}
        target={whatsappUrl ? '_blank' : undefined}
        rel={whatsappUrl ? 'noopener noreferrer' : undefined}
        aria-label={
          whatsappUrl ? 'Abrir WhatsApp para recibir ayuda' : 'Ir a contacto'
        }
        className="help-button"
      >
        <Icon name="chat" />
        <span>Ayuda</span>
      </a>
      <Footer />
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
