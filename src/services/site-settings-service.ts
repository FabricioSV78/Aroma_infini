import { useEffect, useSyncExternalStore } from 'react'
import {
  defaultSiteSettings,
  parseSiteSettingsDocument,
  type SiteSettings,
  type SiteSettingsDocument,
} from '../domain/site-settings'
import { isRemoteCatalog } from './catalog-source'
import { requireSupabaseClient } from './supabase-client'

// A missing/failed remote read must never invent business contact or policies.
// Demo text is adopted only after the API explicitly confirms an empty document.
const neutralSettings: SiteSettings = {
  demonstration: false,
  business: { name: 'Aroma Infini', legalName: '', taxId: '', address: '' },
  contact: { whatsapp: '', email: '', hours: '' },
  social: { instagram: '', facebook: '', tiktok: '' },
  policies: { privacy: '', terms: '', returns: '' },
}
let snapshot: SiteSettingsDocument = {
  version: 0,
  data: isRemoteCatalog ? neutralSettings : defaultSiteSettings(),
}
let pending: Promise<SiteSettingsDocument> | null = null
const listeners = new Set<() => void>()
let loaded = false
function confirm(document: SiteSettingsDocument) {
  if (document.version < snapshot.version) return snapshot
  snapshot = document
  loaded = true
  listeners.forEach((listener) => listener())
  return snapshot
}
export const siteSettingsService = {
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  async load(force = false): Promise<SiteSettingsDocument> {
    if (!isRemoteCatalog || (loaded && !force)) return snapshot
    if (pending) return pending
    pending = (async () => {
      const { data, error } = await requireSupabaseClient().rpc('site_settings')
      if (error)
        throw new Error(
          'No pudimos cargar los datos de la tienda. Vuelve a intentar.',
        )
      const source = data as { version?: unknown; data?: unknown } | null
      if (source?.version === 0 && source.data === null)
        return confirm({ version: 0, data: defaultSiteSettings() })
      return confirm(parseSiteSettingsDocument(data))
    })().finally(() => {
      pending = null
    })
    return pending
  },
  async save(
    data: SiteSettings,
    version: number,
  ): Promise<SiteSettingsDocument> {
    if (!isRemoteCatalog)
      return confirm(parseSiteSettingsDocument({ version: version + 1, data }))
    const result = await requireSupabaseClient().rpc(
      'admin_save_site_settings',
      { p_data: JSON.parse(JSON.stringify(data)), p_expected_version: version },
    )
    if (result.error)
      throw new Error(
        result.error.code === 'PT409'
          ? 'Otra persona cambió esta configuración. Conserva tus textos y vuelve a cargar.'
          : 'No pudimos guardar. Revisa los datos y tu sesión administrativa.',
      )
    return confirm(parseSiteSettingsDocument(result.data))
  },
}
export function useSiteSettings() {
  const result = useSyncExternalStore(
    siteSettingsService.subscribe,
    siteSettingsService.getSnapshot,
  )
  useEffect(() => {
    void siteSettingsService.load().catch(() => {})
  }, [])
  return result.data
}
