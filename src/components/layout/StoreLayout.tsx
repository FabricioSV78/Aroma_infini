import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Outlet, useLocation, useRevalidator } from 'react-router'
import { Header } from './Header'
import { Footer } from './Footer'
import { Icon } from '../ui/Icon'
import { NavigationStatus } from '../ui/NavigationStatus'
import { CartProvider } from '../../features/cart/CartProvider'
import { FavoritesProvider } from '../../features/favorites/FavoritesProvider'
import { CartNotice } from '../../features/cart/CartNotice'
import { CheckoutProvider } from '../../features/checkout/CheckoutProvider'
import { SeoManager } from '../../seo/SeoManager'
import { AccountProvider } from '../../features/account/AccountProvider'
import { useStoreReveal } from './useStoreReveal'
import { useSiteSettings } from '../../services/site-settings-service'
import { buildWhatsAppUrl } from '../../utils/whatsapp'
import {
  invalidateSupabaseStorefront,
  storefrontRepository,
  readStorefrontMetadata,
} from '../../services/storefront-repository'
import { isRemoteCatalog } from '../../services/catalog-source'
import { OfferPriceClockContext } from '../../services/offer-price-clock'
import { getNextProductDiscountChange } from '../../services/product-discounts'
import { isCustomerAuthModeSwitch } from '../../domain/auth-navigation'
import { preloadPublicRoute } from '../../app/public-route-modules'
import { nextVisibleOfferBoundary, subscribeVisibleOfferBoundaries } from '../../domain/visible-offer-boundaries'
import { subscribePublicQueryInvalidation } from '../../services/public-query-cache'
import { siteSettingsService } from '../../services/site-settings-service'
import { siteMediaService } from '../../services/site-media-service'
import { builtinMediaService } from '../../services/builtin-media-service'

function refreshPublicDocuments() {
  // Bounded editorial reads, shared across mounted consumers. No route waits
  // for them and no private/commercial payload enters these document caches.
  void Promise.allSettled([
    siteSettingsService.load(), siteMediaService.load(), builtinMediaService.load(),
  ])
}

function StoreFrame() {
  const [helpOffset, setHelpOffset] = useState(16)
  const [offerPriceRevision, refreshOfferPrices] = useState(() => Date.now())
  const location = useLocation()
  const revalidator = useRevalidator()
  const revalidateRef = useRef(revalidator.revalidate)
  useEffect(() => {
    revalidateRef.current = revalidator.revalidate
  }, [revalidator.revalidate])
  const helpTriggerRef = useRef<HTMLAnchorElement>(null)
  const siteSettings = useSiteSettings()
  const whatsappUrl = buildWhatsAppUrl(siteSettings.contact.whatsapp)
  const previousKey = useRef(location.key)
  const previousPath = useRef(location.pathname)
  const storeRef = useRef<HTMLDivElement>(null)
  useStoreReveal(storeRef, location.key)
  useEffect(function hintPublicRouteCode() {
    function hint(event: Event) {
      if (document.hidden || !(event.target instanceof Element)) return
      const link = event.target.closest<HTMLAnchorElement>('a[href]')
      if (!link || link.hasAttribute('download') || link.target === '_blank')
        return
      const url = new URL(link.href)
      if (
        url.origin === locationOrigin &&
        url.pathname !== window.location.pathname
      )
        preloadPublicRoute(url.pathname)
    }
    const locationOrigin = window.location.origin
    for (const event of ['pointerover', 'focusin', 'pointerdown'])
      document.addEventListener(event, hint, { passive: true })
    return () => {
      for (const event of ['pointerover', 'focusin', 'pointerdown'])
        document.removeEventListener(event, hint)
    }
  }, [])
  useEffect(() => {
    // Navigation also needs public brands/settings on non-catalog pages.
    // A failed background read keeps the confirmed cache empty; route loaders
    // present their existing retry states rather than substituting local data.
    void readStorefrontMetadata().catch(() => {})
    refreshPublicDocuments()
  }, [location.key])
  useEffect(() => {
    let timer: number | undefined
    let active = true
    let refreshing: Promise<void> | undefined
    function refreshOfferSource() {
      if (refreshing) return refreshing
      const operation = (async () => {
        if (isRemoteCatalog) {
          invalidateSupabaseStorefront(false)
          try {
            // Catalog, Home, detail and selection loaders already confirm the
            // metadata they read. Reuse it; informational routes still get the
            // standalone projection when revalidation did not supply one.
            await revalidateRef.current()
            await readStorefrontMetadata()
            refreshPublicDocuments()
          } catch {
            // Route loaders retain ownership of their error/retry screen.
          }
        }
        if (!active) return
        refreshOfferPrices(Date.now())
        scheduleNextOfferChange()
      })()
      refreshing = operation
      void operation.finally(() => {
        if (refreshing === operation) refreshing = undefined
      })
      return operation
    }
    function scheduleNextOfferChange() {
      window.clearTimeout(timer)
      if (isRemoteCatalog && document.visibilityState !== 'visible') return
      const now = Date.now()
      const catalogBoundary = getNextProductDiscountChange(
        storefrontRepository
          .peekSnapshot()
          .products.map(({ product }) => product),
        now,
      )
      const visibleBoundary = nextVisibleOfferBoundary(now)
      const next = catalogBoundary === undefined ? visibleBoundary : visibleBoundary === undefined ? catalogBoundary : Math.min(catalogBoundary, visibleBoundary)
      if (next === undefined && !isRemoteCatalog) return
      timer = window.setTimeout(
        () => void refreshOfferSource(),
        // SQL hides scheduled offers until their start. Refresh a visible remote
        // catalog at most once a minute even when its next change is unknown or
        // the device clock is incorrect. Local offers keep their exact timer.
        isRemoteCatalog
          ? Math.min(next === undefined ? 60000 : next - now + 1, 60000)
          : Math.min(next! - now + 1, 2_147_483_647),
      )
    }
    function refreshWhenVisible() {
      if (document.visibilityState !== 'visible') return
      void refreshOfferSource()
    }
    const unsubscribe = storefrontRepository.subscribe(scheduleNextOfferChange)
    const unsubscribeVisibleOffers = subscribeVisibleOfferBoundaries(scheduleNextOfferChange)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    const unsubscribePublications = subscribePublicQueryInvalidation((remote) => {
      if (remote && document.visibilityState === 'visible')
        void refreshOfferSource()
    })
    scheduleNextOfferChange()
    return () => {
      active = false
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      unsubscribe()
      unsubscribeVisibleOffers()
      unsubscribePublications()
    }
  }, [])
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
    const switchingAuthMode =
      !location.hash &&
      isCustomerAuthModeSwitch(previousPath.current, location.pathname)
    previousPath.current = location.pathname
    if (switchingAuthMode) {
      document
        .querySelector<HTMLElement>('.auth-tabs [aria-current="page"]')
        ?.focus({ preventScroll: true })
      return
    }
    const target = location.hash
      ? document.getElementById(location.hash.slice(1))
      : document.getElementById('contenido')
    target?.focus({ preventScroll: true })
    if (location.hash) target?.scrollIntoView()
    else window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location])
  return (
    <OfferPriceClockContext.Provider value={offerPriceRevision}>
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
        <NavigationStatus />
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
    </OfferPriceClockContext.Provider>
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
