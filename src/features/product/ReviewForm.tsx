import { useRef, useState, type FormEvent } from 'react'
import type { ProductReview } from '../../mocks/product-reviews'

interface ReviewFormProps {
  sizes: number[]
  onSave: (review: ProductReview) => boolean
  onCancel: () => void
}

export function ReviewForm({ sizes, onSave, onCancel }: ReviewFormProps) {
  const [rating, setRating] = useState(0)
  const [error, setError] = useState('')
  const nameInput = useRef<HTMLInputElement>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const author = String(data.get('author') ?? '').trim()
    const title = String(data.get('title') ?? '').trim()
    const comment = String(data.get('comment') ?? '').trim()
    if (author.length < 2 || title.length < 3 || comment.length < 10) {
      setError(
        'Escribe tu nombre, un título y una opinión de al menos 10 caracteres.',
      )
      nameInput.current?.focus()
      return
    }
    if (rating < 1 || rating > 5) return
    if (
      !onSave({
        id: crypto.randomUUID(),
        author,
        title,
        comment,
        rating: rating as ProductReview['rating'],
        sizeMl: Number(data.get('size')),
        date: new Date().toISOString().slice(0, 10),
      })
    )
      setError(
        'No se pudo guardar en este navegador. Revisa el almacenamiento e inténtalo de nuevo.',
      )
  }

  return (
    <form
      className="review-form"
      id="review-form"
      onSubmit={submit}
      aria-labelledby="review-form-title"
    >
      <h3 id="review-form-title">Tu experiencia con este perfume</h3>
      <p id="review-local-note">
        Tu opinión se guarda en este navegador; no se publica para otros
        clientes.
      </p>
      <fieldset className="review-rating-input">
        <legend>Tu valoración</legend>
        {[1, 2, 3, 4, 5].map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="rating"
              value={value}
              required
              checked={rating === value}
              onChange={() => setRating(value)}
            />
            <span aria-hidden="true" data-filled={rating >= value}>
              ★
            </span>
            <span className="sr-only">
              {value} {value === 1 ? 'estrella' : 'estrellas'}
            </span>
          </label>
        ))}
      </fieldset>
      <div className="review-form-row">
        <label>
          Nombre visible
          <input
            ref={nameInput}
            name="author"
            required
            minLength={2}
            maxLength={40}
            autoComplete="given-name"
          />
        </label>
        <label>
          Presentación
          <select name="size" required>
            {sizes.map((size) => (
              <option key={size} value={size}>
                {size} ml
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Título
        <input name="title" required minLength={3} maxLength={80} />
      </label>
      <label>
        Tu opinión
        <textarea
          name="comment"
          rows={4}
          required
          minLength={10}
          maxLength={1500}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="review-form-actions">
        <button
          className="button button--primary"
          type="submit"
          aria-describedby="review-local-note"
        >
          Guardar reseña
        </button>
        <button className="button" type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
