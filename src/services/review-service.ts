import type { ProductReview } from '../mocks/product-reviews'

const key = (productId: string) => `aroma-infini:reviews:${productId}`

export function readLocalReviews(productId: string): ProductReview[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(key(productId)) ?? '[]',
    )
    if (!Array.isArray(value)) return []
    return value.filter(
      (review): review is ProductReview =>
        review !== null &&
        typeof review === 'object' &&
        typeof review.id === 'string' &&
        typeof review.author === 'string' &&
        typeof review.title === 'string' &&
        typeof review.comment === 'string' &&
        typeof review.date === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(review.date) &&
        Number.isFinite(Date.parse(review.date)) &&
        Number.isInteger(review.rating) &&
        review.rating >= 1 &&
        review.rating <= 5 &&
        Number.isFinite(review.sizeMl) &&
        review.sizeMl > 0,
    )
  } catch {
    return []
  }
}

export function saveLocalReview(productId: string, review: ProductReview) {
  // This frontend stores personal reviews locally; replace this boundary with an API to publish them.
  localStorage.setItem(
    key(productId),
    JSON.stringify([review, ...readLocalReviews(productId)]),
  )
}
