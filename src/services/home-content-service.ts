import { createDefaultHomeContent } from '../content/home-editor'
import type { HomeContent, HomeMedia } from '../types/home'
import { parseManagedVideoPath } from '../domain/media'
import {
  getManagedMedia,
  registerManagedMedia,
  getManagedVideo,
  registerManagedVideo,
} from './media-registry'
import { requireReadySupabaseClient } from './supabase-client'
import {
  cachedPublicQuery,
  publicQueryCacheGeneration,
  seedInitialPublicQuery,
} from './public-query-cache'
import type { ExpectedMediaActor } from './media-upload'
import { UserFacingError } from '../domain/user-facing-error'
import { takeInitialHome } from './home-bootstrap'

export type { HomeDocument } from '../domain/home-document'
import {
  createDefaultHomeDocument as defaultDocument,
  parseHomeDocumentValue,
  homeDocumentSlots as slots,
  homeDocumentLocation as location,
  invalidHomeDocument as invalid,
  canonicalHomeValue as canonical,
  type HomeDocument,
} from '../domain/home-document'

const listeners = new Set<() => void>()
let confirmed = defaultDocument()
let expectedPublicVersion = 0
let announcement = confirmed.content.announcement
// A read may discover a newer version itself. That must not change its cache
// key and turn the very next navigation into another identical request.
let publicReadRevision = 0
const publicHomeLifetimeMs = 30000

export function parseHomeDocument(
  value: unknown,
  featuredBrandId: string | null = null,
  options: { publicDocument?: boolean } = {},
): HomeDocument {
  const { document, assets } = parseHomeDocumentValue(
    value,
    featuredBrandId,
    options,
  )
  // No registry changes until the complete document and every manifest passed.
  for (const asset of assets) {
    if ('mimeType' in asset) registerManagedVideo(asset)
    else registerManagedMedia(asset)
  }
  return document
}

/** New media remains a draft until every upload succeeds and SQL commits. */
export async function prepareHomeDocument(
  media: HomeMedia,
  content: HomeContent,
  actor: ExpectedMediaActor,
) {
  const { uploadManagedImage, uploadManagedVideo } =
    await import('./media-upload')
  const prepared = structuredClone({ media, content })
  const references = new Map<string, string>()
  for (const slot of slots(prepared.content)) {
    const { holder, key } = location(prepared, slot)
    const resource = holder[key]
    if (resource == null) {
      holder[key] = null
      continue
    }
    if (typeof resource !== 'string') invalid()
    const identity = slot.purpose + ':' + resource
    let saved = references.get(identity)
    if (!saved) {
      if (slot.purpose === 'film-video') {
        const existing = getManagedVideo(resource)
        if (existing) saved = existing.id
        else if (parseManagedVideoPath(resource)) invalid()
        else {
          const uploaded = await uploadManagedVideo(resource, actor)
          registerManagedVideo(uploaded)
          saved = uploaded.id
        }
      } else {
        const existing = getManagedMedia(resource)
        if (existing) saved = existing.id
        else {
          const uploaded = await uploadManagedImage(
            resource,
            slot.purpose,
            actor,
          )
          saved = uploaded.id
        }
      }
      references.set(identity, saved)
    }
    holder[key] = saved
  }
  return prepared
}

export const publicHomeContent = {
  peek: () => confirmed,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  confirm(document: HomeDocument) {
    if (document.version < Math.max(expectedPublicVersion, confirmed.version))
      return false
    // Publishing confirms the complete canonical document in the editor first.
    // Its public cache must still omit hidden future campaigns in this browser.
    confirmed = {
      ...document,
      content: {
        ...document.content,
        hero: document.content.hero.filter((slide) => slide.published),
      },
    }
    expectedPublicVersion = document.version
    announcement = document.content.announcement
    listeners.forEach((listener) => listener())
    return true
  },
  metadata(value: HomeContent['announcement'] | null, version: number) {
    if (!Number.isSafeInteger(version) || version < 0) invalid()
    if (version < Math.max(expectedPublicVersion, confirmed.version)) return
    const next = value ?? createDefaultHomeContent().announcement
    if (
      expectedPublicVersion === version &&
      canonical(next) === canonical(announcement)
    )
      return
    expectedPublicVersion = version
    announcement = next
    confirmed = {
      ...confirmed,
      content: { ...confirmed.content, announcement },
    }
    listeners.forEach((listener) => listener())
  },
}

export async function readPublicHome(
  featuredBrandId: string | null | Promise<string | null> = null,
): Promise<HomeDocument> {
  const read = async () => {
    const { data, error } = await (await requireReadySupabaseClient()).rpc('home_document')
    if (error)
      throw new UserFacingError(
        'home-network',
        'No pudimos cargar el Home. Revisa tu conexión y vuelve a intentar.',
      )
    return data
  }
  const initial = takeInitialHome()
  const initialGeneration = publicQueryCacheGeneration()
  // Metadata or a successful save can advance while a previous read is still
  // in flight. Re-read once without cache instead of publishing older copy.
  for (let attempt = 0; attempt < 2; attempt++) {
    const readRevision = publicReadRevision
    const key = `home-document:${readRevision}`
    let fromInitial = attempt === 0 && initial !== undefined
    // Fetch independent public projections together, but keep catalog context
    // as a validation/publication barrier (including the version-zero default).
    const [received, brandId] = await Promise.all([
      fromInitial
        ? initial
        : cachedPublicQuery(key, read, publicHomeLifetimeMs),
      featuredBrandId,
    ])
    let raw = received
    // A write can supersede a document while the independent catalog context
    // is pending. Do not publish its previous epoch or seed it after the write.
    if (fromInitial && initialGeneration !== publicQueryCacheGeneration()) {
      fromInitial = false
      raw = await cachedPublicQuery(key, read, publicHomeLifetimeMs)
    }
    let result: HomeDocument
    try {
      result = parseHomeDocument(raw, brandId, { publicDocument: true })
    } catch (error) {
      if (attempt !== 0 || initial === undefined || initial === null)
        throw error
      // A malformed HTML DTO uses the ordinary network contract, retaining
      // the version/publication barrier and normal actionable errors.
      fromInitial = false
      raw = await cachedPublicQuery(key, read, publicHomeLifetimeMs)
      result = parseHomeDocument(raw, brandId, {
        publicDocument: true,
      })
    }
    if (publicHomeContent.confirm(result)) {
      if (fromInitial)
        seedInitialPublicQuery(
          key,
          raw,
          performance.now(),
          publicHomeLifetimeMs,
        )
      return result
    }
    // Metadata/publication won the version race. Rotate only once for all
    // readers of this old key; their fresh retry shares the existing pending
    // request and retains its ordinary TTL instead of bypassing the cache.
    if (publicReadRevision === readRevision) publicReadRevision++
  }
  throw new UserFacingError(
    'home-network',
    'El Home cambió durante la carga. Vuelve a intentarlo para ver la versión actual.',
  )
}
