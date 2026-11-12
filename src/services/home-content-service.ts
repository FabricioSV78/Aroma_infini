import {
  createDefaultHomeContent,
  normalizeHomeContent,
  validateHomeContent,
  upgradeLegacyHeroContent,
} from '../content/home-editor'
import type { HomeContent, HomeMedia } from '../types/home'
import {
  parseManagedMediaAsset,
  parseManagedVideoAsset,
  parseManagedVideoPath,
  type ImageMediaPurpose,
} from '../domain/media'
import {
  getManagedMedia,
  registerManagedMedia,
  getManagedVideo,
  registerManagedVideo,
} from './media-registry'
import { requireSupabaseClient } from './supabase-client'
import { cachedPublicQuery } from './public-query-cache'
import type { ExpectedMediaActor } from './media-upload'
import { UserFacingError } from './admin-messages'

export interface HomeDocument {
  media: HomeMedia
  content: HomeContent
  version: number
}

const mediaKeys = ['hombre', 'mujer', 'unisex', 'complementos'] as const
// SQL bounds the stored content to 256 KiB and up to 100 verified assets.
// Its projected DTO also includes manifests and longer resolved media sources.
const maximumHomeDocumentBytes = 1024 * 1024
const emptyMedia = (): HomeMedia => ({
  hombre: null,
  mujer: null,
  unisex: null,
  complementos: null,
})
function defaultDocument(featuredBrandId: string | null = null): HomeDocument {
  const content = createDefaultHomeContent()
  content.featuredBrandId = featuredBrandId
  return { media: emptyMedia(), content, version: 0 }
}

const listeners = new Set<() => void>()
let confirmed = defaultDocument()
let expectedPublicVersion = 0
let announcement = confirmed.content.announcement

function invalid(): never {
  throw new UserFacingError(
    'home-response',
    'No pudimos verificar el contenido del Home. Vuelve a cargar la página.',
  )
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  return value as Record<string, unknown>
}
function canonical(value: unknown, depth = 0): string {
  if (depth > 12) invalid()
  if (Array.isArray(value))
    return '[' + value.map((item) => canonical(item, depth + 1)).join(',') + ']'
  if (value && typeof value === 'object') {
    const record = object(value)
    if (
      Object.keys(record).some((key) =>
        ['__proto__', 'prototype', 'constructor'].includes(key),
      )
    )
      invalid()
    return (
      '{' +
      Object.keys(record)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) + ':' + canonical(record[key], depth + 1),
        )
        .join(',') +
      '}'
    )
  }
  if (value === undefined) invalid()
  return JSON.stringify(value)
}

interface ResourceSlot {
  owner: 'media' | 'content'
  path: string[]
  purpose: ImageMediaPurpose | 'film-video'
}
function slots(content: HomeContent): ResourceSlot[] {
  return [
    ...mediaKeys.map((key) => ({
      owner: 'media' as const,
      path: [key],
      purpose: 'category' as const,
    })),
    ...content.hero.flatMap((_, index) => [
      {
        owner: 'content' as const,
        path: ['hero', String(index), 'desktopImage'],
        purpose: 'hero-desktop' as const,
      },
      {
        owner: 'content' as const,
        path: ['hero', String(index), 'mobileImage'],
        purpose: 'hero-mobile' as const,
      },
      ...(['video', 'mobileVideo'] as const).map((key) => ({
        owner: 'content' as const,
        path: ['hero', String(index), key],
        purpose: 'film-video' as const,
      })),
      ...(['poster', 'mobilePoster'] as const).map((key) => ({
        owner: 'content' as const,
        path: ['hero', String(index), key],
        purpose: 'film-poster' as const,
      })),
    ]),
    {
      owner: 'content',
      path: ['finder', 'desktopImage'],
      purpose: 'finder-desktop',
    },
    {
      owner: 'content',
      path: ['finder', 'mobileImage'],
      purpose: 'finder-mobile',
    },
    ...Object.keys(content.finder.familyVisuals).map((key) => ({
      owner: 'content' as const,
      path: ['finder', 'familyVisuals', key, 'image'],
      purpose: 'finder-option' as const,
    })),
    ...(['video', 'mobileVideo'] as const).map((key) => ({
      owner: 'content' as const,
      path: ['film', key],
      purpose: 'film-video' as const,
    })),
    ...(['poster', 'mobilePoster'] as const).map((key) => ({
      owner: 'content' as const,
      path: ['film', key],
      purpose: 'film-poster' as const,
    })),
  ]
}
function location(
  document: Pick<HomeDocument, 'media' | 'content'>,
  slot: ResourceSlot,
) {
  let holder = document[slot.owner] as unknown as Record<string, unknown>
  for (const key of slot.path.slice(0, -1))
    holder = holder[key] as Record<string, unknown>
  return { holder, key: slot.path.at(-1)! }
}

