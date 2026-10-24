import type { Brand, Product, ProductVariant } from './catalog'

export type FinderStep = 'family' | 'occasion' | 'intensity' | 'budget'
export type FinderPreferenceStep = Exclude<FinderStep, 'budget'>
export interface FinderOption {
  value: string
  label: string
}
export interface FinderOptions {
  families: FinderOption[]
  occasions: FinderOption[]
  intensities: FinderOption[]
  availableCount: number
}

/** Empty arrays mean "no preference"; undefined means the step is unanswered. */
export interface FinderAnswers {
  family?: string[]
  occasion?: string[]
  intensity?: string[]
  /** The budget remains a single amount in cents, or an empty string for no limit. */
  budget?: string
}

export interface FragranceMatch {
  product: Product
  brand: Brand | undefined
  variant: ProductVariant
  reasons: string[]
  differences: string[]
  score: number
  complete: boolean
}

export interface FinderResult {
  kind:
    'matches' | 'partial' | 'budget' | 'empty' | 'unavailable' | 'preferences'
  matches: FragranceMatch[]
}
