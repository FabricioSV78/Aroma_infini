import { useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import {
  getPeruDistrictOptions,
  getPeruProvinceOptions,
  peruDepartments,
  peruUbigeoSummary,
} from '../../content/peru'
import {
  adminService,
  type AdminBrand,
  type AdminOrderStatus,
  type AdminPromotion,
  type AdminShippingSettings,
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
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Organización del surtido"
        title="Marcas"
        description="Crea, edita y controla las marcas disponibles en el catálogo."
      />
      <div className="admin-list-toolbar">
        <p>
          {state.brands.length} {state.brands.length === 1 ? 'marca' : 'marcas'}
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
          <caption className="sr-only">Marcas del catálogo</caption>
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
          <caption className="sr-only">Pedidos de demostración</caption>
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
                    {order.customerName}
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
                      {nextStatus && canAdvance ? (
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
  if (!order)
    return (
      <div className="admin-page admin-empty">
        <h1>Pedido no encontrado</h1>
        <Link to="/admin/pedidos">Volver a pedidos</Link>
      </div>
    )
  const customer = state.customers.find((item) => item.id === order.customerId)
  const orderStatus = adminOrderStatusMeta[order.status]
  const paymentStatus = adminPaymentStatusMeta[order.paymentStatus]
  const orderReference = order.reference
  const persistedStatus = order.status
  const currentStatusIndex = orderStatusOrder.indexOf(order.status)
  const selectedStatusIndex = orderStatusOrder.indexOf(status)
  const canChangeStatus = order.paymentStatus === 'approved'
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

  return (
    <div className="admin-page">
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
      <div className="admin-order-layout">
        <section aria-labelledby="admin-order-products">
          <h2 id="admin-order-products">Productos</h2>
          <ul>
            {order.lines.map((line) => (
              <li key={line.variantId}>
                <span>
                  <small>{line.brand}</small>
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
        <aside>
          <section aria-labelledby="admin-order-customer">
            <h2 id="admin-order-customer">Cliente</h2>
            <p>{order.customerName}</p>
            <p>{order.customerEmail}</p>
            {customer?.phone ? <p>{customer.phone}</p> : null}
          </section>
          <section aria-labelledby="admin-order-delivery">
            <h2 id="admin-order-delivery">Entrega</h2>
            <p>{deliveryMethod}</p>
            <p>{order.address.street}</p>
            <p>
              {order.address.district}, {order.address.province},{' '}
              {order.address.department}
            </p>
          </section>
          <section aria-labelledby="admin-order-payment">
            <h2 id="admin-order-payment">Pago</h2>
            <p>
              <AdminBadge tone={paymentStatus.tone}>
                {paymentStatus.label}
              </AdminBadge>
            </p>
            <p>Mercado Pago · entorno de demostración</p>
            <p>
              El estado del pago es informativo y no se modifica desde aquí.
            </p>
          </section>
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
                El pedido debe tener el pago aprobado antes de avanzar.
              </p>
            ) : null}
            <AdminNotice>
              {saved ? 'Estado actualizado en esta sesión.' : ''}
            </AdminNotice>
          </form>
        </aside>
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
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Clientes"
        title="Clientes"
        description="Consulta de ejemplo sin campañas, segmentación ni envío de mensajes."
      />
      <div className="admin-table-wrap">
        <table className="admin-table">
          <caption className="sr-only">Clientes ficticios</caption>
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
      <p className="admin-data-note">
        Todas las identidades usan datos de muestra y dominios no válidos.
      </p>
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
    setMessage('Promoción guardada en memoria.')
    setForm(null)
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Reglas de ejemplo"
        title="Promociones"
        description="Administra códigos, vigencia y límites de uso desde una lista compacta."
      />
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

export function AdminShippingPage() {
  const state = useAdminStore()
  const [form, setForm] = useState<AdminShippingSettings>(() => ({
    freeThresholdCents: state.shipping.freeThresholdCents,
    zones: state.shipping.zones.map((zone) => ({ ...zone })),
  }))
  const [message, setMessage] = useState('')

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = adminService.saveShipping(form)
    setMessage(
      result.kind === 'saved'
        ? 'Configuración aplicada a la tienda durante esta sesión.'
        : result.message,
    )
  }

  const availableDepartments = peruDepartments.filter(
    (department) =>
      !form.zones.some((zone) => zone.department === department.value),
  )

  function addZone() {
    const department = availableDepartments[0] ?? peruDepartments[0]
    if (!department) return
    setForm((current) => ({
      ...current,
      zones: [
        ...current.zones,
        {
          id: `zone-${crypto.randomUUID().slice(0, 8)}`,
          name: department.label,
          department: department.value,
          province: null,
          district: null,
          courierFeeCents: 0,
          motorizadoFeeCents: null,
          estimate: 'Hasta 5 días',
          active: false,
        },
      ],
    }))
    setMessage(
      'Completa la tarifa y activa la zona cuando la cobertura esté confirmada.',
    )
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Configuración logística"
        title="Envíos"
        description={`Configura cobertura y tarifas sobre ${peruUbigeoSummary.departments} departamentos, ${peruUbigeoSummary.provinces} provincias y ${peruUbigeoSummary.districts} distritos.`}
      />
      <form className="admin-editor" onSubmit={save}>
        <section aria-labelledby="shipping-global-title">
          <header>
            <span>01</span>
            <div>
              <h2 id="shipping-global-title">Condición global</h2>
              <p>Modificarla afecta carrito y checkout de prueba.</p>
            </div>
          </header>
          <div className="admin-fields">
            <label>
              Envío gratis desde (S/)
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.freeThresholdCents / 100}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    freeThresholdCents: Math.round(
                      Number(event.target.value) * 100,
                    ),
                  }))
                }
              />
            </label>
          </div>
        </section>
        <section aria-labelledby="shipping-zones-title">
          <header>
            <span>02</span>
            <div>
              <h2 id="shipping-zones-title">Zonas de entrega</h2>
              <p>
                Solo las zonas activas aparecen en el checkout. Las tarifas
                deben coincidir con el courier contratado.
              </p>
            </div>
          </header>
          <div className="admin-zone-toolbar">
            <p>
              {form.zones.length}{' '}
              {form.zones.length === 1
                ? 'zona configurada'
                : 'zonas configuradas'}
            </p>
            <button
              className="button button--secondary"
              type="button"
              onClick={addZone}
            >
              Agregar zona
            </button>
          </div>
          <div className="admin-zone-list">
            {form.zones.map((zone) => (
              <fieldset key={zone.id}>
                <legend>{zone.name}</legend>
                <label>
                  Nombre visible
                  <input
                    required
                    maxLength={60}
                    value={zone.name}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        zones: current.zones.map((item) =>
                          item.id === zone.id
                            ? { ...item, name: event.target.value }
                            : item,
                        ),
                      }))
                    }
                  />
                </label>
                <label>
                  Departamento
                  <select
                    value={zone.department}
                    onChange={(event) => {
                      const department = peruDepartments.find(
                        (item) => item.value === event.target.value,
                      )
                      setForm((current) => ({
                        ...current,
                        zones: current.zones.map((item) =>
                          item.id === zone.id
                            ? {
                                ...item,
                                department: event.target.value,
                                province: null,
                                district: null,
                                name:
                                  item.name.trim() === '' ||
                                  peruDepartments.some(
                                    (candidate) =>
                                      candidate.label === item.name,
                                  )
                                    ? (department?.label ?? item.name)
                                    : item.name,
                              }
                            : item,
                        ),
                      }))
                    }}
                  >
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
                    value={zone.province ?? ''}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        zones: current.zones.map((item) =>
                          item.id === zone.id
                            ? {
                                ...item,
                                province: event.target.value || null,
                                district: null,
                              }
                            : item,
                        ),
                      }))
                    }
                  >
                    <option value="">Todas</option>
                    {getPeruProvinceOptions(zone.department).map((province) => (
                      <option key={province.value} value={province.value}>
                        {province.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Distrito
                  <select
                    value={zone.district ?? ''}
                    disabled={!zone.province}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        zones: current.zones.map((item) =>
                          item.id === zone.id
                            ? {
                                ...item,
                                district: event.target.value || null,
                              }
                            : item,
                        ),
                      }))
                    }
                  >
                    <option value="">Todos</option>
                    {getPeruDistrictOptions(zone.province ?? '').map(
                      (district) => (
                        <option key={district.value} value={district.value}>
                          {district.label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Courier (S/)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={zone.courierFeeCents / 100}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        zones: current.zones.map((item) =>
                          item.id === zone.id
                            ? {
                                ...item,
                                courierFeeCents: Math.round(
                                  Number(event.target.value) * 100,
                                ),
                              }
                            : item,
                        ),
                      }))
                    }
                  />
                </label>
                <label>
                  Motorizado (S/)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={
                      zone.motorizadoFeeCents === null
                        ? ''
                        : zone.motorizadoFeeCents / 100
                    }
                    placeholder="No disponible"
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        zones: current.zones.map((item) =>
                          item.id === zone.id
                            ? {
                                ...item,
                                motorizadoFeeCents: event.target.value
                                  ? Math.round(Number(event.target.value) * 100)
                                  : null,
                              }
                            : item,
                        ),
                      }))
                    }
                  />
                </label>
                <label>
                  Plazo
                  <input
                    value={zone.estimate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        zones: current.zones.map((item) =>
                          item.id === zone.id
                            ? { ...item, estimate: event.target.value }
                            : item,
                        ),
                      }))
                    }
                  />
                </label>
                <label className="admin-check">
                  <input
                    type="checkbox"
                    checked={zone.active}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        zones: current.zones.map((item) =>
                          item.id === zone.id
                            ? { ...item, active: event.target.checked }
                            : item,
                        ),
                      }))
                    }
                  />
                  Zona activa
                </label>
                <button
                  className="admin-remove"
                  type="button"
                  onClick={() => {
                    setForm((current) => ({
                      ...current,
                      zones: current.zones.filter(
                        (item) => item.id !== zone.id,
                      ),
                    }))
                    setMessage(
                      'La zona se eliminará de la tienda cuando guardes la configuración.',
                    )
                  }}
                >
                  Quitar zona
                </button>
              </fieldset>
            ))}
          </div>
        </section>
        <AdminNotice>{message}</AdminNotice>
        <button className="button button--primary" type="submit">
          Guardar configuración
        </button>
      </form>
    </div>
  )
}

