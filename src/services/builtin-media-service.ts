import {
  getMediaAliasSnapshot,
  mediaAliasGeneration,
  parseMediaAliasDocument,
  rememberMediaAliases,
  subscribeMediaAliases,
  type MediaAliasDocument,
} from './media-alias-registry'
import { isRemoteCatalog } from './catalog-source'
import { requireReadySupabaseClient } from './supabase-client'
import { registerManagedMedia, registerManagedVideo } from './media-registry'
import { createPublicDocumentCache } from './public-document-cache'
import { takeInitialPublicMedia, initialPublicMediaAgeMs } from './public-media-bootstrap'

let hydrated = false

function confirm(value: unknown): MediaAliasDocument {
  const document = parseMediaAliasDocument(value)
  // Validate every alias before publishing either metadata or URL mappings.
  document.items.forEach(({ asset }) => {
    if ('variants' in asset) registerManagedMedia(asset)
    else if (asset.mimeType === 'video/mp4') registerManagedVideo(asset)
  })
  const confirmed = rememberMediaAliases(document)
  return confirmed
}

const publicDocument = createPublicDocumentCache('builtin-media', async () => {
  const expected = mediaAliasGeneration()
  const result = await (await requireReadySupabaseClient())
    .rpc('public_media_aliases').abortSignal(AbortSignal.timeout(10000))
  if (result.error) throw new Error('No pudimos cargar los recursos de la tienda.')
  // An importer may have committed new associations while this read was pending.
  return expected === mediaAliasGeneration() ? result.data : getMediaAliasSnapshot()
}, confirm, getMediaAliasSnapshot)

export const builtinMediaService = {
  getSnapshot: getMediaAliasSnapshot,
  subscribe: subscribeMediaAliases,
  confirm,
  async load(force = false): Promise<MediaAliasDocument> {
    if (!isRemoteCatalog) return getMediaAliasSnapshot()
    if (!force && !hydrated) {
      hydrated = true
      const initial = takeInitialPublicMedia('aliases')
      if (initial !== undefined) {
        try { publicDocument.seed(initial, initialPublicMediaAgeMs()) }
        catch { /* Retry through the ordinary public contract. */ }
      }
    }
    return publicDocument.load(force)
  },
}
