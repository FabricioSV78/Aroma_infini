import type { ProductAudience } from './catalog'

export type HomeMediaKey = ProductAudience | 'featured'
export type HomeMedia = Record<HomeMediaKey, string | null>

export interface HomeHeroContent {
  eyebrow: string
  title: string
  description: string
  cta: string
  alt: string
  desktopImage: string | null
  mobileImage: string | null
}

export interface HomeFilmContent {
  eyebrow: string
  title: string
  description: string
  cta: string
  video: string | null
  poster: string | null
}

export interface HomeContent {
  hero: HomeHeroContent[]
  film: HomeFilmContent
}
