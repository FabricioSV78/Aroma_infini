import { assetSource } from './asset-source'

type HeroImageOrientation = 'desktop' | 'mobile'

export function heroImageSource(
  image: string,
  orientation: HeroImageOrientation,
  width: number,
) {
  return assetSource(`/images/${image}-${orientation}-${width}.webp`)
}

export function heroImageSourceSet(
  image: string,
  orientation: HeroImageOrientation,
  widths: readonly number[],
) {
  return widths
    .map((width) => `${heroImageSource(image, orientation, width)} ${width}w`)
    .join(', ')
}