export function AdminHomePage() {
  const state = useAdminStore()
  const [draft, setDraft] = useState(() => [...state.featuredOrder])
  const [message, setMessage] = useState('')
  const products = state.products
    .filter((record) => record.active)
    .sort((first, second) => {
      const firstPosition = draft.indexOf(first.product.id)
      const secondPosition = draft.indexOf(second.product.id)
      if (firstPosition >= 0 && secondPosition >= 0)
        return firstPosition - secondPosition
      if (firstPosition >= 0) return -1
      if (secondPosition >= 0) return 1
      return first.popularity - second.popularity
    })

  function move(id: string, direction: -1 | 1) {
    setMessage('')
    setDraft((current) => {
      const index = current.indexOf(id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        eyebrow="Selección editorial"
        title="Home"
        description="El orden de destacados es independiente del ranking ilustrativo de Más vendidos."
      />
      <div className="admin-home-preview-link">
        <Link className="text-link" to="/">
          Vista previa de la tienda <Icon name="arrow" />
        </Link>
      </div>
      <p className="admin-selection-note">
        {draft.length} de 2 destacados seleccionados
        {draft.length >= 2 ? ' · Desmarca uno para reemplazarlo.' : '.'}
      </p>
      <ol className="admin-featured-list">
        {products.map((record) => {
          const selected = draft.includes(record.product.id)
          const position = draft.indexOf(record.product.id)
          return (
            <li
              key={record.product.id}
              className={selected ? 'is-selected' : ''}
            >
              <span>
                {selected ? String(position + 1).padStart(2, '0') : '—'}
              </span>
              <img
                src={`/images/${record.product.image}-480.webp`}
                width={64}
                height={80}
                alt=""
              />
              <div>
                <strong>{record.product.name}</strong>
                <small>
                  {
                    state.brands.find(
                      (brand) => brand.id === record.product.brandId,
                    )?.name
                  }
                </small>
              </div>
              <label className="admin-check">
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={!selected && draft.length >= 2}
                  onChange={(event) => {
                    setMessage('')
                    setDraft((current) =>
                      event.target.checked
                        ? [...current, record.product.id]
                        : current.filter((id) => id !== record.product.id),
                    )
                  }}
                />
                Destacado
              </label>
              <div className="admin-order-controls">
                <button
                  type="button"
                  onClick={() => move(record.product.id, -1)}
                  disabled={!selected || position === 0}
                  aria-label={`Subir ${record.product.name}`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(record.product.id, 1)}
                  disabled={!selected || position === draft.length - 1}
                  aria-label={`Bajar ${record.product.name}`}
                >
                  ↓
                </button>
              </div>
            </li>
          )
        })}
      </ol>
      <div className="admin-editor-actions">
        <button
          className="button button--primary"
          type="button"
          onClick={() => {
            if (draft.length !== 2) {
              setMessage(
                'Selecciona exactamente dos productos para conservar la composición del Home.',
              )
              return
            }
            adminService.setFeaturedOrder(draft)
            setMessage('Selección aplicada al Home durante esta sesión.')
          }}
        >
          Guardar destacados
        </button>
        <AdminNotice>{message}</AdminNotice>
      </div>
    </div>
  )
}
