import type {
  FinderAnswers,
  FinderOptions,
  FinderResult,
} from '../types/fragrance-finder'
import { getFinderOptions, recommendFragrances } from './fragrance-matching'
import {
  localStorefrontRepository,
  type StorefrontRepository,
} from './storefront-repository'

export interface FragranceFinderService {
  getOptions(): Promise<FinderOptions>
  recommend(answers: FinderAnswers): Promise<FinderResult>
}

/** Replace only the repository when Supabase is introduced. */
export function createFragranceFinderService(
  repository: StorefrontRepository,
): FragranceFinderService {
  return {
    async getOptions() {
      return getFinderOptions(await repository.readSnapshot())
    },
    async recommend(answers) {
      // Read again at submission so edits, unpublished products and changed stock apply.
      return recommendFragrances(await repository.readSnapshot(), answers)
    },
  }
}

export const fragranceFinderService = createFragranceFinderService(
  localStorefrontRepository,
)
