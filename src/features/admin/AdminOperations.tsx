import { formatBrandName } from '../../utils/brand-name'
import './admin-operations.css'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import {
  getPeruDepartmentLabel,
  getPeruDistrictLabel,
  getPeruDistrictOptions,
  getPeruProvinceLabel,
  getPeruProvinceOptions,
  peruDepartments,
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
import {
  AdminBadge,
  AdminNotice,
  AdminPageHeader,
  AdminStatus,
} from './AdminShared'
import {
  adminOrderStatusMeta,
  adminPaymentStatusMeta,
  getPromotionStatus,
} from './admin-utils'
import { useAdminPagination } from './useAdminPagination'
import { useAdminStore } from './useAdminStore'
import { useUnsavedChanges } from './useUnsavedChanges'
import { AdminShippingSummary } from './AdminShippingSummary'

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
  const state = useAdminStore()
  const [form, setForm] = useState<AdminBrand | null>(null)
  const [originalForm, setOriginalForm] = useState<AdminBrand | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const editorHeadingRef = useRef<HTMLHeadingElement>(null)
  const pagination = useAdminPagination(state.brands, 12)
  const dirty = Boolean(
    form &&
    originalForm &&
    JSON.stringify(form) !== JSON.stringify(originalForm),
  )
  useUnsavedChanges(dirty)

  function openEditor(brand: AdminBrand) {
    setError('')
    setActionError('')
    setMessage('')
    setForm(brand)
    setOriginalForm(brand)
    window.requestAnimationFrame(() => editorHeadingRef.current?.focus())
  }

  function closeEditor() {
    if (dirty && !window.confirm('¿Descartar los cambios de esta marca?'))
      return
    setForm(null)
    setOriginalForm(null)
    setError('')
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form) return
    const result = adminService.saveBrand(form)
    if (result.kind === 'validation') {
      setError(result.message)
      return
    }
    setError('')
    setForm(null)
    setOriginalForm(null)
    setMessage('Marca guardada.')
  }

  function toggle(brand: AdminBrand) {
    const result = adminService.setBrandActive(brand.id, !brand.active)
    if (result.kind === 'saved') {
      setActionError('')
      setMessage(`Marca ${brand.active ? 'desactivada' : 'activada'}.`)
    } else {
      setMessage('')
      setActionError(result.message)
    }
  }

  return (
    <div className="admin-page admin-brands-page">
      <AdminPageHeader
        eyebrow="Organización del surtido"
        title="Marcas"
        description="Crea, edita y controla las marcas disponibles en la tienda."
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
        <form className="admin-compact-form" onSubmit={save}>
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
            <button className="button button--primary" type="submit">
              Guardar marca
            </button>
            <button type="button" onClick={closeEditor}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
      <AdminNotice>{message}</AdminNotice>
      {actionError ? (
        <p className="admin-form-error" role="alert">
          {actionError}
        </p>
      ) : null}
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
                  <span className="admin-cell-label">URL</span>/{brand.slug}
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
                      onClick={() => openEditor({ ...brand })}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className={
                        brand.active ? 'admin-action-danger' : undefined
                      }
                      onClick={() => toggle(brand)}
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
      {!state.brands.length && !form ? (
        <div className="admin-empty admin-operations-empty">
          <h2>Aún no hay marcas</h2>
          <p>Crea la primera marca para organizar el catálogo.</p>
        </div>
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

const orderStatusOrder: AdminOrderStatus[] = [
  'received',
  'preparing',
  'shipped',
  'delivered',
]

export function AdminOrdersPage() {
  const state = useAdminStore()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [quickMessage, setQuickMessage] = useState('')
  const [quickError, setQuickError] = useState('')
  const search = params.get('q') ?? ''
  const customerFilter = params.get('cliente') ?? ''
  const selectedCustomer = state.customers.find(
    (customer) => customer.id === customerFilter,
  )
  const preparationFilter = [
    'received',
    'preparing',
    'shipped',
    'delivered',
    'atencion',
  ].includes(params.get('preparacion') ?? '')
    ? params.get('preparacion')!
    : 'all'
  const normalizedSearch = search.trim().toLocaleLowerCase('es')
  const orders = [...state.orders]
    .filter((order) => {
      const matchesSearch =
        `${order.reference} ${order.customerName} ${order.customerEmail} ${order.contactPhone ?? ''} ${getPeruDistrictLabel(order.address.district)} ${getPeruProvinceLabel(order.address.province)}`
          .toLocaleLowerCase('es')
          .includes(normalizedSearch)
      const matchesPreparation =
        preparationFilter === 'all' ||
        (preparationFilter === 'atencion' &&
          ['received', 'preparing'].includes(order.status)) ||
        order.status === preparationFilter
      return (
        matchesSearch &&
        matchesPreparation &&
        (!customerFilter || order.customerId === customerFilter)
      )
    })
    .sort(
      (first, second) =>
        new Date(second.placedAt).getTime() -
          new Date(first.placedAt).getTime() ||
        first.reference.localeCompare(second.reference),
    )
  const pagination = useAdminPagination(orders, 20)
  const hasFilters =
    Boolean(search) || Boolean(customerFilter) || preparationFilter !== 'all'

  function advanceOrder(order: AdminOrder, nextStatus: AdminOrderStatus) {
    if (
      (nextStatus === 'shipped' || nextStatus === 'delivered') &&
      !window.confirm(
        nextStatus === 'shipped'
          ? `¿Confirmas que el pedido ${order.reference} ya fue enviado?`
          : `¿Confirmas que el pedido ${order.reference} ya fue entregado?`,
      )
    )
      return
    const result = adminService.setOrderStatus(order.reference, nextStatus)
    if (result.kind === 'saved') {
      setQuickError('')
      setQuickMessage(
        `Pedido ${order.reference}: ${adminOrderStatusMeta[nextStatus].label.toLowerCase()}.`,
      )
    } else {
      setQuickMessage('')
      setQuickError(result.message)
    }
  }

  return (
    <div className="admin-page admin-orders-page">
      <AdminPageHeader
        eyebrow="Operación"
        title="Pedidos"
        description="Gestiona los pedidos confirmados hasta su entrega."
      />
      <section className="admin-order-summary" aria-label="Resumen de pedidos">
        {(
          [
            ['received', 'Nuevos', 'info'],
            ['preparing', 'En preparación', 'warning'],
            ['shipped', 'Enviados', 'info'],
            ['delivered', 'Entregados', 'success'],
          ] as const
        ).map(([status, label, tone]) => (
          <Link
            key={status}
            to={`/admin/pedidos?preparacion=${status}`}
            aria-current={preparationFilter === status ? 'page' : undefined}
          >
            <AdminBadge tone={tone}>{label}</AdminBadge>
            <strong>
              {state.orders.filter((order) => order.status === status).length}
            </strong>
          </Link>
        ))}
      </section>
      <form
        className="admin-filter-bar"
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          const data = new FormData(event.currentTarget)
          const next = new URLSearchParams()
          const query = data.get('q')?.toString().trim()
          const preparation = data.get('preparacion')?.toString()
          const customerId = data.get('cliente')?.toString()
          if (query) next.set('q', query)
          if (preparation && preparation !== 'all')
            next.set('preparacion', preparation)
          if (customerId) next.set('cliente', customerId)
          setParams(next)
          setQuickMessage('')
          setQuickError('')
        }}
      >
        {customerFilter ? (
          <input type="hidden" name="cliente" value={customerFilter} />
        ) : null}
        <div className="admin-filter-fields">
          <label>
            Buscar
            <input
              name="q"
              key={search}
              type="search"
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
              {orderStatusOrder.map((status) => (
                <option key={status} value={status}>
                  {adminOrderStatusMeta[status].label}
                </option>
              ))}
            </select>
          </label>
          <button className="button button--primary" type="submit">
            <Icon name="search" /> Aplicar filtros
          </button>
        </div>
        <div className="admin-filter-result" aria-live="polite">
          <span>
            {orders.length} {orders.length === 1 ? 'pedido' : 'pedidos'}
            {selectedCustomer ? ` de ${selectedCustomer.name}` : ''}
          </span>
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setParams({})
                setQuickMessage('')
                setQuickError('')
              }}
            >
              Limpiar filtros
            </button>
          ) : null}
        </div>
      </form>
      <AdminNotice>{quickMessage}</AdminNotice>
      {quickError ? (
        <p className="admin-form-error" role="alert">
          {quickError}
        </p>
      ) : null}
      <div className="admin-table-wrap">
        <table className="admin-table admin-table--orders">
          <caption className="sr-only">Pedidos</caption>
          <thead>
            <tr>
              <th scope="col">Código</th>
              <th scope="col">Cliente</th>
              <th scope="col">Fecha</th>
              <th scope="col">Pago</th>
              <th scope="col">Preparación</th>
              <th scope="col">Total</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pagination.items.map((order) => {
              const orderStatus = adminOrderStatusMeta[order.status]
              const paymentStatus = adminPaymentStatusMeta[order.paymentStatus]
              const currentIndex = orderStatusOrder.indexOf(order.status)
              const nextStatus = orderStatusOrder[currentIndex + 1]
              const canAdvance = order.paymentStatus === 'approved'
              const customer = state.customers.find(
                (item) => item.id === order.customerId,
              )
              const deliveryReady = hasCompleteOrderDelivery(
                order,
                customer?.phone,
              )
              return (
                <tr key={order.reference}>
                  <th scope="row">
                    <span className="admin-cell-label">Código</span>
                    <span className="admin-order-reference">
                      {order.reference}
                    </span>
                  </th>
                  <td>
                    <span className="admin-cell-label">Cliente</span>
                    <span>
                      {order.customerName}
                      {deliveryReady ? (
                        <small className="admin-order-destination">
                          {getPeruDistrictLabel(order.address.district)},{' '}
                          {getPeruProvinceLabel(order.address.province)}
                          {(order.contactPhone ?? customer?.phone)
                            ? ` · ${order.contactPhone ?? customer?.phone}`
                            : ''}
                        </small>
                      ) : null}
                      {!deliveryReady ? (
                        <small className="admin-data-gap">
                          Datos de entrega pendientes
                        </small>
                      ) : null}
                    </span>
                  </td>
                  <td>
                    <span className="admin-cell-label">Fecha</span>
                    {new Intl.DateTimeFormat('es-PE').format(
                      new Date(order.placedAt),
                    )}
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
                  <td>
                    <span className="admin-cell-label">Acciones</span>
                    <div className="admin-row-actions">
                      <Link
                        to={`/admin/pedidos/${order.reference}`}
                        aria-label={`Ver ${order.reference}`}
                        state={{
                          returnTo: `${location.pathname}${location.search}`,
                        }}
                      >
                        Ver detalle
                      </Link>
                      {nextStatus &&
                      canAdvance &&
                      (nextStatus !== 'shipped' || deliveryReady) ? (
                        <button
                          type="button"
                          className="admin-order-next-action"
                          onClick={() => advanceOrder(order, nextStatus)}
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
      <AdminPagination
        label="pedidos"
        page={pagination.page}
        totalPages={pagination.totalPages}
        totalItems={pagination.totalItems}
        from={pagination.from}
        to={pagination.to}
        onPageChange={pagination.setPage}
      />
      {!orders.length ? (
        <div className="admin-empty">
          <Icon name="search" />
          <h2>
            {hasFilters ? 'No encontramos pedidos' : 'Aún no hay pedidos'}
          </h2>
          <p>
            {hasFilters
              ? 'Prueba con otros filtros o limpia la búsqueda.'
              : 'Los pedidos confirmados aparecerán aquí.'}
          </p>
          {hasFilters ? (
            <button type="button" onClick={() => setParams({})}>
              Limpiar filtros
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function AdminOrderDetailPage() {
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
  const [saved, setSaved] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [editingDelivery, setEditingDelivery] = useState(false)
  const [deliveryMessage, setDeliveryMessage] = useState('')
  const [deliveryError, setDeliveryError] = useState('')
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
  useUnsavedChanges(dirtyDelivery)
  if (!order)
    return (
      <div className="admin-page admin-empty">
        <h1>Pedido no encontrado</h1>
        <Link to="/admin/pedidos">Volver a pedidos</Link>
      </div>
    )
  const customer = state.customers.find((item) => item.id === order.customerId)
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

  function saveStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canChangeStatus || status === persistedStatus) return
    if (
      selectedStatusIndex < currentStatusIndex &&
      !window.confirm('¿Confirmas que deseas retroceder el estado del pedido?')
    )
      return
    const result = adminService.setOrderStatus(orderReference, status)
    setStatusError(result.kind === 'validation' ? result.message : '')
    setSaved(result.kind === 'saved')
  }

  function saveDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = adminService.saveOrderDelivery(orderReference, deliveryDraft)
    if (result.kind === 'saved') {
      setDeliveryError('')
      setDeliveryMessage('Datos de entrega guardados.')
      setSavedDeliveryDraft(deliveryDraft)
      setEditingDelivery(false)
    } else {
      setDeliveryMessage('')
      setDeliveryError(result.message)
    }
  }

  return (
    <div className="admin-page admin-page--order-detail">
      <Link className="admin-back" to={returnTo}>
        ← {returnTo === '/admin' ? 'Resumen' : 'Pedidos'}
      </Link>
      <AdminPageHeader
        eyebrow={order.reference}
        title="Detalle del pedido"
        description="Productos, pago, entrega y preparación en una sola vista."
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
            <label>
              Preparación del pedido
              <select
                value={status}
                onChange={(event) => {
                  setSaved(false)
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
              disabled={!canChangeStatus || status === order.status}
            >
              Guardar estado
            </button>
            {!canChangeStatus ? (
              <p className="admin-data-note">
                {order.paymentStatus !== 'approved'
                  ? 'El pedido debe tener el pago aprobado antes de avanzar.'
                  : 'Faltan datos de contacto y entrega para marcar el pedido como enviado.'}
              </p>
            ) : null}
            <AdminNotice>{saved ? 'Estado actualizado.' : ''}</AdminNotice>
            {statusError ? (
              <p className="admin-form-error" role="alert">
                {statusError}
              </p>
            ) : null}
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
                      {line.ml} ml · Cant. {line.quantity}
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
          <section aria-labelledby="admin-order-delivery">
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
              className="admin-delivery-edit-button"
              type="button"
              onClick={() => {
                if (editingDelivery && dirtyDelivery) {
                  if (
                    !window.confirm(
                      '¿Cerrar sin guardar los cambios de entrega?',
                    )
                  )
                    return
                  setDeliveryDraft(savedDeliveryDraft)
                }
                setEditingDelivery((open) => !open)
                setDeliveryMessage('')
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
              <form className="admin-delivery-editor" onSubmit={saveDelivery}>
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
                      <option key={department.value} value={department.value}>
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
                    {getPeruProvinceOptions(deliveryDraft.department).map(
                      (province) => (
                        <option key={province.value} value={province.value}>
                          {province.label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Distrito
                  <select
                    required
                    value={deliveryDraft.district}
                    disabled={!deliveryDraft.province}
                    onChange={(event) =>
                      setDeliveryDraft((current) => ({
                        ...current,
                        district: event.target.value,
                      }))
                    }
                  >
                    <option value="">Selecciona un distrito</option>
                    {getPeruDistrictOptions(deliveryDraft.province).map(
                      (district) => (
                        <option key={district.value} value={district.value}>
                          {district.label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <button className="button button--secondary" type="submit">
                  Guardar datos de entrega
                </button>
              </form>
            ) : null}
            <AdminNotice>{deliveryMessage}</AdminNotice>
            {deliveryError ? (
              <p className="admin-form-error" role="alert">
                {deliveryError}
              </p>
            ) : null}
            <AdminShippingSummary order={order} legacyPhone={customer?.phone} />
          </section>
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
  const query = search.trim().toLocaleLowerCase('es')
  const customers = [...state.customers]
    .filter((customer) => {
      const address = latestOrderByCustomer.get(customer.id)?.address
      return (
        !query ||
        `${customer.name} ${customer.email} ${customer.phone} ${address?.province ? getPeruProvinceLabel(address.province) : ''} ${address?.district ? getPeruDistrictLabel(address.district) : ''}`
          .toLocaleLowerCase('es')
          .includes(query)
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
      {!customers.length ? (
        <div className="admin-empty admin-operations-empty">
          <h2>{query ? 'No encontramos clientes' : 'Aún no hay clientes'}</h2>
          <p>
            {query
              ? 'Prueba con otro nombre, correo, celular o ubicación.'
              : 'Los clientes aparecerán después de completar una compra.'}
          </p>
        </div>
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

export function AdminPromotionsPage() {
  const state = useAdminStore()
  const [form, setForm] = useState<AdminPromotion | null>(null)
  const [originalForm, setOriginalForm] = useState<AdminPromotion | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const editorHeadingRef = useRef<HTMLHeadingElement>(null)
  const promotions = [...state.promotions].sort((first, second) =>
    first.code.localeCompare(second.code),
  )
  const pagination = useAdminPagination(promotions, 10)
  const dirty = Boolean(
    form &&
    originalForm &&
    JSON.stringify(form) !== JSON.stringify(originalForm),
  )
  useUnsavedChanges(dirty)

  function openEditor(nextForm: AdminPromotion) {
    setMessage('')
    setError('')
    setForm(nextForm)
    setOriginalForm(nextForm)
    window.requestAnimationFrame(() => editorHeadingRef.current?.focus())
  }

  function closeEditor() {
    if (dirty && !window.confirm('¿Descartar los cambios de la promoción?'))
      return
    setForm(null)
    setOriginalForm(null)
    setError('')
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form) return
    const result = adminService.savePromotion(form)
    if (result.kind === 'validation') {
      setError(result.message)
      return
    }
    setError('')
    setMessage('Promoción guardada.')
    setForm(null)
    setOriginalForm(null)
  }

  function togglePromotion(promotion: AdminPromotion) {
    if (
      promotion.active &&
      !window.confirm(
        `¿Desactivar ${promotion.code}? El código dejará de aplicarse en la tienda.`,
      )
    )
      return
    adminService.setPromotionActive(promotion.id, !promotion.active)
    setMessage(
      `Promoción ${promotion.code} ${promotion.active ? 'desactivada' : 'activada'}.`,
    )
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Códigos y descuentos"
        title="Promociones"
        description="Administra códigos, vigencia y límites de uso desde una lista compacta."
      />
      {!form ? (
        <div className="admin-list-toolbar">
          <p>
            {state.promotions.length}{' '}
            {state.promotions.length === 1 ? 'promoción' : 'promociones'}
          </p>
          <button
            className="button button--primary"
            type="button"
            onClick={() => openEditor(createPromotionDraft())}
          >
            Nueva promoción
          </button>
        </div>
      ) : null}
      {form ? (
        <form className="admin-editor admin-promotion-form" onSubmit={submit}>
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
              <button className="button button--primary" type="submit">
                Guardar promoción
              </button>
              <button type="button" onClick={closeEditor}>
                Cancelar
              </button>
            </div>
          </section>
        </form>
      ) : null}
      <AdminNotice>{message}</AdminNotice>
      {!promotions.length && !form ? (
        <div className="admin-empty admin-operations-empty">
          <h2>Aún no hay códigos</h2>
          <p>
            Crea un código solo cuando tengas una campaña o descuento para
            ofrecer.
          </p>
        </div>
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
                  · mínimo {formatPEN(promotion.minimumCents)}
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
                  onClick={() => openEditor({ ...promotion })}
                  aria-label={`Editar ${promotion.code}`}
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => togglePromotion(promotion)}
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
    </div>
  )
}
