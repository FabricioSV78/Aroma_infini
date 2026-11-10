import {
  parseManagedMediaAsset,
  parseManagedMediaPath,
  type ManagedMediaAsset,
} from '../domain/media'

// Public metadata only. No files, credentials, draft content or signed URLs.
const assets = new Map<string, ManagedMediaAsset>()
const byId = new Map<string, ManagedMediaAsset>()
const maximumAssets = 10000

export function registerManagedMedia(value: unknown): ManagedMediaAsset {
  const asset = parseManagedMediaAsset(value)
  const existing = byId.get(asset.id)
  if (existing && JSON.stringify(existing) !== JSON.stringify(asset))
    throw new Error('An immutable media asset cannot change its manifest')
  if (!existing && byId.size >= maximumAssets) {
    const oldest = byId.values().next().value
    if (oldest) {
      byId.delete(oldest.id)
      oldest.variants.forEach((variant) => assets.delete(variant.src))
    }
  }
  byId.set(asset.id, asset)
  asset.variants.forEach((variant) => assets.set(variant.src, asset))
  return asset
}

export function rememberManagedAssets(value: unknown): void {
  if (!Array.isArray(value) || value.length > maximumAssets)
    throw new Error('Invalid managed media asset list')
  // Validate the complete DTO before publishing any of its candidates.
  const parsed = value.map(parseManagedMediaAsset)
  parsed.forEach(registerManagedMedia)
}

export function getManagedMedia(source: string): ManagedMediaAsset | undefined {
  return parseManagedMediaPath(source) ? assets.get(source) : undefined
}
