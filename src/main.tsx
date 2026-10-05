import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import '@fontsource/ibm-plex-sans/latin-300.css'
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import './styles/global.css'
import './styles/font-options.css'
import { applyFontPreference, getFontPreference } from './lib/font-preference'
import './styles/shipping-editorial.css'
import { hydrateAdminStore } from './services/admin-service'
import { router } from './app/router'

const root = document.getElementById('root')
applyFontPreference(getFontPreference(), false)
if (!root) throw new Error('No se encontró el elemento raíz de la aplicación.')
await hydrateAdminStore()
createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
