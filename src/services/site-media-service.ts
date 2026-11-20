import { useEffect, useSyncExternalStore } from 'react'
import {
  getSiteMediaItem,
  parseSiteMediaDocument,
  resolveSiteMedia,
  type SiteMediaDocument,
  type SiteMediaSlot,
} from '../domain/site-media-slots'
import { isRemoteCatalog } from './catalog-source'
import { requireReadySupabaseClient, requireReadyAdminSupabaseClient } from './supabase-client'
import { registerManagedMedia } from './media-registry'
import { assetSource, assetSourceSet } from './asset-source'
import {
  invalidatePublicQueryCache,
} from './public-query-cache'
import { UserFacingError } from '../domain/user-facing-error'
import { takeInitialPublicMedia, initialPublicMediaAgeMs } from './public-media-bootstrap'
import { createPublicDocumentCache } from './public-document-cache'

let snapshot: SiteMediaDocument = { items: [] }
let hydrated = false
const listeners = new Set<() => void>()

function adminError(error: { code?: string } | null, status: number): void {
  if (!error) return
  if (error.code === 'PT410')
    throw new UserFacingError(
      'site-media-retired',
      'La imagen provisional ya fue eliminada. Sube una nueva imagen para este apartado; la imagen publicada se conserva.',
    )
  if (
    [401, 403].includes(status) ||
    ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(error.code ?? '')
  )
    throw new UserFacingError(
      'site-media-session',
      'Tu sesión administrativa cambió. Vuelve a iniciar sesión antes de continuar.',
    )
  if (['PT409', '40001'].includes(error.code ?? ''))
    throw new UserFacingError(
      'site-media-conflict',
      'Esta imagen cambió en otra sesión. Conserva tu selección y vuelve a cargar.',
    )
  if (['22023', '23514'].includes(error.code ?? ''))
    throw new UserFacingError(
      'site-media-validation',
      'La imagen no cumple el formato o la resolución mínima de esta ubicación. Revisa las dimensiones indicadas y selecciona una imagen compatible.',
    )
  throw new UserFacingError(
    'site-media-network',
    'No pudimos confirmar la imagen. Conserva tu selección y revisa la conexión y tu sesión administrativa.',
  )
}

function confirm(value: unknown): SiteMediaDocument {
  const document = parseSiteMediaDocument(value)
  // Register only after all items passed validation. New snapshots cannot
  // expose a srcset before the complete immutable manifest is available.
  document.items.forEach((item) => {
    if (item.asset && 'variants' in item.asset) registerManagedMedia(item.asset)
  })
  const items = [...snapshot.items]
  for (const item of document.items) {
    const previous = getSiteMediaItem(snapshot, item.slot)
    if (item.version < previous.version) continue
    const index = items.findIndex((current) => current.slot === item.slot)
    if (index < 0) items.push(item)
    else items[index] = item
  }
  snapshot = { items }
  listeners.forEach((listener) => listener())
  return snapshot
}

const publicDocument = createPublicDocumentCache('site-media', async () => {
  const result = await (await requireReadySupabaseClient()).rpc('site_media_document')
  if (result.error) throw new UserFacingError('site-media-network', 'No pudimos cargar las imágenes de la tienda.')
  return result.data
}, confirm, () => snapshot)

export const siteMediaService = {
  hydrateInitial() {
    if (!isRemoteCatalog || hydrated) return
    hydrated = true
    const initial = takeInitialPublicMedia('document')
    if (initial !== undefined) {
      try {
        publicDocument.seed(initial, initialPublicMediaAgeMs())
      } catch {
        /* Normal load retains its retry/error path. */
      }
    }
  },
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  confirm,
  async load(force = false): Promise<SiteMediaDocument> {
    if (!isRemoteCatalog) return snapshot
    return publicDocument.load(force)
  },
  async loadAdmin(): Promise<SiteMediaDocument> {
    if (!isRemoteCatalog) return snapshot
    const { mediaAdminActor } = await import('./media-admin-service')
    const actor = await mediaAdminActor()
    const result = await (await requireReadyAdminSupabaseClient())
      .rpc('admin_site_media_document')
      .setHeader('Authorization', `Bearer ${actor.token}`)
    await actor.assertCurrent?.()
    adminError(result.error, result.status)
    return confirm(result.data)
  },
  async save(
    slot: SiteMediaSlot,
    assetId: string | null,
    alt: string,
    expectedVersion: number,
  ): Promise<SiteMediaDocument> {
    if (!isRemoteCatalog)
      throw new UserFacingError(
        'site-media-config',
        'La publicación de imágenes requiere la conexión administrativa.',
      )
    const { mediaAdminActor } = await import('./media-admin-service')
    const actor = await mediaAdminActor()
    const result = await (await requireReadyAdminSupabaseClient())
      .rpc('admin_save_site_media', {
        p_slot: slot,
        // NULL restores the fallback; generated RPC types omit nullability.
        p_asset_id: assetId as string,
        p_alt: alt,
        p_expected_version: expectedVersion,
      })
      .setHeader('Authorization', `Bearer ${actor.token}`)
    await actor.assertCurrent?.()
    adminError(result.error, result.status)
    const confirmed = confirm(result.data)
    invalidatePublicQueryCache(true)
    return confirmed
  },
}

export function useSiteMedia(): SiteMediaDocument {
  const document = useSyncExternalStore(
    siteMediaService.subscribe,
    siteMediaService.getSnapshot,
    siteMediaService.getSnapshot,
  )
  useEffect(function loadSharedSiteMedia() {
    void siteMediaService.load().catch(() => {})
  }, [])
  return document
}

export function siteMediaImage(
  document: SiteMediaDocument,
  slot: SiteMediaSlot,
) {
  const image = resolveSiteMedia(document, slot)
  return {
    ...image,
    src: assetSource(image.src),
    srcSet: image.srcSet ? assetSourceSet(image.srcSet) : undefined,
  }
}
