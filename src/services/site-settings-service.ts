import { useEffect, useSyncExternalStore } from 'react'
import {
  defaultSiteSettings,
  parseSiteSettingsDocument,
  type SiteSettings,
  type SiteSettingsDocument,
} from '../domain/site-settings'
import { isRemoteCatalog } from './catalog-source'
import { requireReadySupabaseClient, requireReadyAdminSupabaseClient } from './supabase-client'
import { takePublicInitialContext } from './public-initial-context'
import { createPublicDocumentCache } from './public-document-cache'
import { invalidatePublicQueryCache } from './public-query-cache'

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
const listeners = new Set<() => void>()
let hydrated = false
function confirm(document: SiteSettingsDocument) {
  if (document.version < snapshot.version) return snapshot
  snapshot = document
  listeners.forEach((listener) => listener())
  return snapshot
}
const publicDocument = createPublicDocumentCache('site-settings', async () => {
  const { data, error } = await (await requireReadySupabaseClient()).rpc('site_settings')
  if (error) throw new Error('No pudimos cargar los datos de la tienda. Vuelve a intentar.')
  return data
}, (value) => {
  const source = value as { version?: unknown; data?: unknown } | null
  return confirm(source?.version === 0 && source.data === null
    ? { version: 0, data: defaultSiteSettings() }
    : parseSiteSettingsDocument(value))
}, () => snapshot)

export const siteSettingsService = {
  hydrateInitial() {
    if (!isRemoteCatalog || hydrated) return
    hydrated = true
    const value = takePublicInitialContext('settings')
    if (value === undefined) return
    try {
      publicDocument.seed(value, performance.now())
    } catch {
      /* Keep neutral content until the normal public read succeeds. */
    }
  },
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  async load(force = false): Promise<SiteSettingsDocument> {
    if (!force) this.hydrateInitial()
    if (!isRemoteCatalog) return snapshot
    return publicDocument.load(force)
  },
  async save(
    data: SiteSettings,
    version: number,
  ): Promise<SiteSettingsDocument> {
    if (!isRemoteCatalog)
      return confirm(parseSiteSettingsDocument({ version: version + 1, data }))
    const result = await (await requireReadyAdminSupabaseClient()).rpc(
      'admin_save_site_settings',
      { p_data: JSON.parse(JSON.stringify(data)), p_expected_version: version },
    )
    if (result.error)
      throw new Error(
        result.error.code === 'PT409'
          ? 'Otra persona cambió esta configuración. Conserva tus textos y vuelve a cargar.'
          : 'No pudimos guardar. Revisa los datos y tu sesión administrativa.',
      )
    const confirmed = confirm(parseSiteSettingsDocument(result.data))
    invalidatePublicQueryCache(true)
    return confirmed
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
