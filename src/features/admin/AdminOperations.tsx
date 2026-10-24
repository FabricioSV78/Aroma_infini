import { variantLabel } from '../../domain/product-type'
import { formatBrandName } from '../../utils/brand-name'
import './admin-operations.css'
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import {
  getPeruDepartmentLabel,
  getPeruDistrictLabel,
  getPeruDistrictOptions,
  getPeruProvinceLabel,
  getPeruProvinceOptions,
  peruDepartments,
  deliveryAreas,
  getDeliveryArea,
} from '../../content/peru'
import {
  adminService,
  hasCompleteOrderDelivery,
  type AdminBrand,
  type AdminOrderStatus,
  type AdminOrder,
  type AdminPromotion,
} from '../../services/admin-service'
import { formatPEN } from '../../services/currency'
import { AdminPagination } from './AdminPagination'
import { AdminBadge, AdminPageHeader, AdminStatus } from './AdminShared'
import {
  adminOrderStatusMeta,
  adminPaymentStatusMeta,
  getPromotionStatus,
} from './admin-utils'
import { useAdminPagination } from './useAdminPagination'
import { useAdminStore } from './useAdminStore'
import { useUnsavedChanges } from './useUnsavedChanges'
import { AdminShippingSummary } from './AdminShippingSummary'
import { isShippingDestinationEnabled } from '../../services/shipping-rates'
import { AdminProductOffers } from './AdminProductOffers'
import { OrderOperatorControl } from './OrderOperatorControl'
import { useOrderOperator } from './useOrderOperator'
import { OrderHistory } from './OrderHistory'
import { ORDER_STATUSES } from '../../domain/order-workflow'
import { EmptyState } from '../../components/ui/EmptyState'
import { useAdminSave } from './useAdminSave'
import { AdminSaveFeedback } from './AdminSaveFeedback'
import { InlineStatus } from '../../components/ui/InlineStatus'
import { useAdminNotice } from './AdminNoticeProvider'

