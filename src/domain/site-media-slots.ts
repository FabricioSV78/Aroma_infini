import { siteMediaDefaults } from '../content/site-media-defaults'
import {
  parseManagedMediaAsset,
  parseManagedSvgAsset,
  type ManagedMediaAsset,
  type ManagedSvgAsset,
} from './media'

export type SiteMediaSlot = keyof typeof siteMediaDefaults

export interface SiteMediaFallback {
  src: string
  srcSet?: string
  width: number
  height: number
  alt: string
}

export interface SiteMediaSlotDefinition {
  slot: SiteMediaSlot
  name: string
  section: string
  purpose: 'site-image'
  fallback: SiteMediaFallback
  minimumDimensions: { width: number; height: number }
  decorative: boolean
}

// Resolution requirements follow each placement's rendered use. Responsive
// account candidates and landscape sharing cards need not match the fallback's
// largest file or aspect ratio. The SQL boundary is checked against this table.
export const SITE_MEDIA_MINIMUM_DIMENSIONS = {
  'about.hero.desktop': { width: 1536, height: 864 },
  'about.hero.mobile': { width: 780, height: 858 },
  'about.story': { width: 960, height: 1200 },
  'auth.customer.desktop': { width: 780, height: 1170 },
  'auth.customer.mobile': { width: 960, height: 320 },
  'identity.logo': { width: 774, height: 374 },
  'seo.home': { width: 1200, height: 630 },
  'seo.catalog': { width: 1200, height: 630 },
  'seo.brands': { width: 1200, height: 630 },
} as const satisfies Record<SiteMediaSlot, { width: number; height: number }>

const labels: Record<
  SiteMediaSlot,
  [name: string, section: string, decorative: boolean]
> = {
  'about.hero.desktop': ['Portada de Nosotros · escritorio', 'Nosotros', false],
  'about.hero.mobile': ['Portada de Nosotros · móvil', 'Nosotros', false],
  'about.story': ['Imagen de Nuestra esencia', 'Nosotros', false],
  'auth.customer.desktop': [
    'Acceso a clientes · escritorio',
    'Mi cuenta',
    true,
  ],
  'auth.customer.mobile': ['Acceso a clientes · móvil', 'Mi cuenta', true],
  'identity.logo': ['Logotipo de la tienda', 'Identidad', false],
  'seo.home': ['Imagen para compartir el inicio', 'Compartir', false],
  'seo.catalog': ['Imagen para compartir la tienda', 'Compartir', false],
  'seo.brands': ['Imagen para compartir las marcas', 'Compartir', false],
}

export const SITE_MEDIA_SLOTS: readonly SiteMediaSlotDefinition[] = (
  Object.keys(siteMediaDefaults) as SiteMediaSlot[]
).map((slot) => ({
  slot,
  name: labels[slot][0],
  section: labels[slot][1],
  decorative: labels[slot][2],
  purpose: 'site-image',
  fallback: siteMediaDefaults[slot],
  minimumDimensions: SITE_MEDIA_MINIMUM_DIMENSIONS[slot],
}))

export interface SiteMediaItem {
  slot: SiteMediaSlot
  alt: string
  version: number
  assetId: string | null
  asset: ManagedMediaAsset | ManagedSvgAsset | null
}

export interface SiteMediaDocument {
  items: SiteMediaItem[]
}

export function isSiteMediaSlot(value: unknown): value is SiteMediaSlot {
  return typeof value === 'string' && Object.hasOwn(siteMediaDefaults, value)
}

export function getSiteMediaItem(
  document: SiteMediaDocument,
  slot: SiteMediaSlot,
): SiteMediaItem {
  return (
    document.items.find((item) => item.slot === slot) ?? {
      slot,
      version: 0,
      alt: siteMediaDefaults[slot].alt,
      assetId: null,
      asset: null,
    }
  )
}

/** The fallback keeps its exact original candidate list; managed candidates
 * come exclusively from the verified immutable manifest, never guessed URLs. */
export function resolveSiteMedia(
  document: SiteMediaDocument,
  slot: SiteMediaSlot,
): SiteMediaFallback {
  const item = getSiteMediaItem(document, slot)
  if (!item.asset) return siteMediaDefaults[slot]
  return {
    src: item.asset.src,
    srcSet:
      'variants' in item.asset
        ? item.asset.variants
            .map((variant) => `${variant.src} ${variant.width}w`)
            .join(', ')
        : undefined,
    width: item.asset.width,
    height: item.asset.height,
    alt: labels[slot][2] ? '' : item.alt,
  }
}

/** Parse the entire projection before registering or exposing any manifest. */
export function parseSiteMediaDocument(value: unknown): SiteMediaDocument {
  if (
    !value ||
    typeof value !== 'object' ||
    !('items' in value) ||
    !Array.isArray(value.items) ||
    value.items.length > SITE_MEDIA_SLOTS.length
  )
    throw new Error('Invalid site media document')
  const seen = new Set<SiteMediaSlot>()
  const items = value.items.map((candidate): SiteMediaItem => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
      throw new Error('Invalid site media item')
    const item = candidate as Record<string, unknown>
    if (
      !isSiteMediaSlot(item.slot) ||
      seen.has(item.slot) ||
      typeof item.alt !== 'string' ||
      item.alt.length > 1000 ||
      typeof item.version !== 'number' ||
      !Number.isSafeInteger(item.version) ||
      item.version < 0
    )
      throw new Error('Invalid site media item')
    seen.add(item.slot)
    const svg =
      item.asset &&
      typeof item.asset === 'object' &&
      'mimeType' in item.asset &&
      item.asset.mimeType === 'image/svg+xml'
    if (svg && item.slot !== 'identity.logo')
      throw new Error('A vector image is only valid for the site identity')
    const asset =
      item.asset === null
        ? null
        : svg
          ? parseManagedSvgAsset(item.asset)
          : parseManagedMediaAsset(item.asset)
    if (item.assetId !== undefined && item.assetId !== (asset?.id ?? null))
      throw new Error('Invalid site media identity')
    return {
      slot: item.slot,
      alt: item.alt,
      version: item.version,
      assetId: asset?.id ?? null,
      asset,
    }
  })
  return { items }
}
