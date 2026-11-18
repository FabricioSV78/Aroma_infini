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
  type ImageMediaPurpose,
  type ManagedMediaAsset,
  type ManagedVideoAsset,
} from './media'
import { UserFacingError } from './user-facing-error'
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
export function createDefaultHomeDocument(
  featuredBrandId: string | null = null,
): HomeDocument {
  const content = createDefaultHomeContent()
  content.featuredBrandId = featuredBrandId
  return { media: emptyMedia(), content, version: 0 }
}

export function invalidHomeDocument(): never {
  throw new UserFacingError(
    'home-response',
    'No pudimos verificar el contenido del Home. Vuelve a cargar la página.',
  )
}
const invalid: () => never = invalidHomeDocument
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid()
  return value as Record<string, unknown>
}
export function canonicalHomeValue(value: unknown, depth = 0): string {
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
const canonical = canonicalHomeValue

interface ResourceSlot {
  owner: 'media' | 'content'
  path: string[]
  purpose: ImageMediaPurpose | 'film-video'
}
export function homeDocumentSlots(content: HomeContent): ResourceSlot[] {
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
export function homeDocumentLocation(
  document: Pick<HomeDocument, 'media' | 'content'>,
  slot: ResourceSlot,
) {
  let holder = document[slot.owner] as unknown as Record<string, unknown>
  for (const key of slot.path.slice(0, -1))
    holder = holder[key] as Record<string, unknown>
  return { holder, key: slot.path.at(-1)! }
}

export function parseHomeDocumentValue(
  value: unknown,
  featuredBrandId: string | null = null,
  { publicDocument = false }: { publicDocument?: boolean } = {},
): {
  document: HomeDocument
  assets: (ManagedMediaAsset | ManagedVideoAsset)[]
} {
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
    return { document: createDefaultHomeDocument(featuredBrandId), assets: [] }
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
  for (const slot of homeDocumentSlots(content)) {
    const { holder, key } = homeDocumentLocation(result, slot)
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
  return { document: result, assets: parsed }
}