function brandSlug(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('es-PE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function searchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim()
}

function matchingLocationValue(
  value: string | undefined,
  options: { value: string; label: string }[],
) {
  if (!value) return ''
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es')
  return (
    options.find(
      (option) =>
        option.value === value ||
        option.label
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLocaleLowerCase('es') === normalized,
    )?.value ?? ''
  )
}

function editableLocation(address: AdminOrder['address'] | undefined) {
  const department = matchingLocationValue(address?.department, peruDepartments)
  const province = matchingLocationValue(
    address?.province,
    getPeruProvinceOptions(department),
  )
  const district = matchingLocationValue(
    address?.district,
    getPeruDistrictOptions(province),
  )
  return { department, province, district }
}

export function AdminBrandsPage() {
  const notice = useAdminNotice()
  const state = useAdminStore()
  const [form, setForm] = useState<AdminBrand | null>(null)
  const [originalForm, setOriginalForm] = useState<AdminBrand | null>(null)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const editorHeadingRef = useRef<HTMLHeadingElement>(null)
  const persistence = useAdminSave()
  const pagination = useAdminPagination(state.brands, 12)
  const dirty = Boolean(
    form &&
    originalForm &&
    JSON.stringify(form) !== JSON.stringify(originalForm),
  )
  useUnsavedChanges(
    dirty || persistence.saving || persistence.persistenceFailed,
  )

  function openEditor(brand: AdminBrand) {
    setError('')
    setActionError('')
    setForm(brand)
    setOriginalForm(brand)
    window.requestAnimationFrame(() => editorHeadingRef.current?.focus())
  }

  async function closeEditor() {
    if (
      dirty &&
      !(await notice.confirm({
        title: '¿Descartar los cambios de la marca?',
        description: 'Se conservarán los datos guardados anteriormente.',
        confirmLabel: 'Descartar cambios',
        cancelLabel: 'Seguir editando',
        destructive: true,
      }))
    )
      return
    setForm(null)
    setOriginalForm(null)
    setError('')
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form) return
    setError('')
    const result = await persistence.save(
      () => adminService.saveBrand(form),
      () => {
        setForm(null)
        setOriginalForm(null)
        notice.toast('Marca guardada.')
      },
    )
    if (!result) return
    if (result.kind === 'validation') {
      setError(result.message)
      return
    }
  }

  async function toggle(brand: AdminBrand) {
    if (persistence.saving || persistence.persistenceFailed) return
    if (
      brand.active &&
      !(await notice.confirm({
        title: `¿Desactivar ${brand.name}?`,
        description:
          'La marca y sus productos dejarán de mostrarse en la tienda. Podrás activarla nuevamente.',
        confirmLabel: 'Desactivar marca',
        destructive: true,
      }))
    )
      return
    setActionError('')
    const result = await persistence.save(
      () => adminService.setBrandActive(brand.id, !brand.active),
      () => notice.toast(`Marca ${brand.active ? 'desactivada' : 'activada'}.`),
    )
    if (result?.kind === 'validation') setActionError(result.message)
  }

  return (
    <div className="admin-page admin-brands-page">
      <AdminPageHeader
        eyebrow="Organización del surtido"
        title="Marcas"
        description="Gestiona las marcas visibles en la tienda."
      />
      {!form ? (
        <div className="admin-list-toolbar">
          <p>
            {state.brands.length}{' '}
            {state.brands.length === 1 ? 'marca' : 'marcas'}
          </p>
          <button
            className="button button--primary"
            type="button"
            disabled={persistence.saving || persistence.persistenceFailed}
            onClick={() => {
              openEditor({
                id: `brand-${crypto.randomUUID().slice(0, 8)}`,
                name: '',
                slug: '',
                active: true,
              })
            }}
          >
            Nueva marca
          </button>
        </div>
      ) : null}
      {form ? (
        <form
          className="admin-compact-form"
          onSubmit={save}
          aria-busy={persistence.saving}
          inert={persistence.saving || persistence.persistenceFailed}
        >
          <header>
            <h2 ref={editorHeadingRef} tabIndex={-1}>
              {state.brands.some((brand) => brand.id === form.id)
                ? 'Editar marca'
                : 'Nueva marca'}
            </h2>
            <p>
              El nombre se muestra en la tienda. La URL se completa
              automáticamente.
            </p>
          </header>
          <div className="admin-inline-fields">
            <label>
              Nombre
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => {
                    if (!current) return current
                    const nextName = event.target.value
                    const automaticSlug =
                      !current.slug || current.slug === brandSlug(current.name)
                    return {
                      ...current,
                      name: nextName,
                      slug: automaticSlug ? brandSlug(nextName) : current.slug,
                    }
                  })
                }
                required
              />
            </label>
            <label>
              URL de la marca
              <input
                value={form.slug}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? { ...current, slug: event.target.value.toLowerCase() }
                      : current,
                  )
                }
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                title="Usa letras minúsculas, números y guiones."
                required
              />
            </label>
          </div>
          {error ? (
            <p className="admin-form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="admin-inline-actions">
            <button
              className="button button--primary"
              type="submit"
              disabled={persistence.saving || persistence.persistenceFailed}
              aria-busy={persistence.saving}
            >
              {persistence.saving ? 'Guardando…' : 'Guardar marca'}
            </button>
            <button
              type="button"
              onClick={() => void closeEditor()}
              disabled={persistence.saving || persistence.persistenceFailed}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
      <AdminSaveFeedback {...persistence} />
      {actionError ? (
        <p className="admin-form-error" role="alert">
          {actionError}
        </p>
      ) : null}
      {state.brands.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="sr-only">Marcas de la tienda</caption>
            <thead>
              <tr>
                <th scope="col">Marca</th>
                <th scope="col">URL</th>
                <th scope="col">Estado</th>
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pagination.items.map((brand) => (
                <tr key={brand.id}>
                  <th scope="row">
                    <span className="admin-cell-label">Marca</span>
                    {brand.name}
                  </th>
                  <td>
                    <span className="admin-cell-label">URL</span>
                    /marcas/{brand.slug}
                  </td>
                  <td>
                    <span className="admin-cell-label">Estado</span>
                    <AdminStatus active={brand.active} />
                  </td>
                  <td>
                    <span className="admin-cell-label">Acciones</span>
                    <div className="admin-row-actions">
                      <button
                        type="button"
                        aria-label={`Editar ${brand.name}`}
                        disabled={
                          persistence.saving || persistence.persistenceFailed
                        }
                        onClick={() => openEditor({ ...brand })}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className={
                          brand.active ? 'admin-action-danger' : undefined
                        }
                        disabled={
                          persistence.saving || persistence.persistenceFailed
                        }
                        onClick={() => void toggle(brand)}
                        aria-label={`${brand.active ? 'Desactivar' : 'Activar'} ${brand.name}`}
                      >
                        {brand.active ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {!state.brands.length && !form ? (
        <EmptyState
          className="admin-empty admin-operations-empty"
          icon="tag"
          title="Aún no hay marcas"
          description="Crea la primera marca para organizar el catálogo."
        />
      ) : null}
      <AdminPagination
        label="marcas"
        page={pagination.page}
        totalPages={pagination.totalPages}
        totalItems={pagination.totalItems}
        from={pagination.from}
        to={pagination.to}
        onPageChange={pagination.setPage}
      />
    </div>
  )
}

const orderStatusOrder = ORDER_STATUSES

export { AdminOrdersPage } from './AdminOrdersPage'

export function AdminOrderDetailPage() {
  const notice = useAdminNotice()
  const { reference = '' } = useParams()
  const state = useAdminStore()
  const location = useLocation()
  const requestedReturnTo = location.state?.returnTo
  const returnTo =
    typeof requestedReturnTo === 'string' &&
    (requestedReturnTo === '/admin' ||
      requestedReturnTo === '/admin/pedidos' ||
      requestedReturnTo.startsWith('/admin/pedidos?'))
      ? requestedReturnTo
      : '/admin/pedidos'
  const order = state.orders.find((item) => item.reference === reference)
  const [status, setStatus] = useState<AdminOrderStatus>(
    order?.status ?? 'received',
  )
  const [statusError, setStatusError] = useState('')
  const statusPersistence = useAdminSave()
  const statusBusy = statusPersistence.saving
  const statusPersistenceError = statusPersistence.persistenceFailed
  const statusAction = useRef(false)
  const {
    operator,
    name: operatorName,
    setName: setOperatorName,
  } = useOrderOperator()
  const [editingDelivery, setEditingDelivery] = useState(false)
  const [deliveryError, setDeliveryError] = useState('')
  const deliveryPersistence = useAdminSave()
  const [deliveryDraft, setDeliveryDraft] = useState(() => {
    const customer = state.customers.find(
      (item) => item.id === order?.customerId,
    )
    const location = editableLocation(order?.address)
    return {
      customerName: /^Cliente \d+$/.test(order?.customerName ?? '')
        ? ''
        : (order?.customerName ?? ''),
      customerEmail:
        order?.customerEmail === '—' ? '' : (order?.customerEmail ?? ''),
      phone:
        (order?.contactPhone ?? customer?.phone) === '—'
          ? ''
          : (order?.contactPhone ?? customer?.phone ?? ''),
      street:
        order?.address.street === 'Dirección registrada'
          ? ''
          : (order?.address.street ?? ''),
      ...location,
    }
  })
  const [savedDeliveryDraft, setSavedDeliveryDraft] = useState(deliveryDraft)
  const dirtyDelivery =
    JSON.stringify(deliveryDraft) !== JSON.stringify(savedDeliveryDraft)
  useUnsavedChanges(
    dirtyDelivery ||
      statusBusy ||
      statusPersistenceError ||
      deliveryPersistence.saving ||
      deliveryPersistence.persistenceFailed,
  )
  if (!order)
    return (
      <div className="admin-page admin-empty">
        <h1>Pedido no encontrado</h1>
        <Link to="/admin/pedidos">Volver a pedidos</Link>
      </div>
    )
  const customer = state.customers.find((item) => item.id === order.customerId)
  const originalAddress = order.address
  const contactPhone = order.contactPhone ?? customer?.phone
  const deliveryReady = hasCompleteOrderDelivery(order, customer?.phone)
  const orderStatus = adminOrderStatusMeta[order.status]
  const paymentStatus = adminPaymentStatusMeta[order.paymentStatus]
  const orderReference = order.reference
  const persistedStatus = order.status
  const currentStatusIndex = orderStatusOrder.indexOf(order.status)
  const selectedStatusIndex = orderStatusOrder.indexOf(status)
  const canChangeStatus =
    order.paymentStatus === 'approved' &&
    (status !== 'shipped' || deliveryReady)
  const deliveryMethod =
    order.deliveryMethod === 'motorizado' ? 'Motorizado' : 'Courier'
  const draftArea = getDeliveryArea(deliveryDraft.department)
  const selectedArea =
    draftArea?.province === deliveryDraft.province ? draftArea : undefined
  const originalLocation = editableLocation(order.address)
  const historicDestination = Boolean(
    originalLocation.department &&
    originalLocation.province &&
    originalLocation.district &&
    !isShippingDestinationEnabled(
      state.shipping,
      originalLocation.department,
      originalLocation.province,
      originalLocation.district,
    ),
  )

  async function saveStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      statusAction.current ||
      statusPersistenceError ||
      !canChangeStatus ||
      status === persistedStatus
    )
      return
    if (operator.name.length < 2 || operator.name.length > 80) {
      setStatusError(
        'Escribe el nombre del responsable para registrar el cambio.',
      )
      document
        .querySelector<HTMLInputElement>('[name="orderOperator"]')
        ?.focus()
      return
    }
    statusAction.current = true
    try {
      if (
        (selectedStatusIndex < currentStatusIndex ||
          status === 'shipped' ||
          status === 'delivered') &&
        !(await notice.confirm({
          title:
            selectedStatusIndex < currentStatusIndex
              ? '¿Retroceder el estado del pedido?'
              : status === 'shipped'
                ? '¿Confirmar pedido enviado?'
                : '¿Confirmar pedido entregado?',
          description:
            selectedStatusIndex < currentStatusIndex
              ? `El pedido ${orderReference} pasará a «${adminOrderStatusMeta[status].label}». El cambio quedará registrado en su historial.`
              : `Confirma únicamente si el pedido ${orderReference} ya ${status === 'shipped' ? 'fue enviado' : 'fue recibido por el cliente'}.`,
          confirmLabel:
            status === 'shipped'
              ? 'Confirmar envío'
              : status === 'delivered'
                ? 'Confirmar entrega'
                : 'Cambiar estado',
        }))
      )
        return
      setStatusError('')
      const result = await statusPersistence.save(
        () => adminService.setOrderStatus(orderReference, status, operator),
        () => notice.toast('Estado actualizado.'),
      )
      if (result?.kind === 'validation') {
        setStatusError(result.message)
      }
    } finally {
      statusAction.current = false
    }
  }

  async function saveDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setDeliveryError('')
    const result = await deliveryPersistence.save(
      () =>
        adminService.saveOrderDelivery(
          orderReference,
          historicDestination
            ? {
                ...deliveryDraft,
                department: originalAddress.department,
                province: originalAddress.province,
                district: originalAddress.district,
              }
            : deliveryDraft,
        ),
      () => {
        notice.toast('Datos de entrega guardados.')
        setSavedDeliveryDraft(deliveryDraft)
        setEditingDelivery(false)
      },
    )
    if (result?.kind === 'validation') setDeliveryError(result.message)
  }

  return (
    <div className="admin-page admin-page--order-detail">
      <Link className="admin-back" to={returnTo}>
        ← {returnTo === '/admin' ? 'Resumen' : 'Pedidos'}
      </Link>
      <AdminPageHeader
        eyebrow={order.reference}
        title="Detalle del pedido"
        description="Consulta la compra y actualiza su preparación."
      />
      <dl className="admin-order-highlights" aria-label="Resumen del pedido">
        <div>
          <dt>Preparación</dt>
          <dd>
            <AdminBadge tone={orderStatus.tone}>{orderStatus.label}</AdminBadge>
          </dd>
        </div>
        <div>
          <dt>Pago</dt>
          <dd>
            <AdminBadge tone={paymentStatus.tone}>
              {paymentStatus.label}
            </AdminBadge>
          </dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>
            <strong>{formatPEN(order.totalCents)}</strong>
          </dd>
        </div>
        <div>
          <dt>Datos de envío</dt>
          <dd>{deliveryReady ? 'Completos' : 'Por completar'}</dd>
        </div>
      </dl>
      {!deliveryReady ? (
        <p className="admin-inline-warning" role="status">
          Faltan datos de contacto o ubicación. Complétalos antes de marcar el
          pedido como enviado o imprimir el resumen.
        </p>
      ) : null}
      <div className="admin-order-layout">
        <aside>
          <form onSubmit={saveStatus}>
            <OrderOperatorControl
              name={operatorName}
              onChange={setOperatorName}
              disabled={statusBusy || statusPersistenceError}
            />
            <label>
              Preparación del pedido
              <select
                value={status}
                disabled={statusBusy || statusPersistenceError}
                onChange={(event) => {
                  setStatusError('')
                  setStatus(event.target.value as AdminOrderStatus)
                }}
              >
                {orderStatusOrder
                  .filter(
                    (value) =>
                      Math.abs(
                        orderStatusOrder.indexOf(value) - currentStatusIndex,
                      ) <= 1,
                  )
                  .map((value) => (
                    <option key={value} value={value}>
                      {adminOrderStatusMeta[value].label}
                    </option>
                  ))}
              </select>
            </label>
            <button
              className="button button--primary"
              type="submit"
              disabled={
                statusBusy ||
                statusPersistenceError ||
                !canChangeStatus ||
                status === order.status
              }
            >
              {statusBusy ? 'Guardando…' : 'Guardar estado'}
            </button>
            {!canChangeStatus ? (
              <p className="admin-data-note">
                {order.paymentStatus !== 'approved'
                  ? 'El pedido debe tener el pago aprobado antes de avanzar.'
                  : 'Faltan datos de contacto y entrega para marcar el pedido como enviado.'}
              </p>
            ) : null}
            {statusBusy ? (
              <InlineStatus busy>Guardando estado…</InlineStatus>
            ) : null}
            {statusError ? (
              <p className="admin-form-error" role="alert">
                {statusError}
              </p>
            ) : null}
            <AdminSaveFeedback {...statusPersistence} />
          </form>
          <section aria-labelledby="admin-order-customer">
            <h2 id="admin-order-customer">Cliente</h2>
            <p>{order.customerName}</p>
            <p>
              {order.customerEmail === '—'
                ? 'Correo no disponible'
                : order.customerEmail}
            </p>
            <p>
              {!contactPhone || contactPhone === '—'
                ? 'Teléfono no disponible'
                : contactPhone}
            </p>
          </section>
          <section aria-labelledby="admin-order-payment">
            <h2 id="admin-order-payment">Pago</h2>
            <p>
              <AdminBadge tone={paymentStatus.tone}>
                {paymentStatus.label}
              </AdminBadge>
            </p>
            <p>Método indicado: Mercado Pago</p>
            <p>
              El estado del pago es informativo y no se modifica desde aquí.
            </p>
          </section>
        </aside>
        <div className="admin-order-primary">
          <section aria-labelledby="admin-order-products">
            <h2 id="admin-order-products">Productos</h2>
            <ul>
              {order.lines.map((line) => (
                <li key={line.variantId}>
                  <span>
                    <small>{formatBrandName(line.brand)}</small>
                    <strong>{line.name}</strong>
                    <small>
                      {variantLabel(line)} · Cant. {line.quantity}
                    </small>
                  </span>
                  <span>{formatPEN(line.unitPriceCents * line.quantity)}</span>
                </li>
              ))}
            </ul>
            <dl>
              <div>
                <dt>Subtotal</dt>
                <dd>{formatPEN(order.subtotalCents)}</dd>
              </div>
              {order.discountCents > 0 ? (
                <div>
                  <dt>
                    Descuento
                    {order.promotionCode ? ` · ${order.promotionCode}` : ''}
                  </dt>
                  <dd>−{formatPEN(order.discountCents)}</dd>
                </div>
              ) : null}
              <div>
                <dt>Envío</dt>
                <dd>{formatPEN(order.shippingCents)}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{formatPEN(order.totalCents)}</dd>
              </div>
            </dl>
          </section>
          <section
            className="admin-order-delivery-section"
            aria-labelledby="admin-order-delivery"
          >
            <h2 id="admin-order-delivery">Entrega</h2>
            <p>{deliveryMethod}</p>
            <p>
              {order.address.street === 'Dirección registrada'
                ? 'Dirección exacta no disponible'
                : order.address.street}
            </p>
            <p>
              {getPeruDistrictLabel(order.address.district)},{' '}
              {getPeruProvinceLabel(order.address.province)},{' '}
              {getPeruDepartmentLabel(order.address.department)}
            </p>
            {order.address.reference?.trim() ? (
              <p>Referencia: {order.address.reference}</p>
            ) : null}
            {order.alternateRecipient ? (
              <p>
                Recibe: {order.alternateRecipient.name} · DNI{' '}
                {order.alternateRecipient.dni}
              </p>
            ) : null}
            <button
              className={`admin-delivery-edit-button${!deliveryReady && !editingDelivery ? ' is-required' : ''}`}
              type="button"
              disabled={
                deliveryPersistence.saving ||
                deliveryPersistence.persistenceFailed
              }
              onClick={async () => {
                if (editingDelivery && dirtyDelivery) {
                  if (
                    !(await notice.confirm({
                      title: '¿Descartar los cambios de entrega?',
                      description:
                        'Se conservarán los datos de entrega guardados.',
                      confirmLabel: 'Descartar cambios',
                      cancelLabel: 'Seguir editando',
                      destructive: true,
                    }))
                  )
                    return
                  setDeliveryDraft(savedDeliveryDraft)
                }
                setEditingDelivery((open) => !open)
                setDeliveryError('')
              }}
            >
              {editingDelivery
                ? 'Cerrar edición'
                : deliveryReady
                  ? 'Editar datos de entrega'
                  : 'Completar datos de entrega'}
            </button>
            {editingDelivery ? (
              <form
                className="admin-delivery-editor"
                onSubmit={saveDelivery}
                aria-busy={deliveryPersistence.saving}
                inert={
                  deliveryPersistence.saving ||
                  deliveryPersistence.persistenceFailed
                }
              >
                <label>
                  Nombre del cliente
                  <input
                    required
                    minLength={2}
                    value={deliveryDraft.customerName}
                    onChange={(event) =>
                      setDeliveryDraft((current) => ({
                        ...current,
                        customerName: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Correo electrónico
                  <input
                    required
                    type="email"
                    value={deliveryDraft.customerEmail}
                    onChange={(event) =>
                      setDeliveryDraft((current) => ({
                        ...current,
                        customerEmail: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Teléfono
                  <input
                    required
                    type="tel"
                    value={deliveryDraft.phone}
                    onChange={(event) =>
                      setDeliveryDraft((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Dirección exacta
                  <input
                    required
                    minLength={5}
                    value={deliveryDraft.street}
                    onChange={(event) =>
                      setDeliveryDraft((current) => ({
                        ...current,
                        street: event.target.value,
                      }))
                    }
                  />
                </label>
                {historicDestination ? (
                  <p className="admin-data-note">
                    Este pedido conserva su destino histórico fuera de la
                    cobertura actual. Puedes actualizar el contacto y la
                    dirección exacta sin cambiar la ubicación.
                  </p>
                ) : (
                  <>
                    {state.shipping.provinceShippingEnabled ? (
                      <>
                        <label>
                          Departamento
                          <select
                            required
                            value={deliveryDraft.department}
                            onChange={(event) =>
                              setDeliveryDraft((current) => ({
                                ...current,
                                department: event.target.value,
                                province: '',
                                district: '',
                              }))
                            }
                          >
                            <option value="">Selecciona un departamento</option>
                            {peruDepartments.map((department) => (
                              <option
                                key={department.value}
                                value={department.value}
                              >
                                {department.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Provincia
                          <select
                            required
                            value={deliveryDraft.province}
                            disabled={!deliveryDraft.department}
                            onChange={(event) =>
                              setDeliveryDraft((current) => ({
                                ...current,
                                province: event.target.value,
                                district: '',
                              }))
                            }
                          >
                            <option value="">Selecciona una provincia</option>
                            {getPeruProvinceOptions(
                              deliveryDraft.department,
                            ).map((province) => (
                              <option
                                key={province.value}
                                value={province.value}
                              >
                                {province.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    ) : (
                      <label>
                        Zona de entrega
                        <select
                          required
                          value={selectedArea?.department ?? ''}
                          onChange={(event) => {
                            const area = getDeliveryArea(event.target.value)
                            setDeliveryDraft((current) => ({
                              ...current,
                              department: area?.department ?? '',
                              province: area?.province ?? '',
                              district: '',
                            }))
                          }}
                        >
                          <option value="">Selecciona una zona</option>
                          {deliveryAreas.map((area) => (
                            <option
                              key={area.department}
                              value={area.department}
                            >
                              {area.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <label>
                      Distrito
                      <select
                        required
                        value={deliveryDraft.district}
                        disabled={
                          state.shipping.provinceShippingEnabled
                            ? !deliveryDraft.province
                            : !selectedArea
                        }
                        onChange={(event) =>
                          setDeliveryDraft((current) => ({
                            ...current,
                            district: event.target.value,
                          }))
                        }
                      >
                        <option value="">Selecciona un distrito</option>
                        {getPeruDistrictOptions(
                          state.shipping.provinceShippingEnabled
                            ? deliveryDraft.province
                            : (selectedArea?.province ?? ''),
                        ).map((district) => (
                          <option key={district.value} value={district.value}>
                            {district.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <button
                  className="button button--secondary"
                  type="submit"
                  disabled={
                    deliveryPersistence.saving ||
                    deliveryPersistence.persistenceFailed
                  }
                  aria-busy={deliveryPersistence.saving}
                >
                  {deliveryPersistence.saving
                    ? 'Guardando…'
                    : 'Guardar datos de entrega'}
                </button>
              </form>
            ) : null}
            <AdminSaveFeedback {...deliveryPersistence} />
            {deliveryError ? (
              <p className="admin-form-error" role="alert">
                {deliveryError}
              </p>
            ) : null}
            <AdminShippingSummary order={order} legacyPhone={customer?.phone} />
          </section>
          <OrderHistory reference={orderReference} />
        </div>
      </div>
    </div>
  )
}

export function AdminCustomersPage() {
  const state = useAdminStore()
  const [search, setSearch] = useState('')
  const orderCountByCustomer = new Map<string, number>()
  const latestOrderByCustomer = new Map<string, AdminOrder>()
  state.orders.forEach((order) => {
    orderCountByCustomer.set(
      order.customerId,
      (orderCountByCustomer.get(order.customerId) ?? 0) + 1,
    )
    const latest = latestOrderByCustomer.get(order.customerId)
    if (!latest || Date.parse(order.placedAt) > Date.parse(latest.placedAt))
      latestOrderByCustomer.set(order.customerId, order)
  })
  const query = searchText(search)
  const customers = [...state.customers]
    .filter((customer) => {
      const address = latestOrderByCustomer.get(customer.id)?.address
      return (
        !query ||
        searchText(
          `${customer.name} ${customer.email} ${customer.phone} ${address?.province ? getPeruProvinceLabel(address.province) : ''} ${address?.district ? getPeruDistrictLabel(address.district) : ''}`,
        ).includes(query)
      )
    })
    .sort((first, second) => first.name.localeCompare(second.name, 'es'))
  const pagination = useAdminPagination(customers, 25)
  return (
    <div className="admin-page admin-customers-page">
      <AdminPageHeader
        eyebrow="Operación"
        title="Clientes"
        description="Consulta los clientes y su historial de pedidos."
      />
      <div className="admin-customer-toolbar">
        <label>
          Buscar cliente
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nombre, correo, celular o ubicación"
          />
        </label>
        <div className="admin-customer-result" role="status" aria-live="polite">
          {customers.length} {customers.length === 1 ? 'cliente' : 'clientes'}
          {search ? (
            <button type="button" onClick={() => setSearch('')}>
              Limpiar búsqueda
            </button>
          ) : null}
        </div>
      </div>
      {customers.length ? (
        <p className="admin-customers-location-note">
          La provincia y el distrito corresponden al pedido más reciente de cada
          cliente.
        </p>
      ) : null}
      {customers.length ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="sr-only">Clientes</caption>
            <thead>
              <tr>
                <th scope="col">Cliente</th>
                <th scope="col">Correo</th>
                <th scope="col">Celular</th>
                <th scope="col">Provincia</th>
                <th scope="col">Distrito</th>
                <th scope="col">Pedidos</th>
              </tr>
            </thead>
            <tbody>
              {pagination.items.map((customer) => {
                const address = latestOrderByCustomer.get(customer.id)?.address
                return (
                  <tr key={customer.id}>
                    <th scope="row">
                      <span className="admin-cell-label">Cliente</span>
                      {customer.name}
                    </th>
                    <td>
                      <span className="admin-cell-label">Correo</span>
                      {customer.email}
                    </td>
                    <td>
                      <span className="admin-cell-label">Celular</span>
                      {customer.phone}
                    </td>
                    <td>
                      <span className="admin-cell-label">Provincia</span>
                      {address?.province
                        ? getPeruProvinceLabel(address.province)
                        : '—'}
                    </td>
                    <td>
                      <span className="admin-cell-label">Distrito</span>
                      {address?.district
                        ? getPeruDistrictLabel(address.district)
                        : '—'}
                    </td>
                    <td>
                      <span className="admin-cell-label">Pedidos</span>
                      <span className="admin-customer-orders">
                        <strong>
                          {orderCountByCustomer.get(customer.id) ?? 0}
                        </strong>
                        {(orderCountByCustomer.get(customer.id) ?? 0) > 0 ? (
                          <Link
                            to={`/admin/pedidos?cliente=${encodeURIComponent(customer.id)}`}
                            aria-label={`Ver pedidos de ${customer.name}`}
                          >
                            Ver pedidos
                          </Link>
                        ) : null}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {!customers.length ? (
        <EmptyState
          className="admin-empty admin-operations-empty"
          icon={query ? 'search' : 'user'}
          title={query ? 'No encontramos clientes' : 'Aún no hay clientes'}
          description={
            query
              ? 'Prueba con otro nombre, correo, celular o ubicación.'
              : 'Los clientes aparecerán después de completar una compra.'
          }
        >
          {query ? (
            <button type="button" onClick={() => setSearch('')}>
              Limpiar búsqueda
            </button>
          ) : null}
        </EmptyState>
      ) : null}
      <AdminPagination
        label="clientes"
        page={pagination.page}
        totalPages={pagination.totalPages}
        totalItems={pagination.totalItems}
        from={pagination.from}
        to={pagination.to}
        onPageChange={pagination.setPage}
      />
    </div>
  )
}

function createPromotionDraft(): AdminPromotion {
  return {
    id: `promo-${crypto.randomUUID().slice(0, 8)}`,
    code: '',
    active: false,
    type: 'percent',
    value: 10,
    minimumCents: 0,
    startsAt: '',
    endsAt: '',
    usageLimit: null,
    used: 0,
  }
}

function AdminPromotionCodesPage() {
  const notice = useAdminNotice()
  const state = useAdminStore()
  const [form, setForm] = useState<AdminPromotion | null>(null)
  const [originalForm, setOriginalForm] = useState<AdminPromotion | null>(null)
  const [error, setError] = useState('')
  const editorHeadingRef = useRef<HTMLHeadingElement>(null)
  const persistence = useAdminSave()
  const promotions = [...state.promotions].sort((first, second) =>
    first.code.localeCompare(second.code),
  )
  const pagination = useAdminPagination(promotions, 10)
  const dirty = Boolean(
    form &&
    originalForm &&
    JSON.stringify(form) !== JSON.stringify(originalForm),
  )
  useUnsavedChanges(
    dirty || persistence.saving || persistence.persistenceFailed,
  )

  function openEditor(nextForm: AdminPromotion) {
    setError('')
    setForm(nextForm)
    setOriginalForm(nextForm)
    window.requestAnimationFrame(() => editorHeadingRef.current?.focus())
  }

  async function closeEditor() {
    if (
      dirty &&
      !(await notice.confirm({
        title: '¿Descartar los cambios de la promoción?',
        description: 'El código conservará su última configuración guardada.',
        confirmLabel: 'Descartar cambios',
        cancelLabel: 'Seguir editando',
        destructive: true,
      }))
    )
      return
    setForm(null)
    setOriginalForm(null)
    setError('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form) return
    setError('')
    const result = await persistence.save(
      () => adminService.savePromotion(form),
      () => {
        notice.toast('Promoción guardada.')
        setForm(null)
        setOriginalForm(null)
      },
    )
    if (!result) return
    if (result.kind === 'validation') {
      setError(result.message)
      return
    }
  }

  async function togglePromotion(promotion: AdminPromotion) {
    if (persistence.saving || persistence.persistenceFailed) return
    if (
      promotion.active &&
      !(await notice.confirm({
        title: `¿Desactivar ${promotion.code}?`,
        description:
          'El código dejará de aplicarse a las nuevas compras. Los pedidos anteriores se conservarán.',
        confirmLabel: 'Desactivar código',
        destructive: true,
      }))
    )
      return
    setError('')
    const result = await persistence.save(
      () => adminService.setPromotionActive(promotion.id, !promotion.active),
      () =>
        notice.toast(
          `Promoción ${promotion.code} ${promotion.active ? 'desactivada' : 'activada'}.`,
        ),
    )
    if (result?.kind === 'validation') setError(result.message)
  }

  return (
    <section className="admin-promotions-codes" aria-label="Cupones">
      {!form ? (
        <div className="admin-list-toolbar">
          <p>
            {state.promotions.length}{' '}
            {state.promotions.length === 1 ? 'promoción' : 'promociones'}
          </p>
          <button
            className="button button--primary"
            type="button"
            disabled={persistence.saving || persistence.persistenceFailed}
            onClick={() => openEditor(createPromotionDraft())}
          >
            Nueva promoción
          </button>
        </div>
      ) : null}
      {form ? (
        <form
          className="admin-editor admin-promotion-form"
          onSubmit={submit}
          aria-busy={persistence.saving}
          inert={persistence.saving || persistence.persistenceFailed}
        >
          <section aria-labelledby="promotion-editor-title">
            <header>
              <span>01</span>
              <div>
                <h2
                  id="promotion-editor-title"
                  ref={editorHeadingRef}
                  tabIndex={-1}
                >
                  {state.promotions.some((item) => item.id === form.id)
                    ? 'Editar promoción'
                    : 'Nueva promoción'}
                </h2>
                <p>Las fechas son opcionales si la vigencia no tiene límite.</p>
              </div>
            </header>
            <div className="admin-fields">
              <label>
                Código
                <input
                  value={form.code}
                  autoCapitalize="characters"
                  autoComplete="off"
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            code: event.target.value.toUpperCase(),
                          }
                        : current,
                    )
                  }
                  required
                />
              </label>
              <label>
                Tipo
                <select
                  value={form.type}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            type: event.target.value as AdminPromotion['type'],
                          }
                        : current,
                    )
                  }
                >
                  <option value="percent">Porcentaje</option>
                  <option value="fixed">Monto fijo</option>
                </select>
              </label>
              <label>
                {form.type === 'percent' ? 'Descuento (%)' : 'Monto (S/)'}
                <input
                  type="number"
                  min="0.01"
                  max={form.type === 'percent' ? '100' : undefined}
                  step="0.01"
                  value={form.value}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? { ...current, value: Number(event.target.value) }
                        : current,
                    )
                  }
                  required
                />
              </label>
              <label>
                Compra mínima (S/)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minimumCents / 100}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            minimumCents: Math.round(
                              Number(event.target.value) * 100,
                            ),
                          }
                        : current,
                    )
                  }
                />
              </label>
              <label>
                Inicio
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? { ...current, startsAt: event.target.value }
                        : current,
                    )
                  }
                />
              </label>
              <label>
                Final
                <input
                  type="datetime-local"
                  min={form.startsAt || undefined}
                  value={form.endsAt}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? { ...current, endsAt: event.target.value }
                        : current,
                    )
                  }
                />
              </label>
              <label>
                Límite de usos
                <input
                  type="number"
                  min="1"
                  value={form.usageLimit ?? ''}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            usageLimit: event.target.value
                              ? Number(event.target.value)
                              : null,
                          }
                        : current,
                    )
                  }
                  placeholder="Sin límite"
                />
              </label>
              <label className="admin-check">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? { ...current, active: event.target.checked }
                        : current,
                    )
                  }
                />
                Promoción activa
              </label>
            </div>
            {error ? (
              <p className="admin-form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="admin-inline-actions">
              <button
                className="button button--primary"
                type="submit"
                disabled={persistence.saving || persistence.persistenceFailed}
                aria-busy={persistence.saving}
              >
                {persistence.saving ? 'Guardando…' : 'Guardar promoción'}
              </button>
              <button
                type="button"
                onClick={() => void closeEditor()}
                disabled={persistence.saving || persistence.persistenceFailed}
              >
                Cancelar
              </button>
            </div>
          </section>
        </form>
      ) : null}
      <AdminSaveFeedback {...persistence} />
      {!promotions.length && !form ? (
        <EmptyState
          className="admin-empty admin-operations-empty"
          icon="percent"
          title="Aún no hay códigos"
          description="Crea un código cuando tengas una campaña o descuento para ofrecer."
        />
      ) : null}
      <ul className="admin-promotion-list">
        {pagination.items.map((promotion) => {
          const status = getPromotionStatus(promotion)
          const tone =
            status.label === 'Aplicable'
              ? 'success'
              : status.label === 'Programada'
                ? 'info'
                : status.label === 'Vencida' ||
                    status.label === 'Límite alcanzado'
                  ? 'danger'
                  : 'neutral'
          return (
            <li key={promotion.id}>
              <div>
                <strong>{promotion.code}</strong>
                <span>
                  {promotion.type === 'percent'
                    ? `${promotion.value} %`
                    : formatPEN(promotion.value * 100)}{' '}
                  {promotion.minimumCents > 0
                    ? ` · compra mínima ${formatPEN(promotion.minimumCents)}`
                    : ''}
                </span>
                <small>
                  {promotion.startsAt || promotion.endsAt
                    ? `Vigencia: ${promotion.startsAt ? formatShortDate(promotion.startsAt) : 'sin inicio'} – ${promotion.endsAt ? formatShortDate(promotion.endsAt) : 'sin final'}`
                    : 'Sin fechas de vigencia'}
                  {promotion.usageLimit !== null
                    ? ` · ${promotion.used}/${promotion.usageLimit} usos`
                    : promotion.used > 0
                      ? ` · ${promotion.used} usos`
                      : ''}
                </small>
              </div>
              <AdminBadge tone={tone}>{status.label}</AdminBadge>
              <div className="admin-row-actions">
                <button
                  type="button"
                  disabled={persistence.saving || persistence.persistenceFailed}
                  onClick={() => openEditor({ ...promotion })}
                  aria-label={`Editar ${promotion.code}`}
                >
                  Editar
                </button>
                <button
                  type="button"
                  disabled={persistence.saving || persistence.persistenceFailed}
                  onClick={() => void togglePromotion(promotion)}
                  className={
                    promotion.active ? 'admin-action-danger' : undefined
                  }
                  aria-label={`${promotion.active ? 'Desactivar' : 'Activar'} ${promotion.code}`}
                >
                  {promotion.active ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
      <AdminPagination
        label="promociones"
        page={pagination.page}
        totalPages={pagination.totalPages}
        totalItems={pagination.totalItems}
        from={pagination.from}
        to={pagination.to}
        onPageChange={pagination.setPage}
      />
    </section>
  )
}

export function AdminPromotionsPage() {
  const [params, setParams] = useSearchParams()
  const view = params.get('vista') === 'ofertas' ? 'ofertas' : 'codigos'
  const codesTabRef = useRef<HTMLButtonElement>(null)
  const offersTabRef = useRef<HTMLButtonElement>(null)
  const focusAfterNavigation = useRef<'codigos' | 'ofertas' | null>(null)

  useEffect(() => {
    if (focusAfterNavigation.current !== view) return
    const frame = window.requestAnimationFrame(() => {
      if (view === 'codigos') codesTabRef.current?.focus()
      else offersTabRef.current?.focus()
      focusAfterNavigation.current = null
    })
    return () => window.cancelAnimationFrame(frame)
  }, [view])

  function setView(nextView: 'ofertas' | 'codigos') {
    focusAfterNavigation.current = nextView
    const next = new URLSearchParams(params)
    if (nextView === 'ofertas') next.set('vista', 'ofertas')
    else next.delete('vista')
    setParams(next)
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const nextView =
      event.key === 'Home'
        ? 'codigos'
        : event.key === 'End'
          ? 'ofertas'
          : view === 'codigos'
            ? 'ofertas'
            : 'codigos'
    setView(nextView)
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Gestión comercial"
        title="Promociones"
        description="Gestiona ofertas de productos y códigos de descuento."
      />
      <div
        className="admin-promotion-tabs"
        role="tablist"
        aria-label="Tipo de promoción"
      >
        <button
          ref={codesTabRef}
          type="button"
          id="admin-promotion-codes-tab"
          role="tab"
          aria-selected={view === 'codigos'}
          aria-controls="admin-promotion-codes-panel"
          tabIndex={view === 'codigos' ? 0 : -1}
          onKeyDown={handleTabKeyDown}
          onClick={() => setView('codigos')}
        >
          Cupones
        </button>
        <button
          ref={offersTabRef}
          type="button"
          id="admin-promotion-offers-tab"
          role="tab"
          aria-selected={view === 'ofertas'}
          aria-controls="admin-promotion-offers-panel"
          tabIndex={view === 'ofertas' ? 0 : -1}
          onKeyDown={handleTabKeyDown}
          onClick={() => setView('ofertas')}
        >
          Ofertas de productos
        </button>
      </div>
      <div
        id="admin-promotion-codes-panel"
        role="tabpanel"
        aria-labelledby="admin-promotion-codes-tab"
        hidden={view !== 'codigos'}
        tabIndex={0}
      >
        {view === 'codigos' ? <AdminPromotionCodesPage /> : null}
      </div>
      <div
        id="admin-promotion-offers-panel"
        role="tabpanel"
        aria-labelledby="admin-promotion-offers-tab"
        hidden={view !== 'ofertas'}
        tabIndex={0}
      >
        {view === 'ofertas' ? <AdminProductOffers /> : null}
      </div>
    </div>
  )
}
