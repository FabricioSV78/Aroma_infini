import type { ManagedMediaAsset } from './media'
export function managedImageCandidates(
  asset: ManagedMediaAsset,
  widths: readonly number[],
) {
  const selected = new Map<number, ManagedMediaAsset['variants'][number]>()
  for (const width of widths) {
    const candidate =
      asset.variants.find((v) => v.width >= width) ?? asset.variants.at(-1)
    if (candidate) selected.set(candidate.width, candidate)
  }
  const master = asset.variants.at(-1)
  if (master && widths.length) selected.set(master.width, master)
  return [...selected.values()].sort((a, b) => a.width - b.width)
}
