import type { Product, ProductAudience, ProductDetail } from './catalog'

export type ChoosingGuideExample = Pick<Product, 'name' | 'slug' | 'family'> &
  Pick<ProductDetail, 'intensity' | 'occasion'>

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
