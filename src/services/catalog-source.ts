import { isSupabaseConfigured } from './supabase-client'
import { canUseLocalFixtures } from './runtime-environment'

export type CatalogSource = 'local' | 'supabase'

/** Local fixtures are an explicit development/test mode, never a network fallback. */
function readCatalogSource(): CatalogSource {
  const requested = import.meta.env?.VITE_CATALOG_SOURCE?.trim()
  if (!canUseLocalFixtures) return 'supabase'
  if (requested === 'local' || requested === 'supabase') return requested
  if (requested) throw new Error('La configuración del catálogo no es válida.')
  // Partial/invalid credentials must fail remotely rather than expose fixtures.
  const attemptedConfiguration = Boolean(
    import.meta.env?.VITE_SUPABASE_URL?.trim() ||
    import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY?.trim(),
  )
  return isSupabaseConfigured || attemptedConfiguration ? 'supabase' : 'local'
}

export const catalogSource = readCatalogSource()
export const isRemoteCatalog = catalogSource === 'supabase'
