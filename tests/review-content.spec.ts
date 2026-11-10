import { expect, test } from '@playwright/test'
import { respectfulReviewContent } from '../src/domain/review-content'
import { parseProductReviewsPage } from '../src/services/product-reviews-service'

test('respectful negative feedback and unrelated substrings are accepted', () => {
  for (const text of [
    'No me gustó y no lo recomiendo.',
    'Hubo una disputa por el envío.',
    'Una computadora está junto al perfume.',
    'La fragancia dura poco en mi piel.',
  ])
    expect(respectfulReviewContent(text), text).toBe(true)
})
test('common insult concealment is rejected without substring filtering', () => {
  for (const text of [
    'PÉNDEJO',
    'm13rd4',
    'p.u.t.a',
    'p u t o',
    'puuuutaaa',
    'ＦＵＣＫ',
    'imbécil',
  ])
    expect(respectfulReviewContent(text), text).toBe(false)
})
test('untrusted review summaries cannot invent ratings or valid distributions', () => {
  const empty = {
    items: [],
    page: 1,
    pageSize: 3,
    count: 0,
    total: 0,
    average: null,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  }
  expect(parseProductReviewsPage(empty).count).toBe(0)
  expect(() => parseProductReviewsPage({ ...empty, average: 5 })).toThrow()
  expect(() =>
    parseProductReviewsPage({
      ...empty,
      distribution: { ...empty.distribution, 5: 10 },
    }),
  ).toThrow()
})
