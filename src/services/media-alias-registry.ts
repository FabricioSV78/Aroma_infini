import inventory from '../content/media-default-inventory.json' with { type: 'json' }
import {
  parseManagedMediaAsset,
  parseManagedSvgAsset,
  parseManagedVideoAsset,
  type ManagedMediaAsset,
  type ManagedSvgAsset,
  type ManagedVideoAsset,
} from '../domain/media'

export type MediaAliasAsset =
  ManagedMediaAsset | ManagedSvgAsset | ManagedVideoAsset
export interface MediaAliasItem {
  path: string
  asset: MediaAliasAsset
}
export interface MediaAliasDocument {
  items: MediaAliasItem[]
}

const originals = new Map(inventory.map((entry) => [entry.path, entry]))
let snapshot: MediaAliasDocument = { items: [] }
let generation = 0
let aliases = new Map<string, string>()
const listeners = new Set<() => void>()

/** Closed inventory and exact dimensions preserve the original art direction,
 * including every existing srcset descriptor. Arbitrary URLs are never aliases. */
export function parseMediaAliasDocument(value: unknown): MediaAliasDocument {
  if (
    !value ||
    typeof value !== 'object' ||
    !('items' in value) ||
    !Array.isArray(value.items) ||
    value.items.length > inventory.length
  )
    throw new Error('Invalid public media aliases')
  const seen = new Set<string>()
  const items = value.items.map((candidate): MediaAliasItem => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
      throw new Error('Invalid public media alias')
    const item = candidate as Record<string, unknown>
    const original =
      typeof item.path === 'string' ? originals.get(item.path) : undefined
    if (!original || seen.has(original.path))
      throw new Error('Invalid public media alias')
    seen.add(original.path)
    const asset =
      original.kind === 'svg'
        ? parseManagedSvgAsset(item.asset)
        : original.kind === 'video'
          ? parseManagedVideoAsset(item.asset)
          : parseManagedMediaAsset(item.asset)
    if (asset.width !== original.width || asset.height !== original.height)
      throw new Error('Imported media dimensions changed')
    return { path: original.path, asset }
  })
  return { items }
}

export function resolveMediaAlias(source: string): string | undefined {
  return aliases.get(source)
}

export function getMediaAliasSnapshot(): MediaAliasDocument {
  return snapshot
}
export function mediaAliasGeneration(): number {
  return generation
}
export function subscribeMediaAliases(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function rememberMediaAliases(value: unknown): MediaAliasDocument {
  const document = parseMediaAliasDocument(value)
  const next = new Map(
    document.items.map((item) => [item.path, item.asset.src]),
  )
  snapshot = document
  aliases = next
  generation++
  listeners.forEach((listener) => listener())
  return snapshot
}

/** An importer can publish each association only after its SQL commit, without
 * replacing other aliases while a resumable import is still in progress. */
export function rememberMediaAlias(
  path: string,
  asset: unknown,
): MediaAliasDocument {
  return rememberMediaAliases({
    items: [
      ...snapshot.items.filter((item) => item.path !== path),
      { path, asset },
    ],
  })
}
