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
import { hydrateAdminStore } from './services/admin-service'
import { PageLoadingState } from './components/ui/PageLoadingState'
import './styles/ui-states.css'
import './styles/interaction-states.css'

const root = document.getElementById('root')
applyFontPreference(getFontPreference(), false)
if (!root) throw new Error('No se encontró el elemento raíz de la aplicación.')
const appRoot = createRoot(root)
appRoot.render(<PageLoadingState pathname={window.location.pathname} />)
await hydrateAdminStore()
// Create loaders after the shared catalog has finished loading.
const { router } = await import('./app/router')
appRoot.render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
