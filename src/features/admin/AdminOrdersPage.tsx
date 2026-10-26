import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { Dialog } from '../../components/ui/Dialog'
import { Icon } from '../../components/ui/Icon'
import { getPeruDistrictLabel, getPeruProvinceLabel } from '../../content/peru'
import {
  ORDER_STATUSES,
  getOrderTransitionError,
} from '../../domain/order-workflow'
import {
  adminService,
  hasCompleteOrderDelivery,
  type AdminOrder,
  type AdminOrderStatus,
} from '../../services/admin-service'
import { formatPEN } from '../../services/currency'
import type { OrderActionIssue } from '../../types/order-workflow'
import { AdminPagination } from './AdminPagination'
import { AdminOrderPdfExport } from './AdminOrderPdfExport'
import { InlineStatus } from '../../components/ui/InlineStatus'
import { EmptyState } from '../../components/ui/EmptyState'
import { AdminBadge, AdminPageHeader } from './AdminShared'
import { useAdminNotice } from './AdminNoticeProvider'
import { useAdminSave } from './useAdminSave'
import { AdminSaveFeedback } from './AdminSaveFeedback'
import { adminOrderStatusMeta, adminPaymentStatusMeta } from './admin-utils'
import { useAdminPagination } from './useAdminPagination'
import { useAdminStore } from './useAdminStore'
import { useUnsavedChanges } from './useUnsavedChanges'
import { orderSearchText } from './OrderWorkspaceUtils'
import './admin-operations.css'
import './admin-order-workspace.css'

const limaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const shortDateFormatter = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
})

