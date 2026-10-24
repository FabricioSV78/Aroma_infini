import type { ProductAudience } from './catalog'
import type { FinderResult, FinderStep } from './fragrance-finder'

export type HomeMediaKey = ProductAudience | 'complementos'
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

export interface HomeAnnouncementContent {
  deliveryText: string
  freeShippingLabel: string
}

export interface HomeFinderContent {
  eyebrow: string
  title: string
  description: string
  cta: string
  desktopImage: string | null
  mobileImage: string | null
  entryLabel: string
  entryQuestion: string
  modalTitle: string
  steps: Record<
    FinderStep,
    { label: string; question: string; description: string }
  >
  /** Display text only. Keys are stable catalog values used for matching. */
  optionLabels: Record<
    'family' | 'occasion' | 'intensity',
    Record<string, string>
  >
  /** null follows all currently available catalog values; an array curates visible values. */
  enabledOptions: Record<'family' | 'occasion' | 'intensity', string[] | null>
  familyVisuals: Record<string, { description: string; image: string | null }>
  noPreferenceLabel: string
  /** One to six ascending budget thresholds in soles; matching converts them to cents. */
  budgets: number[]
  budgetNoLimitLabel: string
  resultCopy: Record<
    FinderResult['kind'],
    { title: string; description: string }
  >
  singleResultTitle: string
}

export interface HomeContent {
  /** Stable brand ID for the featured shortcut in the Marcas menu; null hides it. */
  featuredBrandId: string | null
  announcement: HomeAnnouncementContent
  hero: HomeHeroContent[]
  film: HomeFilmContent
  finder: HomeFinderContent
}
