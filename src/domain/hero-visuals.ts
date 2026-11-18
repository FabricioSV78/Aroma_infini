import type { HomeHeroContent } from '../types/home'
import { getHeroFallback } from './hero-content'
import { DESKTOP_VIDEO_QUERY, MOBILE_VIDEO_IMAGE_QUERY } from './media-playback'

// Shared by <picture> and the initial HTML hints. Preserve the current art direction.
export const HERO_MOBILE_QUERY =
  '(max-width: 599px), (max-width: 1023px) and (min-height: 501px)'
export const HERO_DESKTOP_QUERY =
  '(width > 599px) and (width > 1023px), (width > 599px) and (height < 501px)'
export const HERO_MOBILE_WIDTHS = [480, 780, 1024] as const
export const HERO_DESKTOP_WIDTHS = [960, 1536, 2048] as const
export function heroVisualQueries(slide: Pick<HomeHeroContent, 'mediaType'>) {
  return slide.mediaType === 'video'
    ? { mobile: MOBILE_VIDEO_IMAGE_QUERY, desktop: DESKTOP_VIDEO_QUERY }
    : { mobile: HERO_MOBILE_QUERY, desktop: HERO_DESKTOP_QUERY }
}
export function heroVisualSources(
  slide: Pick<
    HomeHeroContent,
    | 'id'
    | 'mediaType'
    | 'poster'
    | 'mobileVideo'
    | 'mobilePoster'
    | 'mobileImage'
    | 'desktopImage'
    | 'fallbackIndex'
  >,
) {
  const video = slide.mediaType === 'video'
  return {
    desktop: video ? slide.poster : slide.desktopImage,
    mobile: video
      ? (slide.mobileImage ?? slide.mobilePoster ?? slide.poster)
      : (slide.mobileImage ?? slide.desktopImage),
    fallbackImage:
      slide.fallbackIndex === null
        ? slide.id
        : getHeroFallback(slide.fallbackIndex).image,
  }
}