function orderDay(value: string) {
  const parts = limaDateFormatter.formatToParts(new Date(value))
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}-${parts.find((part) => part.type === 'day')?.value}`
}

interface OrderStatusAction {
  references: string[]
  expected: Record<string, AdminOrderStatus>
  individual: boolean
}

interface OrderActionFeedback {
  updated: number
  skipped: OrderActionIssue[]
  errors: OrderActionIssue[]
}

interface OrderSelectionState {
  scope: string
  items: Map<string, AdminOrderStatus>
}

export function AdminOrdersPage() {
  const notice = useAdminNotice()
  const persistence = useAdminSave()
  const state = useAdminStore()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const selectionScopeParams = new URLSearchParams(params)
  selectionScopeParams.delete('page')
  selectionScopeParams.sort()
  const selectionScope = selectionScopeParams.toString()
  const [selectionState, setSelectionState] = useState<OrderSelectionState>(
    () => ({ scope: selectionScope, items: new Map() }),
  )
  const selection =
    selectionState.scope === selectionScope
      ? selectionState.items
      : new Map<string, AdminOrderStatus>()
  if (selectionState.scope !== selectionScope) {
    setSelectionState({ scope: selectionScope, items: new Map() })
  }

  function setSelection(
    next:
      | Map<string, AdminOrderStatus>
      | ((
          current: Map<string, AdminOrderStatus>,
        ) => Map<string, AdminOrderStatus>),
  ) {
    setSelectionState((current) => ({
      scope: selectionScope,
      items:
        typeof next === 'function'
          ? next(current.scope === selectionScope ? current.items : new Map())
          : next,
    }))
  }
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState<OrderActionFeedback | null>(null)
  const [reviewReferences, setReviewReferences] = useState<string[] | null>(
    null,
  )
  const persistenceFailed = persistence.persistenceFailed
  const [busy, setBusy] = useState(false)
  useUnsavedChanges(busy || persistenceFailed)
  const busyRef = useRef(false)
  const [statusAction, setStatusAction] = useState<OrderStatusAction | null>(
    null,
  )
  const [targetStatus, setTargetStatus] =
    useState<AdminOrderStatus>('preparing')
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false)
  const [actionError, setActionError] = useState('')
  const [exportReferences, setExportReferences] = useState<string[] | null>(
    null,
  )
  const search = params.get('q') ?? ''
  const customerFilter = params.get('cliente') ?? ''
  const preparationParameter = params.get('preparacion') ?? ''
  const preparationFilter = [...ORDER_STATUSES, 'atencion'].includes(
    preparationParameter,
  )
    ? preparationParameter
    : 'all'
  const from = params.get('desde') ?? ''
  const until = params.get('hasta') ?? ''
  const customerById = useMemo(
    () => new Map(state.customers.map((customer) => [customer.id, customer])),
    [state.customers],
  )
  const selectedCustomer = customerById.get(customerFilter)
  const normalizedSearch = orderSearchText(search)
  const orders = useMemo(
    () =>
      [...state.orders]
        .filter((order) => {
          if (reviewReferences)
            return reviewReferences.includes(order.reference)
          const text = orderSearchText(
            `${order.reference} ${order.customerName} ${order.customerEmail} ${order.contactPhone ?? ''} ${getPeruDistrictLabel(order.address.district)} ${getPeruProvinceLabel(order.address.province)}`,
          )
          const matchesPreparation =
            preparationFilter === 'all' ||
            (preparationFilter === 'atencion' &&
              (order.status === 'received' || order.status === 'preparing')) ||
            order.status === preparationFilter
          const day = orderDay(order.placedAt)
          return (
            text.includes(normalizedSearch) &&
            matchesPreparation &&
            (!customerFilter || order.customerId === customerFilter) &&
            (!from || day >= from) &&
            (!until || day <= until)
          )
        })
        .sort(
          (first, second) =>
            new Date(second.placedAt).getTime() -
              new Date(first.placedAt).getTime() ||
            first.reference.localeCompare(second.reference),
        ),
    [
      state.orders,
      normalizedSearch,
      preparationFilter,
      customerFilter,
      from,
      until,
      reviewReferences,
    ],
  )
  const pagination = useAdminPagination(orders, 20)
  const hasFilters = Boolean(
    search ||
    customerFilter ||
    from ||
    until ||
    reviewReferences ||
    preparationFilter !== 'all',
  )
  const selectedCount = selection.size
  const allPageSelected =
    pagination.items.length > 0 &&
    pagination.items.every((order) => selection.has(order.reference))
  const somePageSelected = pagination.items.some((order) =>
    selection.has(order.reference),
  )
  const allFilteredSelected =
    orders.length > 0 && orders.every((order) => selection.has(order.reference))
  const returnTo = `${location.pathname}${location.search}`
  const actionOrders =
    statusAction?.references.flatMap((reference) => {
      const order = state.orders.find((item) => item.reference === reference)
      return order ? [order] : []
    }) ?? []
  const eligibleCount = actionOrders.filter(
    (order) =>
      order.status === statusAction?.expected[order.reference] &&
      order.status !== targetStatus &&
      !getOrderTransitionError(
        order,
        targetStatus,
        customerById.get(order.customerId)?.phone,
      ),
  ).length

  function clearNotices() {
    setError('')
    setFeedback(null)
  }

  function updateFilters(next: URLSearchParams) {
    setReviewReferences(null)
    setSelection(new Map())
    clearNotices()
    setParams(next)
  }

  function statusFilterHref(status: AdminOrderStatus) {
    const next = new URLSearchParams(params)
    next.delete('page')
    next.delete('vista')
    next.set('preparacion', status)
    return `/admin/pedidos?${next.toString()}`
  }

  async function saveFeedback(nextMessage: string, onSaved?: () => void) {
    setError('')
    await persistence.save(
      () => undefined,
      () => {
        if (onSaved) onSaved()
        else notice.toast(nextMessage)
      },
    )
  }

  function selectedAction(): OrderStatusAction {
    return {
      references: [...selection.keys()],
      expected: Object.fromEntries(selection),
      individual: false,
    }
  }

  function openStatusAction(order?: AdminOrder, nextStatus?: AdminOrderStatus) {
    if (busyRef.current || persistenceFailed) return
    const action = order
      ? {
          references: [order.reference],
          expected: { [order.reference]: order.status },
          individual: true,
        }
      : selectedAction()
    if (!action.references.length) return
    setActionError('')
    setDeliveryConfirmed(false)
    setTargetStatus(nextStatus ?? 'preparing')
    setStatusAction(action)
  }

  async function changeStatuses(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!statusAction || busyRef.current || persistenceFailed) return
    if (
      (targetStatus === 'shipped' || targetStatus === 'delivered') &&
      !deliveryConfirmed
    ) {
      setActionError('Confirma que el envío o la entrega ya se ha realizado.')
      return
    }
    busyRef.current = true
    setBusy(true)
    clearNotices()
    try {
      if (statusAction.individual) {
        const reference = statusAction.references[0]
        const current = adminService
          .getSnapshot()
          .orders.find((order) => order.reference === reference)
        if (!current || current.status !== statusAction.expected[reference]) {
          setActionError(
            'El estado del pedido ha cambiado. Cierra y revisa su estado actual.',
          )
          return
        }
        const result = adminService.setOrderStatus(reference, targetStatus)
        if (result.kind === 'validation') {
          setActionError(result.message)
          return
        }
        setStatusAction(null)
        await saveFeedback(
          `Pedido ${reference}: ${adminOrderStatusMeta[targetStatus].label.toLowerCase()}.`,
        )
      } else {
        const result = adminService.bulkSetOrderStatus(
          statusAction.references,
          targetStatus,
          undefined,
          statusAction.expected,
        )
        if (result.kind === 'validation') {
          setActionError(result.message)
          return
        }
        const report = {
          updated: result.updated.length,
          skipped: result.skipped,
          errors: result.errors,
        }
        setFeedback(report)
        setSelection(new Map())
        setStatusAction(null)
        await saveFeedback(
          `${result.updated.length} de ${statusAction.references.length} pedidos actualizados.`,
          result.errors.length || result.skipped.length
            ? () => {
                const issues = [...result.errors, ...result.skipped]
                notice.show({
                  kind: result.updated.length ? 'warning' : 'info',
                  title: `${result.updated.length} de ${statusAction.references.length} pedidos actualizados`,
                  description: `${result.errors.length} con errores y ${result.skipped.length} sin cambios. Sus estados se conservaron.`,
                  details: issues.map(
                    (issue) => `${issue.reference}: ${issue.message}`,
                  ),
                  primary: {
                    label: 'Ver pedidos que no se actualizaron',
                    onClick: () => {
                      setReviewReferences(
                        issues.map(({ reference }) => reference),
                      )
                      setSelection(new Map())
                    },
                  },
                  secondary: { label: 'Cerrar' },
                })
              }
            : undefined,
        )
      }
    } catch (cause) {
      notice.error(cause, 'orders')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const start = data.get('desde')?.toString() ?? ''
    const end = data.get('hasta')?.toString() ?? ''
    if (start && end && start > end) {
      setError('La fecha inicial debe ser anterior o igual a la fecha final.')
      return
    }
    const next = new URLSearchParams()
    for (const key of ['q', 'cliente', 'preparacion', 'desde', 'hasta']) {
      const value = data.get(key)?.toString().trim()
      if (value && value !== 'all') next.set(key, value)
    }
    updateFilters(next)
  }

  return (
    <div className="admin-page admin-orders-page admin-order-workspace">
      <AdminPageHeader
        eyebrow="Operación"
        title="Pedidos"
        description="Organiza el trabajo y gestiona cada pedido hasta su entrega."
      />
      <AdminSaveFeedback {...persistence} />
      {busy ? (
        <InlineStatus busy>
          {exportReferences ? 'Generando PDF…' : 'Guardando cambios…'}
        </InlineStatus>
      ) : null}
      {error ? (
        <p className="admin-form-error" role="alert">
          {error}
        </p>
      ) : null}
      {feedback ? (
        <div
          className="admin-order-bulk-report"
          aria-label="Resultado de la actualización masiva"
        >
          <p>
            {feedback.updated} actualizados · {feedback.skipped.length} sin
            cambios · {feedback.errors.length} con errores
          </p>
          {feedback.errors.length ? (
            <details open>
              <summary>Pedidos que requieren revisión</summary>
              <ul>
                {feedback.errors.map((issue) => (
                  <li key={issue.reference}>
                    <Link
                      to={`/admin/pedidos/${encodeURIComponent(issue.reference)}`}
                      state={{ returnTo }}
                    >
                      {issue.reference}
                    </Link>
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {feedback.skipped.length ? (
            <details>
              <summary>Ver pedidos sin cambios</summary>
              <ul>
                {feedback.skipped.map((issue) => (
                  <li key={issue.reference}>
                    <Link
                      to={`/admin/pedidos/${encodeURIComponent(issue.reference)}`}
                      state={{ returnTo }}
                    >
                      {issue.reference}
                    </Link>
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
      {state.orders.length ? (
        <section
          className="admin-order-summary"
          aria-label="Resumen de pedidos"
        >
          {ORDER_STATUSES.map((status) => (
            <Link
              key={status}
              to={statusFilterHref(status)}
              aria-current={preparationFilter === status ? 'page' : undefined}
              onClick={() => {
                setSelection(new Map())
                clearNotices()
              }}
            >
              <AdminBadge tone={adminOrderStatusMeta[status].tone}>
                {status === 'received'
                  ? 'Nuevos'
                  : adminOrderStatusMeta[status].label}
              </AdminBadge>
              <strong>
                {state.orders.filter((order) => order.status === status).length}
              </strong>
            </Link>
          ))}
        </section>
      ) : null}
      <form
        className="admin-filter-bar admin-order-filter-bar"
        role="search"
        onSubmit={applyFilters}
      >
        {customerFilter ? (
          <input type="hidden" name="cliente" value={customerFilter} />
        ) : null}
        <div className="admin-filter-fields">
          <label className="admin-order-search-field">
            Buscar
            <input
              type="search"
              name="q"
              key={search}
              defaultValue={search}
              placeholder="Código, cliente, correo o destino"
            />
          </label>
          <label>
            Estado del pedido
            <select
              name="preparacion"
              key={preparationFilter}
              defaultValue={preparationFilter}
            >
              <option value="all">Todos</option>
              <option value="atencion">Por preparar</option>
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {adminOrderStatusMeta[status].label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Desde
            <input type="date" name="desde" key={from} defaultValue={from} />
          </label>
          <label>
            Hasta
            <input type="date" name="hasta" key={until} defaultValue={until} />
          </label>
          <button
            className="button button--primary"
            type="submit"
            disabled={busy}
          >
            <Icon name="search" /> Aplicar filtros
          </button>
        </div>
        <div className="admin-filter-result" aria-live="polite">
          <span>
            {orders.length} {orders.length === 1 ? 'pedido' : 'pedidos'}
            {selectedCustomer ? ` de ${selectedCustomer.name}` : ''}
            {reviewReferences ? ' · Solo pedidos no actualizados' : ''}
          </span>
          {hasFilters ? (
            <div className="admin-order-filter-actions">
              <button
                type="button"
                onClick={() => updateFilters(new URLSearchParams())}
                disabled={busy}
              >
                Limpiar filtros
              </button>
            </div>
          ) : null}
        </div>
      </form>
      {selectedCount > 0 ? (
        <section
          className="admin-order-selection-bar"
          aria-label="Acciones para pedidos seleccionados"
        >
          <div>
            <strong>
              {selectedCount}{' '}
              {selectedCount === 1
                ? 'pedido seleccionado'
                : 'pedidos seleccionados'}
            </strong>
            {!allFilteredSelected ? (
              <button
                className="admin-order-select-all"
                type="button"
                disabled={busy}
                onClick={() =>
                  setSelection(
                    new Map(
                      orders.map((order) => [order.reference, order.status]),
                    ),
                  )
                }
              >
                Seleccionar los {orders.length} pedidos filtrados
              </button>
            ) : (
              <span>Todos los pedidos filtrados están seleccionados</span>
            )}
          </div>
          <div className="admin-order-selection-actions">
            <button
              type="button"
              className="button button--primary"
              disabled={busy}
              onClick={() => openStatusAction()}
            >
              Cambiar estado
            </button>
            <button
              type="button"
              className="button button--secondary"
              disabled={busy}
              onClick={() => setExportReferences([...selection.keys()])}
            >
              Exportar PDF
            </button>
            <button
              type="button"
              className="admin-order-text-button"
              disabled={busy}
              onClick={() => setSelection(new Map())}
            >
              Quitar selección
            </button>
          </div>
        </section>
      ) : null}
      {orders.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table admin-table--orders admin-work-order-table">
            <caption className="sr-only">Pedidos</caption>
            <thead>
              <tr>
                <th scope="col">
                  <label className="admin-order-checkbox-target">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar pedidos de esta página"
                      disabled={busy}
                      checked={allPageSelected}
                      ref={(element) => {
                        if (element)
                          element.indeterminate =
                            somePageSelected && !allPageSelected
                      }}
                      onChange={(event) => {
                        const checked = event.target.checked
                        setSelection((current) => {
                          const next = new Map(current)
                          for (const order of pagination.items) {
                            if (checked) next.set(order.reference, order.status)
                            else next.delete(order.reference)
                          }
                          return next
                        })
                      }}
                    />
                  </label>
                </th>
                <th scope="col">Pedido</th>
                <th scope="col">Cliente</th>
                <th scope="col">Pago</th>
                <th scope="col">Preparación</th>
                <th scope="col">Total</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pagination.items.map((order) => {
                const orderStatus = adminOrderStatusMeta[order.status]
                const paymentStatus =
                  adminPaymentStatusMeta[order.paymentStatus]
                const nextStatus =
                  ORDER_STATUSES[ORDER_STATUSES.indexOf(order.status) + 1]
                const customer = customerById.get(order.customerId)
                const deliveryReady = hasCompleteOrderDelivery(
                  order,
                  customer?.phone,
                )
                const canAdvance =
                  nextStatus &&
                  !getOrderTransitionError(order, nextStatus, customer?.phone)
                return (
                  <tr
                    key={order.reference}
                    className={
                      selection.has(order.reference) ? 'is-selected' : undefined
                    }
                  >
                    <td className="admin-order-selection-cell">
                      <label className="admin-order-checkbox-target">
                        <input
                          type="checkbox"
                          aria-label={`Seleccionar pedido ${order.reference}`}
                          checked={selection.has(order.reference)}
                          disabled={busy}
                          onChange={(event) => {
                            const checked = event.target.checked
                            setSelection((current) => {
                              const next = new Map(current)
                              if (checked)
                                next.set(order.reference, order.status)
                              else next.delete(order.reference)
                              return next
                            })
                          }}
                        />
                      </label>
                    </td>
                    <th scope="row" className="admin-work-order-identity">
                      <span className="admin-cell-label">Pedido</span>
                      <strong className="admin-order-reference">
                        {order.reference}
                      </strong>
                      <small className="admin-order-date">
                        {shortDateFormatter.format(new Date(order.placedAt))}
                      </small>
                      <small className="admin-order-contents">
                        {order.lines
                          .map((line) => `${line.quantity} × ${line.name}`)
                          .join(' · ')}
                      </small>
                    </th>
                    <td className="admin-work-order-customer">
                      <span className="admin-cell-label">Cliente</span>
                      <span>
                        {order.customerName}
                        {deliveryReady ? (
                          <small className="admin-order-destination">
                            {getPeruDistrictLabel(order.address.district)},{' '}
                            {getPeruProvinceLabel(order.address.province)}
                          </small>
                        ) : (
                          <small className="admin-data-gap">
                            Datos de entrega pendientes
                          </small>
                        )}
                      </span>
                    </td>
                    <td>
                      <span className="admin-cell-label">Pago</span>
                      <AdminBadge tone={paymentStatus.tone}>
                        {paymentStatus.label}
                      </AdminBadge>
                    </td>
                    <td>
                      <span className="admin-cell-label">Preparación</span>
                      <AdminBadge tone={orderStatus.tone}>
                        {orderStatus.label}
                      </AdminBadge>
                    </td>
                    <td>
                      <span className="admin-cell-label">Total</span>
                      <strong>{formatPEN(order.totalCents)}</strong>
                    </td>
                    <td className="admin-work-order-actions">
                      <span className="admin-cell-label">Acciones</span>
                      <div className="admin-row-actions">
                        <Link
                          to={`/admin/pedidos/${encodeURIComponent(order.reference)}`}
                          aria-label={`Ver ${order.reference}`}
                          state={{ returnTo }}
                        >
                          Ver detalle
                        </Link>
                        {canAdvance ? (
                          <button
                            type="button"
                            className="admin-order-next-action"
                            disabled={busy}
                            onClick={() => openStatusAction(order, nextStatus)}
                          >
                            {nextStatus === 'preparing'
                              ? 'Preparar'
                              : nextStatus === 'shipped'
                                ? 'Marcar enviado'
                                : 'Marcar entregado'}
                            <span className="sr-only"> {order.reference}</span>
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          className="admin-empty"
          icon={hasFilters ? 'search' : 'orders'}
          title={hasFilters ? 'No encontramos pedidos' : 'Aún no hay pedidos'}
          description={
            hasFilters
              ? 'Prueba con otros filtros o limpia la búsqueda.'
              : 'Los pedidos confirmados aparecerán aquí.'
          }
        >
          {hasFilters ? (
            <button
              type="button"
              onClick={() => updateFilters(new URLSearchParams())}
            >
              Limpiar filtros
            </button>
          ) : null}
        </EmptyState>
      )}
      <AdminPagination
        label="pedidos"
        page={pagination.page}
        totalPages={pagination.totalPages}
        totalItems={pagination.totalItems}
        from={pagination.from}
        to={pagination.to}
        onPageChange={pagination.setPage}
      />
      <Dialog
        open={statusAction !== null}
        onClose={() => {
          if (!busyRef.current) setStatusAction(null)
        }}
        title={
          statusAction?.individual
            ? `Actualizar pedido ${statusAction.references[0]}`
            : `Actualizar ${statusAction?.references.length ?? 0} pedidos`
        }
        id="update-orders"
        className="admin-order-action-dialog"
      >
        <form
          className="admin-order-action-form"
          onSubmit={(event) => void changeStatuses(event)}
        >
          <p className="admin-order-dialog-intro">
            {statusAction?.references.length ?? 0}{' '}
            {statusAction?.individual
              ? 'pedido seleccionado'
              : 'pedidos seleccionados'}
          </p>
          <label>
            Nuevo estado
            <select
              value={targetStatus}
              onChange={(event) => {
                setTargetStatus(event.target.value as AdminOrderStatus)
                setDeliveryConfirmed(false)
                setActionError('')
              }}
              disabled={busy}
            >
              {ORDER_STATUSES.map((status) => (
                <option value={status} key={status}>
                  {adminOrderStatusMeta[status].label}
                </option>
              ))}
            </select>
          </label>
          <p className="admin-order-eligibility">
            {eligibleCount} pueden pasar a «
            {adminOrderStatusMeta[targetStatus].label}». Los demás conservarán
            su estado y verás el motivo.
          </p>
          {targetStatus === 'shipped' || targetStatus === 'delivered' ? (
            <label className="admin-order-check-label admin-order-confirm-delivery">
              <input
                type="checkbox"
                checked={deliveryConfirmed}
                disabled={busy}
                required
                onChange={(event) => setDeliveryConfirmed(event.target.checked)}
              />
              {statusAction?.individual
                ? targetStatus === 'shipped'
                  ? 'Confirmo que el pedido ya fue enviado'
                  : 'Confirmo que el pedido ya fue entregado'
                : targetStatus === 'shipped'
                  ? 'Confirmo que los pedidos ya fueron enviados'
                  : 'Confirmo que los pedidos ya fueron entregados'}
            </label>
          ) : null}
          {actionError ? (
            <p className="admin-form-error" role="alert">
              {actionError}
            </p>
          ) : null}
          <div className="admin-order-dialog-actions">
            <button
              type="submit"
              className="button button--primary"
              disabled={busy}
            >
              {busy ? 'Actualizando…' : 'Confirmar actualización'}
            </button>
            <button
              type="button"
              className="button button--secondary"
              disabled={busy}
              onClick={() => setStatusAction(null)}
            >
              Cancelar
            </button>
          </div>
        </form>
      </Dialog>
      {exportReferences !== null ? (
        <AdminOrderPdfExport
          open
          references={exportReferences}
          onClose={() => setExportReferences(null)}
          onProcessingChange={(processing) => {
            busyRef.current = processing
            setBusy(processing)
          }}
        />
      ) : null}
    </div>
  )
}
