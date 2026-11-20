import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import '@fontsource/ibm-plex-sans/latin-300.css'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import './styles/global.css'
import './styles/service-contact-shipping.css'
import './styles/font-options.css'
import { applyFontPreference, getFontPreference } from './lib/font-preference'
import { loadAdminRuntime } from './services/admin-runtime'
import { isRemoteCatalog } from './services/catalog-source'
import { authService } from './services/auth-service'
import { builtinMediaService } from './services/builtin-media-service'
import { siteMediaService } from './services/site-media-service'
import { siteSettingsService } from './services/site-settings-service'
import { PageLoadingState } from './components/ui/PageLoadingState'
import { getRouter } from './app/router'
import './styles/ui-states.css'
import './styles/interaction-states.css'
import { capturePublicInitialMotion } from './services/public-initial-motion'

const root = document.getElementById('root')
applyFontPreference(getFontPreference(), false)
if (!root) throw new Error('No se encontró el elemento raíz de la aplicación.')
const appRoot = createRoot(root)
// A public, request-scoped first visual may already be painted by the server.
// Keep it in place while the ordinary loaders validate their existing DTOs.
// This is progressive HTML replacement, not hydration of a partial React tree.
const initialVisual =
  root.dataset.publicInitialPath ===
    window.location.pathname + window.location.search &&
  root.querySelector('[data-public-initial-visual]') !== null
siteMediaService.hydrateInitial()
siteSettingsService.hydrateInitial()
if (!initialVisual)
  appRoot.render(<PageLoadingState pathname={window.location.pathname} />)
// Public pages need not wait for a private Auth network check. Protected route
// loaders await the same initialization before granting access.
void authService.initialize()
const [, router] = await Promise.all([
  // Resolve aliases before rendering images, while route modules and their
  // public queries load concurrently. Local loaders still await hydration.
  builtinMediaService.load().catch(() => {}),
  (isRemoteCatalog
    ? Promise.resolve()
    : loadAdminRuntime().then((runtime) => runtime.hydrateAdminStore())
  ).then(getRouter),
])
if (initialVisual && !router.state.initialized) {
  await new Promise<void>((resolve) => {
    const unsubscribe = router.subscribe((state) => {
      if (state.initialized) {
        unsubscribe()
        resolve()
      }
    })
    if (router.state.initialized) {
      unsubscribe()
      resolve()
    }
  })
}
// Native links remain usable while the first visual is on screen. Preserve a
// keyboard user's focus when React replaces that request-local DOM, without
// focusing anything for users who have not interacted with it.
if (initialVisual) capturePublicInitialMotion(root)
if (initialVisual && root.contains(document.activeElement)) {
  const focused = document.activeElement as HTMLElement
  const headerControl = Boolean(focused.closest('.site-header'))
  const mobileMenuControl = focused.classList.contains('mobile-menu-button')
  const id = focused.id
  const href = focused.getAttribute('href')
  const label = focused.getAttribute('aria-label')
  const content = focused.textContent?.trim()
  const observer = new MutationObserver(() => {
    if (root.querySelector('[data-public-initial-visual]')) return
    observer.disconnect()
    if (
      document.activeElement !== document.body &&
      document.activeElement !== focused
    )
      return
    const region = headerControl ? root.querySelector('.site-header') : root
    const candidates = Array.from(
      region?.querySelectorAll<HTMLElement>('a,button') ?? [],
    ).filter(
      (element) =>
        element.getClientRects().length > 0 &&
        !element.closest('[hidden],[inert]'),
    )
    const replacement =
      (id ? root.querySelector<HTMLElement>(`#${CSS.escape(id)}`) : null) ??
      (mobileMenuControl
        ? region?.querySelector<HTMLElement>('.mobile-menu-button')
        : null) ??
      candidates.find((element) =>
        href
          ? element.getAttribute('href') === href &&
            element.getAttribute('aria-label') === label &&
            element.textContent?.trim() === content
          : label
            ? element.getAttribute('aria-label') === label
            : Boolean(content && element.textContent?.trim() === content),
      ) ??
      (headerControl
        ? candidates.find((element) =>
            label
              ? element.getAttribute('aria-label') === label
              : Boolean(content && element.textContent?.trim() === content),
          )
        : undefined)
    replacement?.focus({ preventScroll: true })
  })
  observer.observe(root, { childList: true, subtree: true })
}
appRoot.render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
