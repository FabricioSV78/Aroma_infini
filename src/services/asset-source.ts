const managedAssetPath = /^\/(?:images|videos|brand)\//

/** Local URLs today; an optional public media origin can host the same keys later. */
export function assetSource(
  source: string,
  publicMediaBase: string | undefined = import.meta.env?.VITE_MEDIA_BASE_URL,
): string {
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
    /(^|,\s*)(\/(?:images|videos|brand)\/[^,\s]+)/g,
    (_, separator: string, source: string) =>
      `${separator}${assetSource(source, publicMediaBase)}`,
  )
}
