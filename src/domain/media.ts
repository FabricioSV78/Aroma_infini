import { STATIC_SVG_MAX_BYTES } from './static-svg.js'

/** Contracts shared by image preparation, the Worker and public catalog DTOs. */
export const MEDIA_ORIGINAL_MAX_BYTES = 20 * 1024 * 1024
export const MEDIA_ORIGINAL_MAX_PIXELS = 40_000_000
export const MEDIA_ORIGINAL_MAX_DIMENSION = 12000
export const MEDIA_VARIANT_MAX_BYTES = 4 * 1024 * 1024
export const MEDIA_UPLOAD_MAX_BYTES = 12 * 1024 * 1024
export const MEDIA_MAX_VARIANTS = 3
export const MEDIA_PREPARED_MAX_WIDTH = 2304
export const MEDIA_PREPARED_MAX_HEIGHT = 2400
export const MEDIA_PREPARED_MAX_PIXELS = 4_000_000

export type ProductMediaPurpose = 'product-gallery' | 'product-olfactory'
export type ImageMediaPurpose =
  | ProductMediaPurpose
  | 'category'
  | 'hero-desktop'
  | 'hero-mobile'
  | 'finder-desktop'
  | 'finder-mobile'
  | 'finder-option'
  | 'film-poster'
  | 'site-image'
export const MEDIA_VIDEO_MAX_BYTES = 10 * 1024 * 1024
export const MEDIA_VIDEO_MAX_DURATION_MS = 60000
export interface ManagedVideoAsset {
  id: string
  src: string
  width: number
  height: number
  durationMs: number
  byteSize: number
  mimeType: 'video/mp4'
}

export const MEDIA_SVG_MAX_BYTES = STATIC_SVG_MAX_BYTES
export interface ManagedSvgAsset {
  id: string
  src: string
  width: number
  height: number
  byteSize: number
  mimeType: 'image/svg+xml'
}

const managedSvgPath =
  /^\/media\/public\/dynamic\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{64})\/vector\.svg$/
export function parseManagedSvgPath(value: unknown) {
  if (typeof value !== 'string' || value.length > 240) return null
  const match = value.match(managedSvgPath)
  return match ? { id: match[1], hash: match[2], src: value } : null
}
export function parseManagedSvgAsset(value: unknown): ManagedSvgAsset {
  const source = object(value)
  const path = parseManagedSvgPath(source.src)
  const width = dimension(source.width),
    height = dimension(source.height)
  if (
    !path ||
    path.id !== source.id ||
    source.mimeType !== 'image/svg+xml' ||
    width < 1 ||
    height < 1 ||
    width > 4096 ||
    height > 4096 ||
    typeof source.byteSize !== 'number' ||
    !Number.isSafeInteger(source.byteSize) ||
    source.byteSize < 1 ||
    source.byteSize > MEDIA_SVG_MAX_BYTES
  )
    throw new InvalidMediaManifestError()
  return {
    id: path.id,
    src: path.src,
    width,
    height,
    byteSize: source.byteSize,
    mimeType: 'image/svg+xml',
  }
}

export interface ManagedMediaVariant {
  src: string
  width: number
  height: number
}

export interface ManagedMediaAsset extends ManagedMediaVariant {
  id: string
  variants: ManagedMediaVariant[]
}

export const PRODUCT_MEDIA_PROFILES = {
  'product-gallery': { width: 800, height: 1000, maxWidth: 1600 },
  'product-olfactory': { width: 960, height: 1200, maxWidth: 1600 },
} as const satisfies Record<
  ProductMediaPurpose,
  { width: number; height: number; maxWidth: number }
>

export const IMAGE_MEDIA_PROFILES = {
  ...PRODUCT_MEDIA_PROFILES,
  category: { width: 800, height: 1000, maxWidth: 1600 },
  'hero-desktop': { width: 1536, height: 864, maxWidth: 2304 },
  'finder-desktop': { width: 1536, height: 864, maxWidth: 2304 },
  'hero-mobile': { width: 780, height: 1170, maxWidth: 1560 },
  'finder-mobile': { width: 780, height: 1170, maxWidth: 1560 },
  'finder-option': { width: 480, height: 480, maxWidth: 960 },
  'film-poster': { width: 320, height: 320, maxWidth: 1600 },
  'site-image': { width: 64, height: 32, maxWidth: 2304 },
} as const satisfies Record<
  ImageMediaPurpose,
  { width: number; height: number; maxWidth: number }
>

export function isImageMediaPurpose(
  value: unknown,
): value is ImageMediaPurpose {
  return typeof value === 'string' && Object.hasOwn(IMAGE_MEDIA_PROFILES, value)
}

