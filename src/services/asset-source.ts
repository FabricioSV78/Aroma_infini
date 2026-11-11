import {
  isManagedMediaSource,
  parseManagedVideoPath,
  parseManagedSvgPath,
} from '../domain/media'
import { resolveMediaAlias } from './media-alias-registry'

const managedAssetPath = /^\/(?:images|videos|brand)\//

/** Optional Worker origin for Vite development; this is never a credential. */
export function mediaApiBaseUrl(
  value: string | undefined = import.meta.env?.VITE_MEDIA_API_BASE_URL,
  allowLocal = import.meta.env?.DEV === true,
): string | null {
  if (!value?.trim()) return ''
  try {
    const url = new URL(value.trim())
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (
      (url.protocol !== 'https:' &&
        !(allowLocal && local && url.protocol === 'http:')) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      return null
    return url.origin
  } catch {
    return null
  }
}

/** Local URLs today; an optional public media origin can host the same keys later. */
export function assetSource(
  source: string,
  publicMediaBase: string | undefined = import.meta.env?.VITE_MEDIA_BASE_URL,
  mediaApiBase: string | undefined = import.meta.env?.VITE_MEDIA_API_BASE_URL,
): string {
  source = resolveMediaAlias(source) ?? source
  if (
    isManagedMediaSource(source) ||
    parseManagedVideoPath(source) ||
    parseManagedSvgPath(source)
  ) {
    const origin = mediaApiBaseUrl(mediaApiBase)
    return origin ? `${origin}${source}` : source
  }
  if (!publicMediaBase || !managedAssetPath.test(source)) return source
  try {
    const base = new URL(publicMediaBase)
    if (
      base.protocol !== 'https:' ||
      base.username ||
      base.password ||
      base.search ||
      base.hash
    )
      return source
    return `${base.href.replace(/\/$/, '')}${source}`
  } catch {
    return source
  }
}

/** Resolve local candidates without splitting data URLs or changing descriptors. */
export function assetSourceSet(
  sourceSet: string,
  publicMediaBase: string | undefined = import.meta.env?.VITE_MEDIA_BASE_URL,
): string {
  return sourceSet.replace(
    /(^|,\s*)(\/(?:images|videos|brand|media\/public\/dynamic)\/[^,\s]+)/g,
    (_, separator: string, source: string) =>
      `${separator}${assetSource(source, publicMediaBase)}`,
  )
}
