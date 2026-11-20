import type {
  FinderAnswers,
  FinderOptions,
  FinderResult,
} from '../types/fragrance-finder'
import { getFinderOptions, recommendFragrances } from './fragrance-matching'
import { isRemoteCatalog } from './catalog-source'
import { readRemoteHomeCatalog } from './public-home-catalog'
import {
  storefrontRepository,
  type StorefrontRepository,
} from './storefront-repository'

export interface FragranceFinderService {
  getOptions(): Promise<FinderOptions>
  recommend(answers: FinderAnswers): Promise<FinderResult>
}

/** Replace only the repository when Supabase is introduced. */
export function createFragranceFinderService(
  repository: StorefrontRepository,
  readOptions?: () => Promise<FinderOptions>,
  recommend?: (answers: FinderAnswers) => Promise<FinderResult>,
): FragranceFinderService {
  return {
    async getOptions() {
      // The Home projection carries the same eligible profiles, option order
      // and actual available count. Opening a questionnaire does not need the
      // photographs, variants and descriptions of the entire public catalog.
      if (readOptions) return readOptions()
      return getFinderOptions(await repository.readSnapshot())
    },
    async recommend(answers) {
      if (recommend) return recommend(answers)
      // Read again at submission so edits, unpublished products and changed stock apply.
      return recommendFragrances(await repository.readSnapshot(), answers)
    },
  }
}

export const fragranceFinderService =
  createFragranceFinderService(
    storefrontRepository,
    isRemoteCatalog
      ? async () => {
          // Explicit questionnaire opening is the right time to prepare its
          // small code module. Do not fetch candidates, prices or stock until
          // submission, and do not delay the questions on this optional load.
          void import('./remote-fragrance-finder').catch(() => undefined)
          return (await readRemoteHomeCatalog()).finderOptions
        }
      : undefined,
    isRemoteCatalog
      ? async (answers) => {
          const { readRemoteFinderRecommendations } = await import('./remote-fragrance-finder')
          return readRemoteFinderRecommendations(answers)
        }
      : undefined,
  )