/** Apply a placement's own cap before decoding; product limits stay at 1600px. */
export function validPreparedImageDimensions(
  width: number,
  height: number,
  purpose: ImageMediaPurpose,
  master = true,
): boolean {
  const profile = IMAGE_MEDIA_PROFILES[purpose]
  return (
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= profile.maxWidth &&
    height <= MEDIA_PREPARED_MAX_HEIGHT &&
    width * height <= MEDIA_PREPARED_MAX_PIXELS &&
    (!master || (width >= profile.width && height >= profile.height)) &&
    (purpose === 'film-poster' ||
      purpose === 'site-image' ||
      Math.abs(height - (width * profile.height) / profile.width) <= 1)
  )
}

export function imageMediaWidths(
  masterWidth: number,
  purpose: ImageMediaPurpose,
): number[] {
  if (
    !Number.isSafeInteger(masterWidth) ||
    masterWidth < 1 ||
    masterWidth > IMAGE_MEDIA_PROFILES[purpose].maxWidth
  )
    return []
  return [
    ...new Set([480, 960, masterWidth].filter((width) => width <= masterWidth)),
  ].sort((a, b) => a - b)
}

const managedPath =
  /^\/media\/public\/dynamic\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{64})\/([1-9][0-9]{0,4})\.webp$/

export function parseManagedMediaPath(value: unknown) {
  if (typeof value !== 'string' || value.length > 240) return null
  const match = value.match(managedPath)
  if (!match) return null
  const width = Number(match[3])
  if (width > MEDIA_PREPARED_MAX_WIDTH) return null
  return { id: match[1], hash: match[2], width, src: value }
}

export function isManagedMediaSource(value: unknown): value is string {
  return parseManagedMediaPath(value) !== null
}

const managedVideoPath =
  /^\/media\/public\/dynamic\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{64})\/video\.mp4$/
export function parseManagedVideoPath(value: unknown) {
  if (typeof value !== 'string' || value.length > 240) return null
  const match = value.match(managedVideoPath)
  return match ? { id: match[1], hash: match[2], src: value } : null
}

export function parseManagedVideoAsset(value: unknown): ManagedVideoAsset {
  const source = object(value)
  const path = parseManagedVideoPath(source.src)
  const width = dimension(source.width),
    height = dimension(source.height)
  if (
    !path ||
    path.id !== source.id ||
    source.mimeType !== 'video/mp4' ||
    width < 480 ||
    height < 480 ||
    width > 4096 ||
    height > 4096 ||
    typeof source.durationMs !== 'number' ||
    !Number.isSafeInteger(source.durationMs) ||
    source.durationMs < 2000 ||
    source.durationMs > MEDIA_VIDEO_MAX_DURATION_MS ||
    typeof source.byteSize !== 'number' ||
    !Number.isSafeInteger(source.byteSize) ||
    source.byteSize < 1 ||
    source.byteSize > MEDIA_VIDEO_MAX_BYTES
  )
    throw new InvalidMediaManifestError()
  return {
    id: path.id,
    src: path.src,
    width,
    height,
    durationMs: source.durationMs,
    byteSize: source.byteSize,
    mimeType: 'video/mp4',
  }
}

export class InvalidMediaManifestError extends Error {
  constructor() {
    super('Invalid managed media manifest')
    this.name = 'InvalidMediaManifestError'
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new InvalidMediaManifestError()
  return value as Record<string, unknown>
}

function dimension(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 12000
  )
    throw new InvalidMediaManifestError()
  return value
}

/** Rebuild trusted DTOs; arbitrary URLs and guessed derivatives never become candidates. */
export function parseManagedMediaAsset(value: unknown): ManagedMediaAsset {
  const source = object(value)
  const main = parseManagedMediaPath(source.src)
  if (
    !main ||
    source.id !== main.id ||
    !Array.isArray(source.variants) ||
    source.variants.length < 1 ||
    source.variants.length > MEDIA_MAX_VARIANTS
  )
    throw new InvalidMediaManifestError()
  const width = dimension(source.width)
  const height = dimension(source.height)
  if (
    main.width !== width ||
    height > MEDIA_PREPARED_MAX_HEIGHT ||
    width * height > MEDIA_PREPARED_MAX_PIXELS
  )
    throw new InvalidMediaManifestError()
  const seen = new Set<number>()
  const variants = source.variants
    .map((value): ManagedMediaVariant => {
      const variant = object(value)
      const path = parseManagedMediaPath(variant.src)
      const candidateWidth = dimension(variant.width)
      const candidateHeight = dimension(variant.height)
      if (
        !path ||
        path.id !== main.id ||
        path.hash !== main.hash ||
        path.width !== candidateWidth ||
        candidateWidth > width ||
        candidateHeight > height ||
        seen.has(candidateWidth) ||
        Math.abs(candidateHeight - (candidateWidth * height) / width) > 1
      )
        throw new InvalidMediaManifestError()
      seen.add(candidateWidth)
      return { src: path.src, width: candidateWidth, height: candidateHeight }
    })
    .sort((a, b) => a.width - b.width)
  if (
    !variants.some(
      (variant) =>
        variant.src === main.src &&
        variant.width === width &&
        variant.height === height,
    )
  )
    throw new InvalidMediaManifestError()
  return { id: main.id, src: main.src, width, height, variants }
}

