import type { Brand, Product, ProductVariant } from './catalog'

export type FinderStep = 'family' | 'occasion' | 'intensity' | 'budget'
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

/** Empty string is an explicit "no preference", undefined means unanswered. */
export type FinderAnswers = Partial<Record<FinderStep, string>>

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
