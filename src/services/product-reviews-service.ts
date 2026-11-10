import { requireSupabaseClient } from './supabase-client'
import { authService } from './auth-service'
import { UserFacingError } from './admin-messages'
import type { ProductReview } from '../types/review'

export interface ProductReviewsPage {
  items: ProductReview[]
  total: number
  page: number
  pageSize: number
  count: number
  average: number | null
  distribution: Record<string, number>
}
export type ReviewOrder = 'recent' | 'highest' | 'lowest'
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('review-response')
  return value as Record<string, unknown>
}
function integer(value: unknown, minimum = 0): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum
  )
    throw new Error('review-response')
  return value
}
function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || value.length > maximum)
    throw new Error('review-response')
  return value
}
export function parseProductReview(value: unknown): ProductReview {
  const item = record(value)
  const rating = integer(item.rating, 1)
  if (rating > 5) throw new Error('review-response')
  const id = text(item.id, 36),
    date = text(item.date, 10)
  if (
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date))
  )
    throw new Error('review-response')
  return {
    id,
    date,
    author: text(item.author, 60),
    title: text(item.title, 80),
    comment: text(item.comment, 1500),
    rating: rating as ProductReview['rating'],
    sizeMl: integer(item.sizeMl),
  }
}
export function parseProductReviewsPage(value: unknown): ProductReviewsPage {
  const page = record(value),
    distribution = record(page.distribution)
  if (
    !Array.isArray(page.items) ||
    page.items.length > 3 ||
    page.pageSize !== 3 ||
    (page.average !== null &&
      (typeof page.average !== 'number' ||
        page.average < 1 ||
        page.average > 5))
  )
    throw new Error('review-response')
  const counts = Object.fromEntries(
    [1, 2, 3, 4, 5].map((rating) => [rating, integer(distribution[rating])]),
  )
  const count = integer(page.count),
    total = integer(page.total)
  if (
    Object.values(counts).reduce((sum, value) => sum + value, 0) !== count ||
    total > count ||
    (count === 0) !== (page.average === null)
  )
    throw new Error('review-response')
  return {
    items: page.items.map(parseProductReview),
    total,
    count,
    page: integer(page.page, 1),
    pageSize: 3,
    average: page.average as number | null,
    distribution: counts,
  }
}
export async function readProductReviews(
  productId: string,
  page = 1,
  rating = 0,
  order: ReviewOrder = 'recent',
) {
  const response = await requireSupabaseClient()
    .rpc('product_reviews', {
      p_product_id: productId,
      p_page: page,
      p_rating: rating || undefined,
      p_order: order,
    })
    .abortSignal(AbortSignal.timeout(15000))
  if (response.error)
    throw new UserFacingError(
      'reviews-read',
      'No pudimos cargar las reseñas. Vuelve a intentarlo.',
    )
  return parseProductReviewsPage(response.data)
}
function accountId() {
  const state = authService.getSnapshot()
  return state.status === 'authenticated' && state.session?.intent === 'account'
    ? state.session.user.id
    : null
}
async function verifiedOwner() {
  const id = accountId()
  if (!id)
    throw new UserFacingError(
      'reviews-session',
      'Inicia sesión para compartir tu opinión.',
    )
  const client = requireSupabaseClient()
  const { data, error } = await client.auth.getSession()
  const token = data.session?.access_token
  if (error || !token || data.session?.user.id !== id)
    throw new UserFacingError(
      'reviews-session',
      'Tu sesión terminó. Inicia sesión de nuevo.',
    )
  const verified = await client.auth.getUser(token)
  if (verified.error || verified.data.user?.id !== id || accountId() !== id)
    throw new UserFacingError(
      'reviews-session',
      'Tu sesión cambió. Inicia sesión de nuevo.',
    )
  return { id, token }
}
export async function readOwnProductReview(productId: string) {
  const owner = await verifiedOwner()
  const response = await requireSupabaseClient()
    .rpc('customer_product_review', { p_product_id: productId })
    .setHeader('Authorization', `Bearer ${owner.token}`)
    .abortSignal(AbortSignal.timeout(15000))
  if (accountId() !== owner.id)
    throw new UserFacingError(
      'reviews-session',
      'Tu sesión cambió. Vuelve a abrir las reseñas.',
    )
  if (response.error)
    throw new UserFacingError(
      'reviews-owner',
      'No pudimos consultar tu reseña. Vuelve a intentarlo.',
    )
  return response.data === null ? null : parseProductReview(response.data)
}
export async function submitProductReview(
  productId: string,
  input: {
    rating: number
    title: string
    comment: string
    sizeMl: number | null
  },
) {
  const owner = await verifiedOwner()
  const response = await requireSupabaseClient()
    .rpc('submit_product_review', {
      p_product_id: productId,
      p_rating: input.rating,
      p_title: input.title.trim(),
      p_comment: input.comment.trim(),
      p_size_ml: input.sizeMl ?? undefined,
    })
    .setHeader('Authorization', `Bearer ${owner.token}`)
    .abortSignal(AbortSignal.timeout(20000))
  if (accountId() !== owner.id)
    throw new UserFacingError(
      'reviews-session',
      'Tu sesión cambió. Vuelve a abrir las reseñas.',
    )
  if (response.error) {
    const code = response.error.code
    throw new UserFacingError(
      code,
      code === 'PT422'
        ? 'Comparte tu experiencia sin insultos ni palabras ofensivas.'
        : code === 'PT409'
          ? 'Ya publicaste una reseña para este producto.'
          : code === 'PT429'
            ? 'Espera un momento antes de publicar otra opinión.'
            : code === '22023'
              ? 'Revisa los campos y la presentación seleccionada.'
              : 'No pudimos publicar tu reseña. Conservamos tu opinión para que puedas reintentar.',
    )
  }
  return parseProductReview(response.data)
}