export function parseHomeDocument(
  value: unknown,
  featuredBrandId: string | null = null,
  { publicDocument = false }: { publicDocument?: boolean } = {},
): HomeDocument {
  const source = object(value)
  if (
    !Number.isSafeInteger(source.version) ||
    (source.version as number) < 0 ||
    !Array.isArray(source.mediaAssets) ||
    source.mediaAssets.length > 100
  )
    invalid()
  if (source.version === 0) {
    if (
      source.content !== null ||
      source.media !== null ||
      source.mediaAssets.length
    )
      invalid()
    return defaultDocument(featuredBrandId)
  }
  if (
    new TextEncoder().encode(JSON.stringify(source)).byteLength >
    maximumHomeDocumentBytes
  )
    invalid()
  const rawContent = object(source.content)
  const rawMedia = object(source.media)
  if (
    Object.keys(rawMedia).sort().join(',') !== [...mediaKeys].sort().join(',')
  )
    invalid()
  const parsed = source.mediaAssets.map((asset) => {
    const record = object(asset)
    return record.mimeType === 'video/mp4'
      ? parseManagedVideoAsset(asset)
      : parseManagedMediaAsset(asset)
  })
  // Remote documents are already versioned and validated by SQL. Local legacy
  // migrations must not append default families or rewrite their saved copy.
  const content = normalizeHomeContent(rawContent, {
    preserveRemoteContent: true,
  })
  if (
    canonical(content) !==
      canonical({
        ...rawContent,
        hero: upgradeLegacyHeroContent(rawContent.hero),
      }) ||
    validateHomeContent(content, { allowEmptyHero: publicDocument })
  )
    invalid()
  const media = emptyMedia()
  for (const key of mediaKeys) {
    if (rawMedia[key] !== null && typeof rawMedia[key] !== 'string') invalid()
    media[key] = rawMedia[key] as string | null
  }
  const result = { media, content, version: source.version as number }
  const referenced = new Set<string>()
  for (const slot of slots(content)) {
    const { holder, key } = location(result, slot)
    const resource = holder[key]
    if (resource == null) continue
    if (typeof resource !== 'string') invalid()
    const asset = parsed.find((candidate) => candidate.src === resource)
    if (!asset || (slot.purpose === 'film-video') !== 'mimeType' in asset)
      invalid()
    referenced.add(asset.id)
  }
  if (
    parsed.some((asset) => !referenced.has(asset.id)) ||
    new Set(parsed.map((asset) => asset.id)).size !== parsed.length
  )
    invalid()
  // Register only after the entire document and every manifest passed checks.
  for (const asset of parsed) {
    if ('mimeType' in asset) {
      registerManagedVideo(asset)
    } else registerManagedMedia(asset)
  }
  return result
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
    const { data, error } = await requireSupabaseClient().rpc('home_document')
    if (error)
      throw new UserFacingError(
        'home-network',
        'No pudimos cargar el Home. Revisa tu conexión y vuelve a intentar.',
      )
    return data
  }
  // Metadata or a successful save can advance while a previous read is still
  // in flight. Re-read once without cache instead of publishing older copy.
  for (let attempt = 0; attempt < 2; attempt++) {
    // Fetch independent public projections together, but keep catalog context
    // as a validation/publication barrier (including the version-zero default).
    const [raw, brandId] = await Promise.all([
      attempt === 0
        ? cachedPublicQuery(`home:${expectedPublicVersion}`, read, 30000)
        : read(),
      featuredBrandId,
    ])
    const result = parseHomeDocument(raw, brandId, {
      publicDocument: true,
    })
    if (publicHomeContent.confirm(result)) return result
  }
  throw new UserFacingError(
    'home-network',
    'El Home cambió durante la carga. Vuelve a intentarlo para ver la versión actual.',
  )
}
