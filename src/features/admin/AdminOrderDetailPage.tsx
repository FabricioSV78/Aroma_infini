import { variantLabel } from '../../domain/product-type'
import { isRemoteCatalog } from '../../services/catalog-source'
import { formatBrandName } from '../../utils/brand-name'
import './admin-operations.css'
import { useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router'
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
  type AdminOrderStatus,
  type AdminOrder,
} from '../../services/admin-service'
import { formatPEN } from '../../services/currency'
import { AdminBadge, AdminPageHeader } from './AdminShared'
import { adminOrderStatusMeta, adminPaymentStatusMeta } from './admin-utils'
import { useAdminStore } from './useAdminStore'
import { useUnsavedChanges } from './useUnsavedChanges'
import { AdminShippingSummary } from './AdminShippingSummary'
import { isShippingDestinationEnabled } from '../../services/shipping-rates'
import { OrderHistory } from './OrderHistory'
import {
  ORDER_STATUSES,
  getOrderTransitionError,
} from '../../domain/order-workflow'
import { OrderStatusPicker } from './OrderStatusPicker'
import { Icon } from '../../components/ui/Icon'
import { useAdminSave } from './useAdminSave'
import { AdminSaveFeedback } from './AdminSaveFeedback'
import { InlineStatus } from '../../components/ui/InlineStatus'
import { useAdminNotice } from './AdminNoticeProvider'
import { orderAdminService } from '../../services/order-admin-service'

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

const orderStatusOrder = ORDER_STATUSES

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
  const statusPersistence = useAdminSave({ catalog: true })
  const statusBusy = statusPersistence.saving
  const statusPersistenceError = statusPersistence.persistenceFailed
  const statusAction = useRef(false)
  const statusVersion = useRef(order?.version)
  const statusOperation = useRef<string | null>(null)
  const [editingDelivery, setEditingDelivery] = useState(false)
  const [deliveryError, setDeliveryError] = useState('')
  const deliveryPersistence = useAdminSave({ catalog: true })
  const deliveryVersion = useRef(order?.version)
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
  const canChangeStatus = !getOrderTransitionError(
    order,
    status,
    customer?.phone,
  )
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
        () =>
          orderAdminService.setOrderStatus(orderReference, status, {
            deliveryConfirmed: status === 'shipped' || status === 'delivered',
            expectedVersions: { [orderReference]: statusVersion.current ?? 0 },
            operationId: statusOperation.current ?? undefined,
          }),
        () => {
          statusVersion.current = adminService
            .getSnapshot()
            .orders.find((item) => item.reference === orderReference)?.version
          statusOperation.current = null
          notice.toast('Estado actualizado.')
        },
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
        orderAdminService.saveOrderDelivery(
          orderReference,
          historicDestination
            ? {
                ...deliveryDraft,
                department: originalAddress.department,
                province: originalAddress.province,
                district: originalAddress.district,
              }
            : deliveryDraft,
          deliveryVersion.current,
        ),
      () => {
        notice.toast('Datos de entrega guardados.')
        setSavedDeliveryDraft(deliveryDraft)
        setEditingDelivery(false)
        deliveryVersion.current = adminService
          .getSnapshot()
          .orders.find((item) => item.reference === orderReference)?.version
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
      {order.simulation ? (
        <p className="admin-data-note">
          Modo prueba: este pedido no representa un cobro real ni descuenta
          inventario.
        </p>
      ) : null}
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
          pedido como enviado.
        </p>
      ) : null}
      <div className="admin-order-layout">
        <aside>
          <form
            className="admin-order-state-form"
            onSubmit={saveStatus}
            aria-busy={statusBusy}
          >
            <OrderStatusPicker
              order={order}
              value={status}
              onChange={(next) => {
                if (status === order.status) {
                  statusVersion.current = order.version
                  statusOperation.current = crypto.randomUUID()
                }
                setStatusError('')
                setStatus(next)
              }}
              disabled={statusBusy || statusPersistenceError}
              legacyPhone={customer?.phone}
            />
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
              <Icon name="check" />
              {statusBusy ? 'Guardando…' : 'Guardar estado'}
            </button>
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
                if (!editingDelivery) deliveryVersion.current = order.version
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
                    readOnly={isRemoteCatalog}
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
                    readOnly={isRemoteCatalog}
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
