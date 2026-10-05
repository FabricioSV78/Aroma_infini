import { formatBrandName } from '../../utils/brand-name'
import './admin-operations.css'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import {
  adminService,
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

function hasDeliveryDetails(order: AdminOrder, phone?: string) {
  return Boolean(
    order.customerEmail &&
    order.customerEmail !== '—' &&
    phone &&
    phone !== '—' &&
    order.address.street &&
    order.address.street !== 'Dirección registrada',
  )
}

export function AdminBrandsPage() {
  const state = useAdminStore()
  const [form, setForm] = useState<AdminBrand | null>(null)
  const [message, setMessage] = useState('')
  const pagination = useAdminPagination(state.brands, 12)

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form) return
    const result = adminService.saveBrand(form)
    if (result.kind === 'validation') {
      setMessage(result.message)
      return
    }
    setForm(null)
    setMessage('Marca guardada durante esta sesión.')
  }

  function toggle(brand: AdminBrand) {
    const result = adminService.setBrandActive(brand.id, !brand.active)
    setMessage(
      result.kind === 'saved'
        ? `Marca ${brand.active ? 'desactivada' : 'activada'}.`
        : result.message,
    )
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
              setMessage('')
              setForm({
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
            <h2>
              {state.brands.some((brand) => brand.id === form.id)
                ? 'Editar marca'
                : 'Nueva marca'}
            </h2>
            <p>Nombre y dirección visible en la tienda.</p>
          </header>
          <div className="admin-inline-fields">
            <label>
              Nombre
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) =>
                    current
                      ? { ...current, name: event.target.value }
                      : current,
                  )
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
                required
              />
            </label>
          </div>
          <div className="admin-inline-actions">
            <button className="button button--primary" type="submit">
              Guardar marca
            </button>
            <button type="button" onClick={() => setForm(null)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}
      <AdminNotice>{message}</AdminNotice>
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
                      onClick={() => {
                        setMessage('')
                        setForm({ ...brand })
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
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
  const search = params.get('q') ?? ''
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
        `${order.reference} ${order.customerName} ${order.customerEmail}`
          .toLocaleLowerCase('es')
          .includes(normalizedSearch)
      const matchesPreparation =
        preparationFilter === 'all' ||
        (preparationFilter === 'atencion' &&
          ['received', 'preparing'].includes(order.status)) ||
        order.status === preparationFilter
      return matchesSearch && matchesPreparation
    })
    .sort(
      (first, second) =>
        new Date(second.placedAt).getTime() -
          new Date(first.placedAt).getTime() ||
        first.reference.localeCompare(second.reference),
    )
  const pagination = useAdminPagination(orders, 20)
  const hasFilters = Boolean(search) || preparationFilter !== 'all'
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
          <Link key={status} to={`/admin/pedidos?preparacion=${status}`}>
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
          if (query) next.set('q', query)
          if (preparation && preparation !== 'all')
            next.set('preparacion', preparation)
          setParams(next)
        }}
      >
        <div className="admin-filter-fields">
          <label>
            Buscar
            <input
              name="q"
              key={search}
              type="search"
              defaultValue={search}
              placeholder="Código, cliente o correo"
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
            <Icon name="search" /> Aplicar
          </button>
        </div>
        <div className="admin-filter-result" aria-live="polite">
          <span>
            {orders.length} {orders.length === 1 ? 'pedido' : 'pedidos'}
          </span>
          {hasFilters ? (
            <button type="button" onClick={() => setParams({})}>
              Limpiar filtros
            </button>
          ) : null}
        </div>
      </form>
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
              const deliveryReady = hasDeliveryDetails(order, customer?.phone)
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
                        state={{
                          returnTo: `${location.pathname}${location.search}`,
                        }}
                      >
                        Ver <span className="sr-only">{order.reference}</span>
                      </Link>
                      {nextStatus &&
                      canAdvance &&
                      (nextStatus !== 'shipped' || deliveryReady) ? (
                        <button
                          type="button"
                          onClick={() =>
                            adminService.setOrderStatus(
                              order.reference,
                              nextStatus,
                            )
                          }
                        >
                          {nextStatus === 'preparing'
                            ? 'Preparar'
                            : nextStatus === 'shipped'
                              ? 'Enviar'
                              : 'Entregar'}
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
          <h2>No encontramos pedidos</h2>
          <p>Prueba con otros filtros o limpia la búsqueda.</p>
          <button type="button" onClick={() => setParams({})}>
            Limpiar filtros
          </button>
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
  const [editingDelivery, setEditingDelivery] = useState(false)
  const [deliveryMessage, setDeliveryMessage] = useState('')
  const [deliveryDraft, setDeliveryDraft] = useState(() => {
    const customer = state.customers.find(
      (item) => item.id === order?.customerId,
    )
    return {
      customerName: /^Cliente \d+$/.test(order?.customerName ?? '')
        ? ''
        : (order?.customerName ?? ''),
      customerEmail:
        order?.customerEmail === '—' ? '' : (order?.customerEmail ?? ''),
      phone: customer?.phone === '—' ? '' : (customer?.phone ?? ''),
      street:
        order?.address.street === 'Dirección registrada'
          ? ''
          : (order?.address.street ?? ''),
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
  const deliveryReady = hasDeliveryDetails(order, customer?.phone)
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
    adminService.setOrderStatus(orderReference, status)
    setSaved(true)
  }

  function saveDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = adminService.saveOrderDelivery(orderReference, deliveryDraft)
    setDeliveryMessage(
      result.kind === 'saved' ? 'Datos de entrega guardados.' : result.message,
    )
    if (result.kind === 'saved') {
      setSavedDeliveryDraft(deliveryDraft)
      setEditingDelivery(false)
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
      <div
        className="admin-inline-actions"
        aria-label="Estado de preparación del pedido"
      >
        <AdminBadge tone={orderStatus.tone}>{orderStatus.label}</AdminBadge>
      </div>
      {!deliveryReady ? (
        <p className="admin-inline-warning" role="status">
          Faltan datos de contacto o una dirección verificable. Verifica la
          información antes de coordinar el envío.
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
            <AdminNotice>
              {saved ? 'Estado actualizado en esta sesión.' : ''}
            </AdminNotice>
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
              {!customer?.phone || customer.phone === '—'
                ? 'Teléfono no disponible'
                : customer.phone}
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
              {order.address.district}, {order.address.province},{' '}
              {order.address.department}
            </p>
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
                <button className="button button--secondary" type="submit">
                  Guardar datos de entrega
                </button>
              </form>
            ) : null}
            <AdminNotice>{deliveryMessage}</AdminNotice>
          </section>
        </div>
      </div>
    </div>
  )
}

export function AdminCustomersPage() {
  const state = useAdminStore()
  const orderCountByCustomer = new Map<string, number>()
  state.orders.forEach((order) =>
    orderCountByCustomer.set(
      order.customerId,
      (orderCountByCustomer.get(order.customerId) ?? 0) + 1,
    ),
  )
  const customers = [...state.customers].sort((first, second) =>
    first.name.localeCompare(second.name, 'es'),
  )
  const pagination = useAdminPagination(customers, 25)
  return (
    <div className="admin-page admin-customers-page">
      <AdminPageHeader
        eyebrow="Operación"
        title="Clientes"
        description="Consulta los clientes y su historial de pedidos."
      />
      <div className="admin-table-wrap">
        <table className="admin-table">
          <caption className="sr-only">Clientes</caption>
          <thead>
            <tr>
              <th scope="col">Cliente</th>
              <th scope="col">Correo</th>
              <th scope="col">Celular</th>
              <th scope="col">Pedidos</th>
            </tr>
          </thead>
          <tbody>
            {pagination.items.map((customer) => (
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
                  <span className="admin-cell-label">Pedidos</span>
                  {orderCountByCustomer.get(customer.id) ?? 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
  const [message, setMessage] = useState('')
  const editorHeadingRef = useRef<HTMLHeadingElement>(null)
  const promotions = [...state.promotions].sort((first, second) =>
    first.code.localeCompare(second.code),
  )
  const pagination = useAdminPagination(promotions, 10)

  function openEditor(nextForm: AdminPromotion) {
    setMessage('')
    setForm(nextForm)
    window.requestAnimationFrame(() => editorHeadingRef.current?.focus())
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form) return
    const result = adminService.savePromotion(form)
    if (result.kind === 'validation') {
      setMessage(result.message)
      return
    }
    setMessage('Promoción guardada.')
    setForm(null)
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
            <div className="admin-inline-actions">
              <button className="button button--primary" type="submit">
                Guardar promoción
              </button>
              <button type="button" onClick={() => setForm(null)}>
                Cancelar
              </button>
            </div>
          </section>
        </form>
      ) : null}
      <AdminNotice>{message}</AdminNotice>
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
                  onClick={() =>
                    adminService.setPromotionActive(
                      promotion.id,
                      !promotion.active,
                    )
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