/** Actual widths, never larger than the prepared source or fictitious variants. */
export function productMediaWidths(masterWidth: number): number[] {
  if (
    !Number.isSafeInteger(masterWidth) ||
    masterWidth < 1 ||
    masterWidth > PRODUCT_MEDIA_PROFILES['product-gallery'].maxWidth
  )
    return []
  return [
    ...new Set([480, 960, masterWidth].filter((width) => width <= masterWidth)),
  ].sort((a, b) => a - b)
}

interface RasterHeader {
  mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/avif'
  width: number
  height: number
  animated: boolean
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}

/** Header inspection bounds decoding cost; server decoding remains mandatory. */
export function inspectRasterHeader(bytes: Uint8Array): RasterHeader | null {
  if (bytes.length < 16) return null
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === 'PNG' &&
    bytes[4] === 13 &&
    bytes[5] === 10 &&
    bytes[6] === 26 &&
    bytes[7] === 10
  ) {
    if (bytes.length < 24 || ascii(bytes, 12, 4) !== 'IHDR') return null
    return {
      mime: 'image/png',
      width: view.getUint32(16),
      height: view.getUint32(20),
      animated: false,
    }
  }
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const kind = ascii(bytes, offset, 4)
      const size = view.getUint32(offset + 4, true)
      const content = offset + 8
      if (kind === 'VP8X' && size >= 10 && content + 10 <= bytes.length) {
        const read24 = (at: number) =>
          bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16)
        return {
          mime: 'image/webp',
          width: read24(content + 4) + 1,
          height: read24(content + 7) + 1,
          animated: Boolean(bytes[content] & 2),
        }
      }
      if (
        kind === 'VP8 ' &&
        content + 10 <= bytes.length &&
        bytes[content + 3] === 0x9d &&
        bytes[content + 4] === 1 &&
        bytes[content + 5] === 0x2a
      )
        return {
          mime: 'image/webp',
          width: view.getUint16(content + 6, true) & 0x3fff,
          height: view.getUint16(content + 8, true) & 0x3fff,
          animated: false,
        }
      if (
        kind === 'VP8L' &&
        content + 5 <= bytes.length &&
        bytes[content] === 0x2f
      ) {
        const bits = view.getUint32(content + 1, true)
        return {
          mime: 'image/webp',
          width: (bits & 0x3fff) + 1,
          height: ((bits >>> 14) & 0x3fff) + 1,
          animated: false,
        }
      }
      if (size > bytes.length || content + size <= offset) return null
      offset = content + size + (size % 2)
    }
    return null
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) return null
      while (offset < bytes.length && bytes[offset] === 0xff) offset++
      const marker = bytes[offset++]
      if (marker === 0xd9 || marker === 0xda) return null
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
      if (offset + 2 > bytes.length) return null
      const length = view.getUint16(offset)
      if (length < 2 || offset + length > bytes.length) return null
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker)
      ) {
        if (length < 8) return null
        return {
          mime: 'image/jpeg',
          width: view.getUint16(offset + 5),
          height: view.getUint16(offset + 3),
          animated: false,
        }
      }
      offset += length
    }
    return null
  }
  if (ascii(bytes, 4, 4) === 'ftyp') {
    const ftypSize = view.getUint32(0)
    if (ftypSize < 16 || ftypSize > bytes.length) return null
    const brands = [ascii(bytes, 8, 4)]
    for (let offset = 16; offset + 4 <= ftypSize; offset += 4)
      brands.push(ascii(bytes, offset, 4))
    if (!brands.includes('avif') && !brands.includes('avis')) return null
    // ispe is nested within meta/iprp/ipco. Inspect only a bounded header buffer;
    // the image is decoded and dimensions checked again before using a canvas.
    for (let offset = ftypSize; offset + 20 <= bytes.length; offset++) {
      if (
        ascii(bytes, offset + 4, 4) === 'ispe' &&
        view.getUint32(offset) >= 20
      )
        return {
          mime: 'image/avif',
          width: view.getUint32(offset + 12),
          height: view.getUint32(offset + 16),
          animated: brands.includes('avis'),
        }
    }
  }
  return null
}

export function validOriginalImageDimensions(
  width: number,
  height: number,
): boolean {
  return (
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= MEDIA_ORIGINAL_MAX_DIMENSION &&
    height <= MEDIA_ORIGINAL_MAX_DIMENSION &&
    width * height <= MEDIA_ORIGINAL_MAX_PIXELS
  )
}
