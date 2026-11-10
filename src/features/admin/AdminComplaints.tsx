import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Dialog } from '../../components/ui/Dialog'
import { AdminPageHeader, AdminBadge } from './AdminShared'
import { AdminPagination } from './AdminPagination'
import {
  complaintStatusLabels,
  type ComplaintReceipt,
  type ComplaintStatus,
} from '../../domain/complaints'
import { complaintsAdminService } from '../../services/complaints-service'
import { downloadComplaintPdf } from '../../services/complaint-pdf'
import { useUnsavedChanges } from './useUnsavedChanges'
import '../../styles/complaints.css'

export function AdminComplaints() {
  const [items, setItems] = useState<ComplaintReceipt[]>([]),
    [total, setTotal] = useState(0)
  const [page, setPage] = useState(1),
    [status, setStatus] = useState(''),
    [search, setSearch] = useState('')
  const [query, setQuery] = useState(''),
    [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<ComplaintReceipt | null>(null)
  const [target, setTarget] = useState<ComplaintStatus>('reviewing'),
    [response, setResponse] = useState(''),
    [channel, setChannel] = useState<ComplaintReceipt['responseChannel']>('')
  const [deliveredAt, setDeliveredAt] = useState(''),
    [evidence, setEvidence] = useState(''),
    [saving, setSaving] = useState(false)
  const saveLock = useRef(false)
  const dirty =
    selected !== null &&
    selected.status !== 'responded' &&
    (response !== selected.response ||
      target !== selected.status ||
      channel !== selected.responseChannel ||
      evidence !== selected.deliveryEvidence ||
      Boolean(deliveredAt))
  useUnsavedChanges(dirty && !saving)
  useEffect(() => {
    let current = true
    void complaintsAdminService
      .list(page, status, query)
      .then((result) => {
        if (current) {
          setItems(result.items)
          setTotal(result.total)
        }
      })
      .catch((failure) => {
        if (current)
          setError(
            failure instanceof Error
              ? failure.message
              : 'No pudimos cargar las solicitudes.',
          )
      })
      .finally(() => {
        if (current) setLoading(false)
      })
    return () => {
      current = false
    }
  }, [page, status, query, revision])
  function open(item: ComplaintReceipt) {
    setSelected(item)
    setTarget(item.status)
    setResponse(item.response)
    setChannel(item.responseChannel)
    setDeliveredAt(
      item.responseDeliveredAt
        ? new Date(
            new Date(item.responseDeliveredAt).getTime() -
              new Date().getTimezoneOffset() * 60000,
          )
            .toISOString()
            .slice(0, 16)
        : '',
    )
    setEvidence(item.deliveryEvidence)
    setError('')
  }
  async function save(event: FormEvent) {
    event.preventDefault()
    if (!selected || saveLock.current) return
    if (
      target === 'responded' &&
      (!response.trim() || !channel || !deliveredAt || !evidence.trim())
    ) {
      setError(
        'Para marcar Respondido, completa la respuesta escrita, el medio, la fecha y la constancia de entrega.',
      )
      return
    }
    saveLock.current = true
    setSaving(true)
    setError('')
    try {
      const confirmed = await complaintsAdminService.update(selected, {
        status: target,
        response,
        responseChannel: channel,
        responseDeliveredAt: deliveredAt
          ? new Date(deliveredAt).toISOString()
          : null,
        deliveryEvidence: evidence,
      })
      setSelected(confirmed)
      setNotice('Solicitud actualizada.')
      setLoading(true)
      setRevision((value) => value + 1)
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'No pudimos guardar. Conserva la respuesta y vuelve a intentar.',
      )
    } finally {
      saveLock.current = false
      setSaving(false)
    }
  }
  async function download(item: ComplaintReceipt) {
    try {
      await downloadComplaintPdf(item)
    } catch {
      setError('No pudimos generar el PDF. Vuelve a intentar.')
    }
  }
  function close() {
    if (
      !saving &&
      (!dirty || window.confirm('Hay cambios sin guardar. ¿Cerrar el detalle?'))
    )
      setSelected(null)
  }
  return (
    <div className="admin-page admin-complaints">
      <AdminPageHeader
        eyebrow="Atención al consumidor"
        title="Libro de reclamaciones"
        description="Consulta las hojas, registra su atención y conserva la respuesta escrita."
      />
      <p className="complaint-help">
        Plazo máximo: 15 días hábiles. La respuesta se entrega por carta o
        correo gestionado externamente; registrar una respuesta aquí no la
        envía.
      </p>
      <form
        className="admin-toolbar complaint-toolbar"
        onSubmit={(event) => {
          event.preventDefault()
          setLoading(true)
          setError('')
          setPage(1)
          setQuery(search)
          setRevision((value) => value + 1)
        }}
      >
        <label>
          Buscar hoja o consumidor
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            maxLength={100}
            type="search"
          />
        </label>
        <div className="complaint-toolbar-field">
          <label htmlFor="complaint-status-filter">Estado</label>
          <select
            id="complaint-status-filter"
            value={status}
            onChange={(event) => {
              setLoading(true)
              setError('')
              setStatus(event.target.value)
              setPage(1)
            }}
          >
            <option value="">Todos</option>
            {Object.entries(complaintStatusLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button className="button button--secondary" type="submit">
          Buscar
        </button>
      </form>
      {notice && <p role="status">{notice}</p>}
      {error && !selected && (
        <p role="alert">
          {error}{' '}
          <button
            type="button"
            className="text-link"
            onClick={() => {
              setLoading(true)
              setError('')
              setRevision((value) => value + 1)
            }}
          >
            Reintentar
          </button>
        </p>
      )}
      {loading ? (
        <p role="status">Cargando solicitudes…</p>
      ) : !error && !items.length ? (
        <p>No hay solicitudes con estos filtros.</p>
      ) : (
        <div className="complaint-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Hoja</th>
                <th>Consumidor</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th>
                  <span className="sr-only">Acción</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td data-label="Hoja">
                    {item.reference}
                    {item.demonstration && <small>Demostración</small>}
                  </td>
                  <td data-label="Consumidor">
                    {item.input.consumer.name}
                    <small>
                      {item.input.kind === 'claim' ? 'Reclamo' : 'Queja'}
                    </small>
                  </td>
                  <td data-label="Fecha">
                    {new Date(item.submittedAt).toLocaleDateString('es-PE')}
                  </td>
                  <td data-label="Estado">
                    <AdminBadge
                      tone={
                        item.status === 'responded'
                          ? 'success'
                          : item.status === 'reviewing'
                            ? 'warning'
                            : 'info'
                      }
                    >
                      {complaintStatusLabels[item.status]}
                    </AdminBadge>
                  </td>
                  <td data-label="Acciones">
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => open(item)}
                    >
                      Ver hoja
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AdminPagination
        label="solicitudes"
        page={page}
        totalPages={Math.max(1, Math.ceil(total / 20))}
        totalItems={total}
        from={total ? (page - 1) * 20 + 1 : 0}
        to={Math.min(page * 20, total)}
        onPageChange={(value) => {
          setLoading(true)
          setError('')
          setPage(value)
        }}
      />
      <Dialog
        open={Boolean(selected)}
        onClose={close}
        title={selected?.reference ?? 'Hoja de reclamación'}
        id="admin-complaint-detail"
        className="complaint-detail-dialog"
        closeDisabled={saving}
      >
        {selected && (
          <>
            <dl className="complaint-summary">
              <div>
                <dt>Consumidor</dt>
                <dd>
                  {selected.input.consumer.name} ·{' '}
                  {selected.input.consumer.documentType}{' '}
                  {selected.input.consumer.documentNumber}
                  <br />
                  {selected.input.consumer.email} ·{' '}
                  {selected.input.consumer.phone}
                  <br />
                  {selected.input.consumer.address}
                </dd>
              </div>
              {selected.input.consumer.minor && (
                <div>
                  <dt>Representante</dt>
                  <dd>
                    {selected.input.consumer.guardianName} ·{' '}
                    {selected.input.consumer.guardianDocument}
                  </dd>
                </div>
              )}
              <div>
                <dt>Producto o servicio</dt>
                <dd>
                  {selected.input.purchase.description} · S/{' '}
                  {(selected.input.purchase.amountCents / 100).toFixed(2)}
                  {selected.input.purchase.orderReference &&
                    ` · Pedido ${selected.input.purchase.orderReference}`}
                </dd>
              </div>
              <div>
                <dt>{selected.input.kind === 'claim' ? 'Reclamo' : 'Queja'}</dt>
                <dd>{selected.input.detail}</dd>
              </div>
              <div>
                <dt>Pedido del consumidor</dt>
                <dd>{selected.input.request}</dd>
              </div>
            </dl>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => void download(selected)}
            >
              Descargar hoja (PDF)
            </button>
            <form
              onSubmit={(event) => void save(event)}
              noValidate
              aria-busy={saving}
            >
              <fieldset disabled={saving || selected.status === 'responded'}>
                <legend>Atención y respuesta</legend>
                <div className="complaint-grid">
                  <div className="complaint-field">
                    <label htmlFor="complaint-response-status">Estado</label>
                    <select
                      id="complaint-response-status"
                      value={target}
                      onChange={(event) =>
                        setTarget(event.target.value as ComplaintStatus)
                      }
                    >
                      {Object.entries(complaintStatusLabels).map(
                        ([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                  <div className="complaint-field">
                    <label htmlFor="complaint-response-channel">
                      Medio de entrega
                    </label>
                    <select
                      id="complaint-response-channel"
                      value={channel}
                      onChange={(event) =>
                        setChannel(
                          event.target
                            .value as ComplaintReceipt['responseChannel'],
                        )
                      }
                    >
                      <option value="">Selecciona un medio</option>
                      <option value="letter">Carta</option>
                      <option value="email-manual">
                        Correo gestionado externamente
                      </option>
                    </select>
                  </div>
                </div>
                <div className="complaint-field">
                  <label htmlFor="complaint-response-text">
                    Respuesta escrita / observaciones
                  </label>
                  <textarea
                    id="complaint-response-text"
                    rows={5}
                    value={response}
                    onChange={(event) => setResponse(event.target.value)}
                    maxLength={10000}
                  />
                </div>
                <div className="complaint-grid">
                  <div className="complaint-field">
                    <label htmlFor="complaint-delivery-date">
                      Fecha de entrega
                    </label>
                    <input
                      id="complaint-delivery-date"
                      type="datetime-local"
                      value={deliveredAt}
                      onChange={(event) => setDeliveredAt(event.target.value)}
                    />
                  </div>
                  <div className="complaint-field">
                    <label htmlFor="complaint-delivery-evidence">
                      Constancia de entrega
                    </label>
                    <input
                      id="complaint-delivery-evidence"
                      value={evidence}
                      onChange={(event) => setEvidence(event.target.value)}
                      maxLength={1000}
                      placeholder="Referencia de carta o comunicación entregada"
                    />
                  </div>
                </div>
                {error && <p role="alert">{error}</p>}
                <button
                  className="button button--primary"
                  type="submit"
                  disabled={saving}
                >
                  {saving ? 'Guardando…' : 'Guardar atención'}
                </button>
              </fieldset>
            </form>
            {selected.status === 'responded' && (
              <p role="status">
                Respuesta entregada registrada. Su contenido se conserva sin
                sobrescribirlo.
              </p>
            )}
            <details>
              <summary>Historial de atención</summary>
              <ol>
                {selected.history.map((item, index) => (
                  <li key={`${item.at}-${index}`}>
                    {new Date(item.at).toLocaleString('es-PE')} ·{' '}
                    {complaintStatusLabels[item.next]}
                    {item.actorId && ` · Administrador ${item.actorId}`}
                  </li>
                ))}
              </ol>
            </details>
          </>
        )}
      </Dialog>
    </div>
  )
}
