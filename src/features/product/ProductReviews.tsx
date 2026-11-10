import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router'
import { Dialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { useAuth } from '../auth/useAuth'
import { respectfulReviewContent } from '../../domain/review-content'
import {
  readProductReviews,
  readOwnProductReview,
  submitProductReview,
  type ProductReviewsPage,
  type ReviewOrder,
} from '../../services/product-reviews-service'
import { UserFacingError } from '../../services/admin-messages'
import type { ProductReview } from '../../types/review'

interface ProductReviewsProps {
  productId: string
  sizes: number[]
  readOnly?: boolean
  productType?: 'perfume' | 'complemento'
}
const dateFormatter = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
function message(error: unknown) {
  return error instanceof UserFacingError
    ? error.message
    : 'No pudimos cargar las reseñas. Revisa tu conexión y vuelve a intentarlo.'
}

function CustomerReviewForm({
  sizes,
  productId,
  onPublished,
  onCancel,
}: {
  sizes: number[]
  productId: string
  onPublished: (review: ProductReview) => void
  onCancel: () => void
}) {
  const [rating, setRating] = useState(0)
  const [title, setTitle] = useState('')
  const [comment, setComment] = useState('')
  const [sizeMl, setSizeMl] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState('')
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const form = useRef<HTMLFormElement>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    const next: Record<string, string> = {}
    if (rating < 1 || rating > 5)
      next.rating = 'Selecciona de una a cinco estrellas.'
    if (title.trim().length < 3 || title.trim().length > 80)
      next.title = 'Escribe un título de 3 a 80 caracteres.'
    else if (!respectfulReviewContent(title))
      next.title = 'Usa un título sin insultos ni palabras ofensivas.'
    if (comment.trim().length < 10 || comment.trim().length > 1500)
      next.comment = 'Tu opinión debe tener entre 10 y 1500 caracteres.'
    else if (!respectfulReviewContent(comment))
      next.comment =
        'Comparte tu experiencia sin insultos ni palabras ofensivas.'
    setErrors(next)
    setFailure('')
    if (Object.keys(next).length) {
      requestAnimationFrame(() =>
        form.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      )
      return
    }
    busy.current = true
    setSaving(true)
    try {
      const review = await submitProductReview(productId, {
        rating,
        title,
        comment,
        sizeMl: sizeMl ? Number(sizeMl) : null,
      })
      onPublished(review)
    } catch (error) {
      if (error instanceof UserFacingError && error.code === 'PT422')
        setErrors({ comment: error.message })
      else setFailure(message(error))
    } finally {
      busy.current = false
      setSaving(false)
    }
  }
  return (
    <form
      ref={form}
      className="review-form"
      onSubmit={submit}
      noValidate
      aria-busy={saving}
    >
      <p>
        Se mostrará tu nombre y la inicial de tu apellido. Las opiniones
        positivas y negativas son bienvenidas, siempre con respeto.
      </p>
      <fieldset
        className="review-rating-input"
        aria-describedby={
          errors.rating ? 'customer-review-rating-error' : undefined
        }
      >
        <legend>Tu valoración</legend>
        {[1, 2, 3, 4, 5].map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="rating"
              value={value}
              checked={rating === value}
              onChange={() => setRating(value)}
              aria-invalid={Boolean(errors.rating)}
              disabled={saving}
            />
            <span aria-hidden="true" data-filled={rating >= value}>
              ★
            </span>
            <span className="sr-only">
              {value} {value === 1 ? 'estrella' : 'estrellas'}
            </span>
          </label>
        ))}
        {errors.rating && (
          <p role="alert" id="customer-review-rating-error">
            {errors.rating}
          </p>
        )}
      </fieldset>
      {sizes.length > 0 && (
        <label>
          Presentación (opcional)
          <select
            value={sizeMl}
            onChange={(event) => setSizeMl(event.target.value)}
            disabled={saving}
          >
            <option value="">Sin especificar</option>
            {sizes.map((size) => (
              <option key={size} value={size}>
                {size} ml
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Título
        <input
          aria-label="Título"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          minLength={3}
          maxLength={80}
          disabled={saving}
          aria-invalid={Boolean(errors.title)}
          aria-describedby={
            errors.title ? 'customer-review-title-error' : undefined
          }
        />
        {errors.title && (
          <span role="alert" id="customer-review-title-error">
            {errors.title}
          </span>
        )}
      </label>
      <label>
        Tu opinión
        <textarea
          aria-label="Tu opinión"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={4}
          minLength={10}
          maxLength={1500}
          disabled={saving}
          aria-invalid={Boolean(errors.comment)}
          aria-describedby={
            errors.comment ? 'customer-review-comment-error' : undefined
          }
        />
        {errors.comment && (
          <span role="alert" id="customer-review-comment-error">
            {errors.comment}
          </span>
        )}
      </label>
      {failure && <p role="alert">{failure}</p>}
      <div className="review-form-actions">
        <button
          className="button button--primary"
          type="submit"
          disabled={saving}
        >
          {saving ? 'Publicando…' : 'Publicar reseña'}
        </button>
        <button
          className="button"
          type="button"
          onClick={onCancel}
          disabled={saving}
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

export function ProductReviews({
  productId,
  sizes,
  readOnly = false,
}: ProductReviewsProps) {
  const auth = useAuth()
  const location = useLocation()
  const owner =
    auth.status === 'authenticated' && auth.session?.intent === 'account'
      ? auth.session.user.id
      : null
  const [data, setData] = useState<ProductReviewsPage | null>(null)
  const [own, setOwn] = useState<ProductReview | null>(null)
  const [ownOwner, setOwnOwner] = useState<string | null>(null)
  const [ownError, setOwnError] = useState('')
  const [page, setPage] = useState(1)
  const [rating, setRating] = useState(0)
  const [order, setOrder] = useState<ReviewOrder>('recent')
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState('')
  const writeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    let active = true
    readProductReviews(productId, page, rating, order)
      .then((result) => {
        if (active) {
          setData(result)
          setError('')
          setLoading(false)
        }
      })
      .catch((failure: unknown) => {
        if (active) {
          setError(message(failure))
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [productId, page, rating, order, revision])
  useEffect(() => {
    let active = true
    if (!owner || readOnly) return
    readOwnProductReview(productId)
      .then((result) => {
        if (active) {
          setOwn(result)
          setOwnOwner(owner)
          setOwnError('')
        }
      })
      .catch((failure: unknown) => {
        if (active) {
          setOwnError(message(failure))
          setOwnOwner(owner)
        }
      })
    return () => {
      active = false
    }
  }, [productId, owner, readOnly, revision])
  const hasOwn = Boolean(owner && ownOwner === owner && own)
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 3))
  function refresh() {
    setLoading(true)
    setRevision((value) => value + 1)
  }
  function close() {
    setOpen(false)
    writeButton.current?.focus()
  }
  function filter(nextRating: number) {
    setRating(nextRating)
    setPage(1)
    setLoading(true)
  }
  function published(review: ProductReview) {
    setOwn(review)
    setOwnOwner(owner)
    setPage(1)
    setRating(0)
    setOrder('recent')
    setStatus('Tu reseña se publicó. Gracias por compartir tu experiencia.')
    refresh()
    close()
  }
  return (
    <section
      className="product-reviews-preview"
      aria-labelledby="product-reviews-title"
      aria-busy={loading}
    >
      <div className="product-reviews-inner container">
        <header className="product-reviews-heading">
          <div>
            <p className="eyebrow">Opiniones de clientes</p>
            <h2 id="product-reviews-title">Reseñas</h2>
          </div>
          {!readOnly && (
            <button
              ref={writeButton}
              className="button"
              type="button"
              aria-haspopup="dialog"
              disabled={hasOwn}
              onClick={() => setOpen(true)}
            >
              {hasOwn ? 'Ya compartiste tu opinión' : 'Escribir una reseña'}
            </button>
          )}
        </header>
        {data && data.count > 0 && (
          <div className="review-overview">
            <div
              className="product-reviews-score"
              aria-label={`Valoración promedio: ${data.average} de 5, ${data.count} reseñas`}
            >
              <strong>{data.average?.toFixed(1)}</strong>
              <div>
                <span className="review-summary-stars" aria-hidden="true">
                  ☆☆☆☆☆
                  <span
                    style={{ width: `${((data.average ?? 0) / 5) * 100}%` }}
                  >
                    ★★★★★
                  </span>
                </span>
                <p>de 5 · {data.count} reseñas</p>
              </div>
            </div>
            <div
              className="review-distribution"
              aria-label="Distribución de valoraciones"
            >
              {[5, 4, 3, 2, 1].map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={!data.distribution[value]}
                  aria-pressed={rating === value}
                  aria-label={`${value} estrellas: ${data.distribution[value]} reseñas`}
                  onClick={() => filter(rating === value ? 0 : value)}
                >
                  <span>{value} ★</span>
                  <span className="review-bar" aria-hidden="true">
                    <span
                      style={{
                        width: `${(data.distribution[value] / data.count) * 100}%`,
                      }}
                    />
                  </span>
                  <span>{data.distribution[value]}</span>
                </button>
              ))}
            </div>
            <p className="review-overview-note">
              Opiniones de usuarios de Aroma Infini.
            </p>
          </div>
        )}
        <Dialog
          open={open && !readOnly}
          onClose={close}
          id="customer-review-dialog"
          className="review-dialog"
          title={owner ? 'Escribir una reseña' : 'Inicia sesión para opinar'}
        >
          {open &&
            (owner ? (
              <CustomerReviewForm
                key={`${productId}-${owner}`}
                productId={productId}
                sizes={sizes}
                onPublished={published}
                onCancel={close}
              />
            ) : (
              <div className="review-signin">
                <p>Inicia sesión para compartir tu experiencia.</p>
                <Link
                  className="button button--primary"
                  to={`/iniciar-sesion?redirect=${encodeURIComponent(location.pathname)}`}
                >
                  Iniciar sesión
                </Link>
                <button className="button" type="button" onClick={close}>
                  Seguir leyendo
                </button>
              </div>
            ))}
        </Dialog>
        <p className="review-status" role="status" aria-live="polite">
          {status}
        </p>
        {ownError && owner === ownOwner && (
          <p role="status">
            No pudimos comprobar si ya publicaste una opinión. Podrás reintentar
            al enviarla.
          </p>
        )}
        {error ? (
          <div>
            <p role="alert">{error}</p>
            <button className="button" type="button" onClick={refresh}>
              Reintentar
            </button>
          </div>
        ) : loading && !data ? (
          <p role="status">Cargando reseñas…</p>
        ) : data?.count === 0 ? (
          <EmptyState
            title="Aún no hay reseñas publicadas"
            description="Comparte tu experiencia con este producto."
            headingLevel="h3"
          />
        ) : null}
        {data && data.count > 0 && (
          <>
            <div className="review-toolbar">
              <button
                type="button"
                aria-pressed={rating === 0}
                onClick={() => filter(0)}
              >
                {rating
                  ? `Ver todas · filtro: ${rating} estrellas`
                  : `Todas las reseñas (${data.count})`}
              </button>
              <label>
                Ordenar
                <select
                  value={order}
                  onChange={(event) => {
                    setOrder(event.target.value as ReviewOrder)
                    setPage(1)
                    setLoading(true)
                  }}
                >
                  <option value="recent">Más recientes</option>
                  <option value="highest">Mayor valoración</option>
                  <option value="lowest">Menor valoración</option>
                </select>
              </label>
            </div>
            <ol className="product-review-list" id="product-review-list">
              {data.items.map((review) => (
                <li key={review.id}>
                  <div className="product-review-meta">
                    <strong>
                      <span className="review-avatar" aria-hidden="true">
                        {review.author.slice(0, 1)}
                      </span>
                      {review.author}
                    </strong>
                    <time dateTime={review.date}>
                      {dateFormatter.format(
                        new Date(`${review.date}T00:00:00Z`),
                      )}
                    </time>
                    {review.sizeMl > 0 && <span>{review.sizeMl} ml</span>}
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
                    <h3>{review.title}</h3>
                    <p>{review.comment}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="product-reviews-footer">
              <p aria-live="polite">
                Mostrando {data.total ? (page - 1) * 3 + 1 : 0}–
                {(page - 1) * 3 + data.items.length} de {data.total} reseñas
              </p>
              {totalPages > 1 && (
                <nav
                  className="review-pagination"
                  aria-label="Páginas de reseñas"
                >
                  <button
                    className="button"
                    type="button"
                    disabled={page <= 1 || loading}
                    onClick={() => {
                      setPage((value) => value - 1)
                      setLoading(true)
                    }}
                  >
                    Anterior
                  </button>
                  <span>
                    {page} de {totalPages}
                  </span>
                  <button
                    className="button"
                    type="button"
                    disabled={page >= totalPages || loading}
                    onClick={() => {
                      setPage((value) => value + 1)
                      setLoading(true)
                    }}
                  >
                    Siguiente
                  </button>
                </nav>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
