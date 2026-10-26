import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Dialog } from '../../components/ui/Dialog'
import {
  inspectOrderDocuments,
  type OrderDocumentType,
} from '../../domain/order-documents'
import { adminService } from '../../services/admin-service'
import { UserFacingError } from '../../services/admin-messages'
import { useAdminStore } from './useAdminStore'
import { useAdminNotice } from './AdminNoticeProvider'
import './admin-order-pdf.css'

interface AdminOrderPdfExportProps {
  open: boolean
  references: string[]
  onClose: () => void
  onProcessingChange?: (processing: boolean) => void
}

function documentLabel(type: OrderDocumentType, count: number) {
  return type === 'shipping'
    ? count === 1
      ? 'ficha de envío'
      : 'fichas de envío'
    : count === 1
      ? 'resumen de pedido'
      : 'resúmenes de pedidos'
}

export function AdminOrderPdfExport({
  open,
  references,
  onClose,
  onProcessingChange,
}: AdminOrderPdfExportProps) {
  const state = useAdminStore()
  const notice = useAdminNotice()
  const [type, setType] = useState<OrderDocumentType>('shipping')
  const [onlyValid, setOnlyValid] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState('')
  const busyRef = useRef(false)
  const alive = useRef(true)
  const selected = [...new Set(references)]
  const byReference = new Map(
    state.orders.map((order) => [order.reference, order]),
  )
  const orders = selected.flatMap((reference) => {
    const order = byReference.get(reference)
    return order ? [order] : []
  })
  const inspection = inspectOrderDocuments(orders, state.customers, type)
  const issues = [
    ...selected
      .filter((reference) => !byReference.has(reference))
      .map((reference) => ({
        reference,
        message: 'El pedido ya no está disponible.',
      })),
    ...inspection.issues,
  ]
  const canExport = inspection.valid.length > 0 && (!issues.length || onlyValid)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  function close() {
    if (!busyRef.current) onClose()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busyRef.current || !canExport) return
    busyRef.current = true
    setBusy(true)
    onProcessingChange?.(true)
    setError('')
    setProgress({ done: 0, total: inspection.valid.length })
    // Freeze the selected documents only. Exporting never mutates orders.
    const documents = structuredClone(inspection.valid)
    const customers = structuredClone(adminService.getSnapshot().customers)
    try {
      const { generateOrderPdf, orderDocumentFilename } =
        await import('../../services/order-pdf')
      const bytes = await generateOrderPdf(documents, customers, type, {
        onProgress: (done, total) => {
          if (alive.current) setProgress({ done, total })
        },
      })
      if (!alive.current) return
      const copy = new Uint8Array(bytes)
      const url = URL.createObjectURL(
        new Blob([copy.buffer], { type: 'application/pdf' }),
      )
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = orderDocumentFilename(type)
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
      notice.toast(
        `PDF preparado con ${documents.length} ${documentLabel(type, documents.length)}.`,
      )
      onClose()
    } catch (cause) {
      if (alive.current)
        setError(
          cause instanceof UserFacingError
            ? cause.message
            : 'No pudimos generar el PDF. La selección se conserva. Inténtalo de nuevo.',
        )
    } finally {
      busyRef.current = false
      onProcessingChange?.(false)
      if (alive.current) setBusy(false)
    }
  }

  return (
    <Dialog
      id="admin-order-pdf-export"
      open={open}
      onClose={close}
      closeDisabled={busy}
      title="Exportar PDF"
      className="admin-order-pdf-dialog"
    >
      <form className="admin-order-pdf-form" onSubmit={submit} aria-busy={busy}>
        <p className="admin-order-pdf-selected">
          {selected.length}{' '}
          {selected.length === 1
            ? 'pedido seleccionado'
            : 'pedidos seleccionados'}
        </p>
        <fieldset disabled={busy} className="admin-order-pdf-formats">
          <legend>Tipo de documento</legend>
          {(
            [
              {
                value: 'shipping',
                label: 'Fichas de envío',
                detail: 'A4 · 2 fichas de 10 × 15 cm por hoja',
              },
              {
                value: 'summary',
                label: 'Resúmenes de pedidos',
                detail: 'A4 · 2 por hoja; pedidos extensos en página completa',
              },
            ] as const
          ).map((option) => (
            <label
              key={option.value}
              className={type === option.value ? 'is-selected' : ''}
            >
              <input
                type="radio"
                name="documentType"
                value={option.value}
                checked={type === option.value}
                aria-label={option.label}
                aria-describedby={`pdf-format-${option.value}`}
                onChange={() => {
                  setType(option.value)
                  setOnlyValid(false)
                  setError('')
                }}
              />
              <span>
                <strong>{option.label}</strong>
                <small id={`pdf-format-${option.value}`}>{option.detail}</small>
              </span>
            </label>
          ))}
        </fieldset>
        {issues.length ? (
          <div className="admin-order-pdf-issues">
            <p role="status">
              <strong>
                {issues.length}{' '}
                {issues.length === 1
                  ? 'pedido necesita revisión'
                  : 'pedidos necesitan revisión'}
              </strong>
            </p>
            <ul aria-label="Pedidos por revisar">
              {issues.map((issue) => (
                <li key={issue.reference}>
                  <span>
                    <strong>{issue.reference}</strong>
                    {issue.message}
                  </span>
                  {byReference.has(issue.reference) && !busy ? (
                    <Link
                      to={`/admin/pedidos/${encodeURIComponent(issue.reference)}`}
                    >
                      Revisar<span className="sr-only"> {issue.reference}</span>
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
            {inspection.valid.length ? (
              <label className="admin-check">
                <input
                  type="checkbox"
                  checked={onlyValid}
                  disabled={busy}
                  onChange={(event) => setOnlyValid(event.target.checked)}
                />
                Exportar solo los pedidos válidos
              </label>
            ) : (
              <p>
                Completa los datos de los pedidos antes de generar este
                documento.
              </p>
            )}
          </div>
        ) : null}
        <p className="admin-order-pdf-count" role="status">
          {inspection.valid.length}{' '}
          {documentLabel(type, inspection.valid.length)} en un único PDF.
        </p>
        {busy ? (
          <div className="admin-order-pdf-progress" role="status">
            <progress
              value={progress.done}
              max={Math.max(1, progress.total)}
              aria-label="Generación del PDF"
            />
            <span>
              Preparando PDF… {progress.done} de {progress.total}
            </span>
          </div>
        ) : null}
        {error ? (
          <p className="admin-form-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="admin-order-pdf-actions">
          <button
            type="submit"
            className="button button--primary"
            disabled={busy || !canExport}
          >
            {busy ? 'Generando PDF…' : 'Descargar PDF'}
          </button>
          <button
            type="button"
            className="button button--secondary"
            disabled={busy}
            onClick={close}
          >
            Cancelar
          </button>
        </div>
      </form>
    </Dialog>
  )
}
