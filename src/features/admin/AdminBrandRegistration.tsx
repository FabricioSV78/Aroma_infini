import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  MAX_BRAND_REGISTRATION_LINES,
  countBrandRegistrationLines,
  previewBrandRegistration,
  type BrandRegistrationPreview,
} from '../../domain/brand-registration'
import { adminService, type AdminBrand } from '../../services/admin-service'
import { AdminBadge } from './AdminShared'
import type { useAdminSave } from './useAdminSave'
import './admin-brand-registration.css'

export interface BrandRegistrationSummary {
  created: AdminBrand[]
  preview: BrandRegistrationPreview
}

interface Props {
  text: string
  onTextChange: (text: string) => void
  brands: readonly AdminBrand[]
  revision: number
  persistence: ReturnType<typeof useAdminSave>
  onCancel: () => void
  onSaved: (summary: BrandRegistrationSummary) => void
}

const statusLabels = {
  valid: 'Lista para registrar',
  existing: 'Ya existe',
  duplicate: 'Repetida',
  error: 'Revisar',
} as const

export function AdminBrandRegistration({
  text,
  onTextChange,
  brands,
  revision,
  persistence,
  onCancel,
  onSaved,
}: Props) {
  const [review, setReview] = useState<{
    text: string
    revision: number
    preview: BrandRegistrationPreview
  } | null>(null)
  const [error, setError] = useState('')
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null)
  const detected = countBrandRegistrationLines(text)
  const busy = persistence.saving || persistence.persistenceFailed

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setError('')
    if (!review || review.text !== text) {
      const preview = previewBrandRegistration(text, brands)
      setReview({ text, revision, preview })
      if (!preview.total) setError('Escribe al menos una marca, una por línea.')
      window.requestAnimationFrame(() => reviewHeadingRef.current?.focus())
      return
    }
    if (!review.preview.valid || review.preview.limitExceeded) return
    let summary: BrandRegistrationSummary | undefined
    const result = await persistence.save(
      () => {
        const saved = adminService.saveBrandsBatch(review.text, review.revision)
        if (saved.kind === 'saved') summary = saved
        return saved
      },
      () => {
        if (summary) onSaved(summary)
      },
    )
    if (result?.kind === 'validation') {
      setError(result.message)
      setReview(null)
    }
  }

  return (
    <form
      className="admin-brand-registration"
      onSubmit={submit}
      aria-labelledby="brand-registration-title"
      aria-busy={persistence.saving}
      inert={busy}
    >
      <header>
        <h2 id="brand-registration-title" tabIndex={-1}>
          Registrar marcas
        </h2>
        <p>Pega los nombres. Las URLs se generan automáticamente.</p>
      </header>
      <label htmlFor="brand-registration-names">Marcas (una por línea)</label>
      <textarea
        id="brand-registration-names"
        autoFocus
        value={text}
        onChange={(event) => {
          onTextChange(event.target.value)
          setReview(null)
          setError('')
        }}
        rows={7}
        spellCheck={false}
        aria-describedby="brand-registration-count brand-registration-policy"
        placeholder={'Carolina Herrera\nDior\nVersace\nJean Paul Gaultier'}
      />
      <p
        id="brand-registration-count"
        className="admin-brand-registration-count"
        role="status"
      >
        {detected} {detected === 1 ? 'marca detectada' : 'marcas detectadas'}
      </p>
      <p
        id="brand-registration-policy"
        className="admin-brand-registration-policy"
      >
        Se guardarán solo las marcas válidas. Las existentes, repetidas y con
        errores se omiten.
      </p>
      {review ? (
        <section
          className="admin-brand-registration-review"
          aria-labelledby="brand-registration-review-title"
        >
          <h3
            id="brand-registration-review-title"
            ref={reviewHeadingRef}
            tabIndex={-1}
          >
            Revisión de marcas
          </h3>
          <p className="admin-brand-registration-totals">
            {review.preview.valid} listas · {review.preview.existing} existentes
            · {review.preview.duplicate} repetidas · {review.preview.error} por
            corregir
          </p>
          {review.preview.limitExceeded ? (
            <p className="admin-form-error" role="alert">
              Revisa un máximo de {MAX_BRAND_REGISTRATION_LINES} marcas por
              operación.
            </p>
          ) : null}
          <div
            className="admin-brand-registration-table"
            tabIndex={0}
            aria-label="Resultados de la revisión"
            role="region"
          >
            <table>
              <caption className="sr-only">
                Marcas que se registrarán y filas omitidas
              </caption>
              <thead>
                <tr>
                  <th scope="col">Línea</th>
                  <th scope="col">Marca y URL</th>
                  <th scope="col">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {review.preview.rows.map((row) => (
                  <tr key={row.line}>
                    <td>{row.line}</td>
                    <th scope="row">
                      {row.name}
                      <small>
                        {row.slug ? `/${row.slug}` : 'Sin URL válida'}
                      </small>
                    </th>
                    <td>
                      <AdminBadge
                        tone={
                          row.status === 'valid'
                            ? 'success'
                            : row.status === 'error'
                              ? 'danger'
                              : 'neutral'
                        }
                      >
                        {statusLabels[row.status]}
                      </AdminBadge>
                      {row.message ? <small>{row.message}</small> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {error ? (
        <p className="admin-form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="admin-brand-registration-actions">
        <button
          className="button button--primary"
          type="submit"
          disabled={
            busy ||
            !detected ||
            Boolean(
              review && (!review.preview.valid || review.preview.limitExceeded),
            )
          }
          aria-busy={persistence.saving}
        >
          {persistence.saving
            ? 'Guardando…'
            : review
              ? 'Guardar marcas'
              : 'Revisar marcas'}
        </button>
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

export function AdminBrandRegistrationResult({
  summary,
}: {
  summary: BrandRegistrationSummary
}) {
  const resultRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => resultRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [])
  const skipped = summary.preview.total - summary.created.length
  return (
    <section
      id="brand-registration-result"
      ref={resultRef}
      tabIndex={-1}
      className="admin-brand-registration-result"
      aria-label="Resultado del registro de marcas"
    >
      <p role="status">
        <strong>
          {summary.created.length}{' '}
          {summary.created.length === 1 ? 'marca creada' : 'marcas creadas'}.
        </strong>{' '}
        {skipped} sin registrar.
      </p>
      <details>
        <summary>Ver detalle del registro</summary>
        <ul>
          {summary.preview.rows.map((row) => (
            <li key={row.line}>
              <strong>{row.name}</strong>
              <span>
                {row.status === 'valid'
                  ? `Creada · /${row.slug}`
                  : `${statusLabels[row.status]} · ${row.message}`}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}
