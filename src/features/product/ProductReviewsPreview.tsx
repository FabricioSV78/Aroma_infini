import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { Dialog } from '../../components/ui/Dialog'
import { useAccount } from '../account/account-context'
import {
  getProductReviews,
  type ProductReview,
} from '../../mocks/product-reviews'
import {
  readLocalReviews,
  saveLocalReview,
} from '../../services/review-service'
import { ReviewForm } from './ReviewForm'

const reviewsPerPage = 3
const dateFormatter = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

export function ProductReviewsPreview({
  productId,
  sizes,
}: {
  productId: string
  sizes: number[]
}) {
  const [localReviews, setLocalReviews] = useState(() =>
    readLocalReviews(productId),
  )
  const reviews = [...localReviews, ...getProductReviews(productId)]
  const { active } = useAccount()
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState(0)
  const [sort, setSort] = useState('recent')
  const [formOpen, setFormOpen] = useState(false)
  const [message, setMessage] = useState('')
  const writeButton = useRef<HTMLButtonElement>(null)

  const matchingReviews = reviews
    .filter((review) => !filter || review.rating === filter)
    .sort((a, b) =>
      sort === 'highest'
        ? b.rating - a.rating
        : sort === 'lowest'
          ? a.rating - b.rating
          : b.date.localeCompare(a.date),
    )
  const totalPages = Math.max(
    1,
    Math.ceil(matchingReviews.length / reviewsPerPage),
  )
  const offset = (page - 1) * reviewsPerPage
  const visibleReviews = matchingReviews.slice(offset, offset + reviewsPerPage)
  const averageRating = reviews.length
    ? (
        reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      ).toFixed(1)
    : '—'

  function closeForm() {
    setFormOpen(false)
    writeButton.current?.focus()
  }

  function saveReview(review: ProductReview) {
    if (!active) return false
    try {
      saveLocalReview(productId, review)
    } catch {
      return false
    }
    setLocalReviews((current) => [review, ...current])
    setFilter(0)
    setSort('recent')
    setPage(1)
    setMessage('Tu reseña se guardó en este navegador.')
    closeForm()
    return true
  }

  function changePage(nextPage: number) {
    const targetPage = Math.max(1, Math.min(nextPage, totalPages))
    const nextReview = matchingReviews[(targetPage - 1) * reviewsPerPage]
    setPage(targetPage)
    if (nextReview) {
      requestAnimationFrame(() => {
        document.getElementById(`review-${nextReview.id}`)?.focus()
      })
    }
  }

  return (
    <section
      className="product-reviews-preview"
      aria-labelledby="product-reviews-title"
      data-scroll-reveal="copy"
    >
      <div className="product-reviews-inner container">
        <header className="product-reviews-heading">
          <div>
            <p className="eyebrow">Opiniones de clientes</p>
            <h2 id="product-reviews-title">Reseñas.</h2>
          </div>
          <button
            ref={writeButton}
            type="button"
            className="button"
            aria-haspopup="dialog"
            onClick={() => setFormOpen(true)}
          >
            Escribir una reseña
          </button>
        </header>
        <div className="review-overview">
          <div
            className="product-reviews-score"
            aria-label={`Valoración promedio: ${averageRating} de 5, ${reviews.length} reseñas`}
          >
            <strong>{averageRating}</strong>
            <div>
              <span className="review-summary-stars" aria-hidden="true">
                ☆☆☆☆☆
                <span
                  style={{
                    width: `${reviews.length ? (Number(averageRating) / 5) * 100 : 0}%`,
                  }}
                >
                  ★★★★★
                </span>
              </span>
              <p>de 5 · {reviews.length} reseñas</p>
            </div>
          </div>
          <div
            className="review-distribution"
            aria-label="Distribución de valoraciones"
          >
            {[5, 4, 3, 2, 1].map((rating) => {
              const count = reviews.filter(
                (review) => review.rating === rating,
              ).length
              return (
                <button
                  type="button"
                  key={rating}
                  disabled={!count}
                  aria-pressed={filter === rating}
                  aria-label={`${rating} estrellas: ${count} reseñas`}
                  onClick={() => {
                    setFilter(filter === rating ? 0 : rating)
                    setPage(1)
                  }}
                >
                  <span>
                    {rating} <span aria-hidden="true">★</span>
                  </span>
                  <span className="review-bar" aria-hidden="true">
                    <span
                      style={{
                        width: `${reviews.length ? (count / reviews.length) * 100 : 0}%`,
                      }}
                    />
                  </span>
                  <span>{count}</span>
                </button>
              )
            })}
          </div>
          <p className="review-overview-note">
            Cada piel cuenta una historia.
            <br />
            Descubre cómo se siente este perfume en otras personas.
          </p>
        </div>
        <Dialog
          open={formOpen}
          onClose={closeForm}
          id="review-dialog"
          className="review-dialog"
          title={active ? 'Escribir una reseña' : 'Inicia sesión para opinar'}
        >
          {formOpen &&
            (active ? (
              <ReviewForm
                sizes={sizes}
                onSave={saveReview}
                onCancel={closeForm}
              />
            ) : (
              <div className="review-signin">
                <p>
                  Para compartir tu experiencia con este perfume, necesitas
                  tener tu cuenta activa.
                </p>
                <Link className="button button--primary" to="/cuenta">
                  Iniciar sesión
                </Link>
                <button className="button" type="button" onClick={closeForm}>
                  Seguir leyendo
                </button>
              </div>
            ))}
        </Dialog>
        <p className="review-status" aria-live="polite" aria-atomic="true">
          {message}
        </p>
        <div className="review-toolbar">
          <button
            type="button"
            aria-pressed={!filter}
            onClick={() => {
              setFilter(0)
              setPage(1)
            }}
          >
            {filter
              ? `Ver todas · filtro: ${filter} estrellas`
              : `Todas las reseñas (${reviews.length})`}
          </button>
          <label>
            Ordenar
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value)
                setPage(1)
              }}
            >
              <option value="recent">Más recientes</option>
              <option value="highest">Mayor valoración</option>
              <option value="lowest">Menor valoración</option>
            </select>
          </label>
        </div>
        {!matchingReviews.length && (
          <p className="review-empty">
            Todavía no hay opiniones. Comparte tu experiencia con este perfume.
          </p>
        )}
        <ol
          key={`${page}-${filter}-${sort}`}
          className="product-review-list"
          id="product-review-list"
        >
          {visibleReviews.map((review) => (
            <li key={review.id}>
              <div className="product-review-meta">
                <strong>
                  <span className="review-avatar" aria-hidden="true">
                    {review.author.slice(0, 1)}
                  </span>
                  {review.author}
                </strong>
                <time dateTime={review.date}>
                  {dateFormatter.format(new Date(`${review.date}T00:00:00Z`))}
                </time>
                <span>{review.sizeMl} ml</span>
              </div>
              <div className="product-review-content">
                <span
                  className="product-review-stars"
                  role="img"
                  aria-label={`${review.rating} de 5 estrellas`}
                >
                  <span aria-hidden="true">
                    {'★'.repeat(review.rating)}
                    {'☆'.repeat(5 - review.rating)}
                  </span>
                </span>
                <h3 id={`review-${review.id}`} tabIndex={-1}>
                  {review.title}
                </h3>
                <p>{review.comment}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="product-reviews-footer">
          <p aria-live="polite">
            Mostrando {matchingReviews.length ? offset + 1 : 0}–
            {offset + visibleReviews.length} de {matchingReviews.length} reseñas
          </p>
          {totalPages > 1 && (
            <nav className="review-pagination" aria-label="Páginas de reseñas">
              <button
                type="button"
                disabled={page === 1}
                onClick={() => changePage(page - 1)}
                aria-controls="product-review-list"
              >
                Anterior
              </button>
              <label>
                <span className="sr-only">Página de reseñas</span>
                <select
                  value={page}
                  onChange={(event) => changePage(Number(event.target.value))}
                >
                  {Array.from({ length: totalPages }, (_, index) => (
                    <option key={index + 1} value={index + 1}>
                      {index + 1} de {totalPages}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={page === totalPages}
                onClick={() => changePage(page + 1)}
                aria-controls="product-review-list"
              >
                Siguiente
              </button>
            </nav>
          )}
        </div>
      </div>
    </section>
  )
}
