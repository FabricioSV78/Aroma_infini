import {
  getMediaAliasSnapshot,
  mediaAliasGeneration,
  parseMediaAliasDocument,
  rememberMediaAliases,
  subscribeMediaAliases,
  type MediaAliasDocument,
} from './media-alias-registry'
import { isRemoteCatalog } from './catalog-source'
import { requireSupabaseClient } from './supabase-client'
import { registerManagedMedia, registerManagedVideo } from './media-registry'
import { cachedPublicQuery } from './public-query-cache'

let loaded = false
let pending: Promise<MediaAliasDocument> | null = null

function confirm(value: unknown): MediaAliasDocument {
  const document = parseMediaAliasDocument(value)
  // Validate every alias before publishing either metadata or URL mappings.
  document.items.forEach(({ asset }) => {
    if ('variants' in asset) registerManagedMedia(asset)
    else if (asset.mimeType === 'video/mp4') registerManagedVideo(asset)
  })
  const confirmed = rememberMediaAliases(document)
  loaded = true
  return confirmed
}

export const builtinMediaService = {
  getSnapshot: getMediaAliasSnapshot,
  subscribe: subscribeMediaAliases,
  confirm,
  async load(force = false): Promise<MediaAliasDocument> {
    if (!isRemoteCatalog || (loaded && !force)) return getMediaAliasSnapshot()
    if (pending) {
      if (!force) return pending
      const previous = pending
      await previous.catch(() => {})
      if (pending && pending !== previous) return pending
    }
    const expected = mediaAliasGeneration()
    const read = async () => {
      const result = await requireSupabaseClient()
        .rpc('public_media_aliases')
        .abortSignal(AbortSignal.timeout(10000))
      if (result.error)
        throw new Error('No pudimos cargar los recursos de la tienda.')
      return result.data
    }
    const operation = (async () => {
      const value = force
        ? await read()
        : await cachedPublicQuery('builtin-media', read, 30000)
      // A committed import may have updated aliases during this public read.
      return expected === mediaAliasGeneration()
        ? confirm(value)
        : getMediaAliasSnapshot()
    })().finally(() => {
      if (pending === operation) pending = null
    })
    pending = operation
    return operation
  },
}

export function loadBuiltinMedia(force = false) {
  return builtinMediaService.load(force)
}
