import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useBlocker } from 'react-router'
import { Dialog } from '../../components/ui/Dialog'
import { InstitutionalBreadcrumb } from './InstitutionalBreadcrumb'
import {
  emptyComplaint,
  validateComplaint,
  type ComplaintInput,
  type ComplaintReceipt,
} from '../../domain/complaints'
import {
  createComplaintOperation,
  ComplaintSubmissionError,
  submitComplaint,
  type ComplaintOperation,
} from '../../services/complaints-service'
import { downloadComplaintPdf } from '../../services/complaint-pdf'
import { useSiteSettings } from '../../services/site-settings-service'
import '../../styles/complaints.css'

export function ComplaintsPage() {
  const settings = useSiteSettings()
  const [draft, setDraft] = useState(emptyComplaint)
  const [amount, setAmount] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [generalError, setGeneralError] = useState('')
  const [busy, setBusy] = useState(false)
  const [frozen, setFrozen] = useState(false)
  const [receipt, setReceipt] = useState<ComplaintReceipt | null>(null)
  const [website, setWebsite] = useState('')
  const operation = useRef<ComplaintOperation | null>(null)
  const saving = useRef(false)
  const form = useRef<HTMLFormElement>(null)
  const dirty =
    !receipt && JSON.stringify(draft) !== JSON.stringify(emptyComplaint())
  const blocker = useBlocker(dirty && !busy)
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  function consumer<K extends keyof ComplaintInput['consumer']>(
    key: K,
    value: ComplaintInput['consumer'][K],
  ) {
    setDraft((current) => ({
      ...current,
      consumer: { ...current.consumer, [key]: value },
    }))
  }
  function purchase<K extends keyof ComplaintInput['purchase']>(
    key: K,
    value: ComplaintInput['purchase'][K],
  ) {
    setDraft((current) => ({
      ...current,
      purchase: { ...current.purchase, [key]: value },
    }))
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving.current) return
    const validation = validateComplaint(draft)
    if (!amount.trim() || !/^\d+(?:\.\d{1,2})?$/.test(amount))
      validation['purchase.amountCents'] =
        'Escribe el monto en soles; usa 0 si no corresponde.'
    setErrors(validation)
    if (Object.keys(validation).length) {
      requestAnimationFrame(() =>
        form.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      )
      return
    }
    saving.current = true
    setBusy(true)
    try {
      operation.current ??= createComplaintOperation()
      const confirmed = await submitComplaint(draft, operation.current, website)
      setReceipt(confirmed)
    } catch (error) {
      if (error instanceof ComplaintSubmissionError && error.indeterminate)
        setFrozen(true)
      else operation.current = null
      setGeneralError(
        error instanceof Error
          ? error.message
          : 'No pudimos registrar tu solicitud. Conserva los datos y vuelve a intentar.',
      )
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  async function download() {
    if (!receipt) return
    try {
      await downloadComplaintPdf(receipt)
    } catch {
      setGeneralError(
        'La hoja está registrada, pero no pudimos generar el PDF. Vuelve a pulsar Descargar hoja.',
      )
    }
  }
  const field = (
    label: string,
    key: string,
    value: string,
    onChange: (value: string) => void,
    options: {
      type?: string
      maximum?: number
      multiline?: boolean
      autoComplete?: string
      required?: boolean
    } = {},
  ) => {
    const id = `complaint-${key.replaceAll('.', '-')}`
    const props = {
      id,
      value,
      onChange: (event: { target: { value: string } }) =>
        onChange(event.target.value),
      'aria-invalid': Boolean(errors[key]),
      'aria-describedby': errors[key] ? `${id}-error` : undefined,
      maxLength: options.maximum ?? 500,
      autoComplete: options.autoComplete,
      required: options.required !== false,
    }
    return (
      <div className="complaint-field">
        <label htmlFor={id}>
          {label}
          {options.required === false ? ' (opcional)' : ''}
        </label>
        {options.multiline ? (
          <textarea {...props} rows={4} />
        ) : (
          <input {...props} type={options.type ?? 'text'} />
        )}
        <span id={`${id}-error`} className="complaint-field-error">
          {errors[key] || ''}
        </span>
      </div>
    )
  }
  return (
    <div className="container complaint-page">
      <InstitutionalBreadcrumb current="Libro de reclamaciones" />
      <header className="institutional-intro">
        <h1>Libro de reclamaciones</h1>
        <p>Registra tu reclamo o queja y conserva una copia de la hoja.</p>
      </header>
      {settings.demonstration && (
        <p className="complaint-demo" role="note">
          Entorno de demostración. Los datos del proveedor son de ejemplo.
        </p>
      )}
      {receipt ? (
        <section
          className="complaint-confirmation"
          aria-labelledby="complaint-confirmed-title"
        >
          <p className="eyebrow">Hoja registrada</p>
          <h2 id="complaint-confirmed-title">{receipt.reference}</h2>
          <p role="status">
            Tu solicitud se guardó correctamente. Descarga e imprime tu copia
            para conservar todos los datos.
          </p>
          <p>
            El proveedor debe responder por escrito en un plazo máximo de 15
            días hábiles. Este sitio no envía correos automáticos.
          </p>
          <button
            className="button button--primary"
            type="button"
            onClick={() => void download()}
          >
            Descargar hoja (PDF)
          </button>
          <dl className="complaint-summary">
            <div>
              <dt>Consumidor</dt>
              <dd>{receipt.input.consumer.name}</dd>
            </div>
            <div>
              <dt>Tipo</dt>
              <dd>{receipt.input.kind === 'claim' ? 'Reclamo' : 'Queja'}</dd>
            </div>
            <div>
              <dt>Fecha</dt>
              <dd>{new Date(receipt.submittedAt).toLocaleString('es-PE')}</dd>
            </div>
            <div>
              <dt>Detalle</dt>
              <dd>{receipt.input.detail}</dd>
            </div>
            <div>
              <dt>Pedido del consumidor</dt>
              <dd>{receipt.input.request}</dd>
            </div>
          </dl>
          <Link to="/contacto" className="text-link">
            Consultar con la tienda
          </Link>
        </section>
      ) : (
        <form
          ref={form}
          onSubmit={(event) => void submit(event)}
          noValidate
          aria-busy={busy}
        >
          <fieldset disabled={busy || frozen}>
            <legend>1. Identificación del consumidor</legend>
            <div className="complaint-grid">
              {field(
                'Nombres y apellidos',
                'consumer.name',
                draft.consumer.name,
                (value) => consumer('name', value),
                { maximum: 240, autoComplete: 'name' },
              )}
              <label className="complaint-field">
                Tipo de documento
                <select
                  value={draft.consumer.documentType}
                  onChange={(event) =>
                    consumer(
                      'documentType',
                      event.target
                        .value as ComplaintInput['consumer']['documentType'],
                    )
                  }
                >
                  <option value="DNI">DNI</option>
                  <option value="CE">Carné de extranjería</option>
                  <option value="PASSPORT">Pasaporte</option>
                </select>
              </label>
              {field(
                'Número de documento',
                'consumer.documentNumber',
                draft.consumer.documentNumber,
                (value) => consumer('documentNumber', value),
                { maximum: 30 },
              )}
              {field(
                'Correo electrónico',
                'consumer.email',
                draft.consumer.email,
                (value) => consumer('email', value),
                { maximum: 254, autoComplete: 'email', type: 'email' },
              )}
              {field(
                'Teléfono',
                'consumer.phone',
                draft.consumer.phone,
                (value) => consumer('phone', value),
                { maximum: 30, autoComplete: 'tel', type: 'tel' },
              )}
              {field(
                'Domicilio',
                'consumer.address',
                draft.consumer.address,
                (value) => consumer('address', value),
                { maximum: 500, autoComplete: 'street-address' },
              )}
            </div>
            <label className="complaint-check">
              <input
                type="checkbox"
                checked={draft.consumer.minor}
                onChange={(event) => consumer('minor', event.target.checked)}
              />
              El consumidor es menor de edad
            </label>
            {draft.consumer.minor && (
              <div className="complaint-grid">
                {field(
                  'Padre, madre o representante',
                  'consumer.guardianName',
                  draft.consumer.guardianName,
                  (value) => consumer('guardianName', value),
                  { maximum: 240 },
                )}
                {field(
                  'Documento del representante',
                  'consumer.guardianDocument',
                  draft.consumer.guardianDocument,
                  (value) => consumer('guardianDocument', value),
                  { maximum: 60 },
                )}
              </div>
            )}
          </fieldset>
          <fieldset disabled={busy || frozen}>
            <legend>2. Bien o servicio</legend>
            <div className="complaint-grid">
              <label className="complaint-field">
                Relacionado con
                <select
                  value={draft.purchase.kind}
                  onChange={(event) =>
                    purchase(
                      'kind',
                      event.target.value as 'product' | 'service',
                    )
                  }
                >
                  <option value="product">Producto</option>
                  <option value="service">Servicio</option>
                </select>
              </label>
              {field(
                'Monto reclamado (S/)',
                'purchase.amountCents',
                amount,
                (value) => {
                  setAmount(value)
                  const parts = value.split('.')
                  purchase(
                    'amountCents',
                    /^\d+(?:\.\d{0,2})?$/.test(value)
                      ? Number(parts[0]) * 100 +
                          Number((parts[1] || '').padEnd(2, '0'))
                      : -1,
                  )
                },
                { maximum: 12 },
              )}
              {field(
                'Número de pedido',
                'purchase.orderReference',
                draft.purchase.orderReference,
                (value) => purchase('orderReference', value),
                { maximum: 80, required: false },
              )}
            </div>
            {field(
              'Descripción del bien o servicio',
              'purchase.description',
              draft.purchase.description,
              (value) => purchase('description', value),
              { maximum: 2000, multiline: true },
            )}
          </fieldset>
          <fieldset disabled={busy || frozen}>
            <legend>3. Detalle y pedido</legend>
            <div className="complaint-field">
              <label htmlFor="complaint-kind">Tipo de solicitud</label>
              <select
                id="complaint-kind"
                aria-describedby="complaint-kind-help"
                value={draft.kind}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    kind: event.target.value as 'claim' | 'complaint',
                  }))
                }
              >
                <option value="claim">Reclamo</option>
                <option value="complaint">Queja</option>
              </select>
              <small id="complaint-kind-help">
                {draft.kind === 'claim'
                  ? 'Disconformidad con el producto o servicio.'
                  : 'Disconformidad con la atención.'}
              </small>
            </div>
            {field(
              '¿Qué ocurrió?',
              'detail',
              draft.detail,
              (value) => setDraft((current) => ({ ...current, detail: value })),
              { maximum: 6000, multiline: true },
            )}
            {field(
              '¿Qué solicitas?',
              'request',
              draft.request,
              (value) =>
                setDraft((current) => ({ ...current, request: value })),
              { maximum: 4000, multiline: true },
            )}
            <label className="complaint-honeypot" aria-hidden="true">
              Sitio web
              <input
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                tabIndex={-1}
                autoComplete="off"
              />
            </label>
            <p className="complaint-help">
              Respuesta escrita en un máximo de 15 días hábiles. Al registrar se
              genera una hoja que puedes descargar e imprimir. La presentación
              no limita otras vías de solución.
            </p>
            <p className="complaint-help">
              Responsable: {settings.business.legalName} · RUC:{' '}
              {settings.business.taxId || 'Datos de demostración'} ·{' '}
              {settings.business.address}.{' '}
              <Link to="/privacidad">Privacidad</Link>
            </p>
          </fieldset>
          {frozen && (
            <p className="complaint-help" role="status">
              Esperamos confirmar el registro anterior. Reintenta con los mismos
              datos para evitar duplicados.
            </p>
          )}
          <button
            className="button button--primary"
            type="submit"
            disabled={busy}
          >
            {busy
              ? 'Registrando…'
              : frozen
                ? 'Reintentar registro'
                : 'Registrar solicitud'}
          </button>
        </form>
      )}
      <Dialog
        open={Boolean(generalError)}
        onClose={() => setGeneralError('')}
        title={
          receipt ? 'Tu hoja está guardada' : 'No pudimos completar el registro'
        }
        id="complaint-error"
      >
        <p>{generalError}</p>
        <button
          type="button"
          className="button button--primary"
          onClick={() => setGeneralError('')}
        >
          Entendido
        </button>
      </Dialog>
      <Dialog
        open={blocker.state === 'blocked'}
        onClose={() => {
          if (blocker.state === 'blocked') blocker.reset()
        }}
        title="¿Salir sin registrar?"
        id="complaint-leave"
      >
        <p>
          Los datos del formulario no se han registrado. Si sales, se perderán.
        </p>
        <div className="complaint-actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => {
              if (blocker.state === 'blocked') blocker.reset()
            }}
          >
            Seguir completando
          </button>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => {
              if (blocker.state === 'blocked') blocker.proceed()
            }}
          >
            Salir
          </button>
        </div>
      </Dialog>
    </div>
  )
}
