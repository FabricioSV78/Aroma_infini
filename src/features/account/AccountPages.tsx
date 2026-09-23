import { useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import {
  getPeruDepartmentLabel,
  getPeruDistrictLabel,
  getPeruDistrictOptions,
  getPeruProvinceLabel,
  getPeruProvinceOptions,
  isValidPeruLocation,
  peruDepartments,
} from '../../content/peru'
import {
  accountStatusLabels,
  createDemoAddress,
  type AccountAddress,
  type AccountProfile,
} from '../../services/account-service'
import { formatPEN } from '../../services/currency'
import { useFavorites } from '../favorites/favorites-context'
import { AccountOrderTimeline } from './AccountOrderTimeline'
import { useAccount } from './account-context'

const dateFormatter = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function reportTrimmedValidity(form: HTMLFormElement) {
  for (const input of form.querySelectorAll<HTMLInputElement>(
    '[data-trim-required]',
  ))
    input.setCustomValidity(input.value.trim() ? '' : 'Completa este campo.')
  return form.reportValidity()
}

export function AccountOverviewPage() {
  const { profile, address, orders } = useAccount()
  const { favoriteCount } = useFavorites()
  const latestOrder = orders[0]
  return (
    <section className="account-section" aria-labelledby="account-title">
      <header className="account-heading" data-scroll-reveal="copy">
        <p className="eyebrow">Resumen</p>
        <h1 id="account-title">Hola, {profile.firstName}.</h1>
        <p>Todo lo necesario para continuar descubriendo.</p>
      </header>
      <div className="account-overview-grid" data-scroll-reveal="stagger">
        <section aria-labelledby="overview-orders-title">
          <span>{String(orders.length).padStart(2, '0')}</span>
          <h2 id="overview-orders-title">Pedidos de prueba</h2>
          <p>
            {latestOrder
              ? `Último estado: ${accountStatusLabels[latestOrder.status]}.`
              : 'Todavía no hay pedidos.'}
          </p>
          <Link className="text-link" to="/cuenta/pedidos">
            Ver mis pedidos <Icon name="arrow" />
          </Link>
        </section>
        <section aria-labelledby="overview-address-title">
          <span>{address ? '01' : '00'}</span>
          <h2 id="overview-address-title">Dirección</h2>
          <p>
            {address
              ? `${getPeruDistrictLabel(address.district)}, ${getPeruDepartmentLabel(address.department)}`
              : 'Sin dirección guardada.'}
          </p>
          <Link className="text-link" to="/cuenta/direcciones">
            Gestionar dirección <Icon name="arrow" />
          </Link>
        </section>
        <section aria-labelledby="overview-favorites-title">
          <span>{String(favoriteCount).padStart(2, '0')}</span>
          <h2 id="overview-favorites-title">Favoritos</h2>
          <p>Aromas guardados en este navegador.</p>
          <Link className="text-link" to="/favoritos">
            Ver favoritos <Icon name="arrow" />
          </Link>
        </section>
      </div>
    </section>
  )
}

export function AccountDataPage() {
  const { profile, updateProfile } = useAccount()
  const [form, setForm] = useState<AccountProfile>(profile)
  const [saved, setSaved] = useState(false)

  function update(field: keyof AccountProfile, value: string) {
    setSaved(false)
    setForm((current) => ({ ...current, [field]: value }))
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reportTrimmedValidity(event.currentTarget)) return
    updateProfile({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
    })
    setSaved(true)
  }

  return (
    <section className="account-section" aria-labelledby="account-data-title">
      <header className="account-heading" data-scroll-reveal="copy">
        <p className="eyebrow">Perfil de demostración</p>
        <h1 id="account-data-title">Mis datos.</h1>
        <p>
          Estos datos ficticios no salen del navegador ni se conservan al
          recargar.
        </p>
      </header>
      <form
        className="account-form"
        onSubmit={submit}
        data-scroll-reveal="copy"
      >
        <div className="account-fields">
          <div className="account-field">
            <label htmlFor="account-first-name">Nombre</label>
            <input
              id="account-first-name"
              value={form.firstName}
              onChange={(event) => update('firstName', event.target.value)}
              required
              data-trim-required
            />
          </div>
          <div className="account-field">
            <label htmlFor="account-last-name">Apellido</label>
            <input
              id="account-last-name"
              value={form.lastName}
              onChange={(event) => update('lastName', event.target.value)}
              required
              data-trim-required
            />
          </div>
          <div className="account-field">
            <label htmlFor="account-email">Correo electrónico</label>
            <input
              id="account-email"
              type="email"
              value={form.email}
              onChange={(event) => update('email', event.target.value)}
              required
            />
          </div>
          <div className="account-field">
            <label htmlFor="account-phone">Celular</label>
            <input
              id="account-phone"
              type="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(event) => update('phone', event.target.value)}
              pattern={'\\+?[0-9 ]{7,20}'}
              required
            />
          </div>
        </div>
        <div className="account-form-actions">
          <button className="button button--primary" type="submit">
            Guardar cambios
          </button>
          <p role="status" aria-live="polite">
            {saved ? 'Cambios guardados durante esta sesión.' : ''}
          </p>
        </div>
      </form>
    </section>
  )
}

export function AccountAddressesPage() {
  const { address, saveAddress, removeAddress } = useAccount()
  const [form, setForm] = useState<AccountAddress>(
    address ?? createDemoAddress(),
  )
  const [message, setMessage] = useState('')
  const provinceOptions = getPeruProvinceOptions(form.department)
  const districtOptions = getPeruDistrictOptions(form.province)

  function update(field: keyof AccountAddress, value: string) {
    setMessage('')
    setForm((current) =>
      field === 'department'
        ? { ...current, department: value, province: '', district: '' }
        : field === 'province'
          ? { ...current, province: value, district: '' }
          : { ...current, [field]: value },
    )
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!reportTrimmedValidity(event.currentTarget)) return
    if (!isValidPeruLocation(form.department, form.province, form.district)) {
      setMessage('Selecciona un departamento, provincia y distrito válidos.')
      return
    }
    saveAddress({
      id: form.id,
      label: form.label.trim(),
      recipient: form.recipient.trim(),
      department: form.department.trim(),
      province: form.province.trim(),
      district: form.district.trim(),
      street: form.street.trim(),
      reference: form.reference.trim(),
    })
    setMessage('Dirección guardada durante esta sesión.')
  }
  function remove() {
    removeAddress()
    setMessage('Dirección de demostración eliminada.')
  }
  function restore() {
    const restored = createDemoAddress()
    setForm(restored)
    saveAddress(restored)
    setMessage('Dirección de ejemplo restaurada.')
  }

  return (
    <section
      className="account-section"
      aria-labelledby="account-address-title"
    >
      <header className="account-heading" data-scroll-reveal="copy">
        <p className="eyebrow">Entrega</p>
        <h1 id="account-address-title">Direcciones.</h1>
        <p>
          Administra una dirección ficticia para revisar el recorrido de cuenta.
        </p>
      </header>
      {!address ? (
        <div className="account-empty" data-scroll-reveal="copy">
          <h2>No hay una dirección guardada.</h2>
          <p>
            Puedes restaurar la dirección de ejemplo para continuar la prueba.
          </p>
          <button
            className="button button--secondary"
            type="button"
            onClick={restore}
          >
            Restaurar ejemplo
          </button>
        </div>
      ) : (
        <form
          className="account-form"
          onSubmit={submit}
          data-scroll-reveal="copy"
        >
          <div className="account-fields">
            <div className="account-field">
              <label htmlFor="account-address-label">
                Nombre de la dirección
              </label>
              <input
                id="account-address-label"
                value={form.label}
                onChange={(event) => update('label', event.target.value)}
                required
                data-trim-required
              />
            </div>
            <div className="account-field">
              <label htmlFor="account-recipient">Destinatario</label>
              <input
                id="account-recipient"
                value={form.recipient}
                onChange={(event) => update('recipient', event.target.value)}
                required
                data-trim-required
              />
            </div>
            <div className="account-field">
              <label htmlFor="account-department">Departamento</label>
              <select
                id="account-department"
                value={form.department}
                onChange={(event) => update('department', event.target.value)}
                required
              >
                <option value="">Selecciona un departamento</option>
                {peruDepartments.map((department) => (
                  <option key={department.value} value={department.value}>
                    {department.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="account-field">
              <label htmlFor="account-province">Provincia</label>
              <select
                id="account-province"
                value={form.province}
                onChange={(event) => update('province', event.target.value)}
                required
                disabled={!form.department}
              >
                <option value="">Selecciona una provincia</option>
                {provinceOptions.map((province) => (
                  <option key={province.value} value={province.value}>
                    {province.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="account-field">
              <label htmlFor="account-district">Distrito</label>
              <select
                id="account-district"
                value={form.district}
                onChange={(event) => update('district', event.target.value)}
                required
                disabled={!form.province}
              >
                <option value="">Selecciona un distrito</option>
                {districtOptions.map((district) => (
                  <option key={district.value} value={district.value}>
                    {district.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="account-field account-field--wide">
              <label htmlFor="account-street">Dirección</label>
              <input
                id="account-street"
                value={form.street}
                onChange={(event) => update('street', event.target.value)}
                required
                data-trim-required
              />
            </div>
            <div className="account-field account-field--wide">
              <label htmlFor="account-reference">
                Referencia <span>Opcional</span>
              </label>
              <input
                id="account-reference"
                value={form.reference}
                onChange={(event) => update('reference', event.target.value)}
              />
            </div>
          </div>
          <div className="account-form-actions account-form-actions--split">
            <button className="button button--primary" type="submit">
              Guardar dirección
            </button>
            <button className="account-remove" type="button" onClick={remove}>
              Eliminar dirección de prueba
            </button>
          </div>
        </form>
      )}
      <p className="account-form-message" role="status" aria-live="polite">
        {message}
      </p>
    </section>
  )
}

export function AccountOrdersPage() {
  const { orders } = useAccount()
  const [searchParams] = useSearchParams()
  const visibleOrders = searchParams.get('demo') === 'empty' ? [] : orders
  return (
    <section className="account-section" aria-labelledby="account-orders-title">
      <header className="account-heading" data-scroll-reveal="copy">
        <p className="eyebrow">Historial de demostración</p>
        <h1 id="account-orders-title">Mis pedidos.</h1>
        <p>Consulta el detalle y el estado de cada pedido de prueba.</p>
      </header>
      {visibleOrders.length ? (
        <ul className="account-order-list" data-scroll-reveal="stagger">
          {visibleOrders.map((order) => (
            <li key={order.reference}>
              <div>
                <span>{dateFormatter.format(new Date(order.placedAt))}</span>
                <strong>{order.reference}</strong>
              </div>
              <div>
                <span>
                  {order.lines.length}{' '}
                  {order.lines.length === 1 ? 'producto' : 'productos'}
                </span>
                <strong>{formatPEN(order.totalCents)}</strong>
              </div>
              <span className="account-order-status">
                {accountStatusLabels[order.status]} · prueba
              </span>
              <Link
                className="text-link"
                to={`/cuenta/pedidos/${order.reference}`}
              >
                Ver pedido <Icon name="arrow" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="account-empty" data-scroll-reveal="copy">
          <h2>Aún no hay pedidos de prueba.</h2>
          <p>Cuando completes el checkout con esta cuenta aparecerán aquí.</p>
          <Link className="text-link" to="/catalogo">
            Explorar perfumes <Icon name="arrow" />
          </Link>
        </div>
      )}
    </section>
  )
}

export function AccountOrderDetailPage() {
  const { reference = '' } = useParams()
  const { orders } = useAccount()
  const order = orders.find((item) => item.reference === reference)
  if (!order)
    return (
      <section
        className="account-section account-empty"
        aria-labelledby="missing-order-title"
      >
        <p className="eyebrow">Pedido no encontrado</p>
        <h1 id="missing-order-title">No encontramos ese pedido de prueba.</h1>
        <Link className="text-link" to="/cuenta/pedidos">
          Volver a mis pedidos <Icon name="arrow" />
        </Link>
      </section>
    )
  return (
    <section
      className="account-section"
      aria-labelledby="account-order-detail-title"
    >
      <Link className="account-back" to="/cuenta/pedidos">
        ← Mis pedidos
      </Link>
      <header
        className="account-heading account-order-heading"
        data-scroll-reveal="copy"
      >
        <div>
          <p className="eyebrow">{order.reference}</p>
          <h1 id="account-order-detail-title">
            {accountStatusLabels[order.status]}.
          </h1>
        </div>
        <p>{dateFormatter.format(new Date(order.placedAt))}</p>
      </header>
      <AccountOrderTimeline status={order.status} />
      <div className="account-order-detail-grid" data-scroll-reveal="stagger">
        <section aria-labelledby="order-products-title">
          <h2 id="order-products-title">Productos</h2>
          <ul className="account-order-lines">
            {order.lines.map((line) => (
              <li key={line.variantId}>
                <div className="account-order-product">
                  <Link
                    className="account-order-product-image"
                    to={`/producto/${line.productSlug}`}
                    aria-label={`Ver ${line.name}`}
                  >
                    <img
                      src={`/images/${line.image}-480.webp`}
                      srcSet={`/images/${line.image}-480.webp 480w, /images/${line.image}-960.webp 960w`}
                      sizes="88px"
                      width={480}
                      height={600}
                      loading="lazy"
                      decoding="async"
                      alt=""
                    />
                  </Link>
                  <div>
                    <span>{line.brand}</span>
                    <strong>
                      <Link to={`/producto/${line.productSlug}`}>
                        {line.name}
                      </Link>
                    </strong>
                    <small>
                      {line.ml} ml · Cant. {line.quantity}
                    </small>
                  </div>
                </div>
                <span className="account-order-line-price">
                  {formatPEN(line.unitPriceCents * line.quantity)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="account-order-totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatPEN(order.subtotalCents)}</dd>
            </div>
            {order.discountCents ? (
              <div>
                <dt>Descuento</dt>
                <dd>−{formatPEN(order.discountCents)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Envío</dt>
              <dd>
                {order.shippingCents
                  ? formatPEN(order.shippingCents)
                  : 'Gratis'}
              </dd>
            </div>
            <div>
              <dt>Total</dt>
              <dd>{formatPEN(order.totalCents)}</dd>
            </div>
          </dl>
        </section>
        <section
          className="account-order-delivery"
          aria-labelledby="order-delivery-title"
        >
          <h2 id="order-delivery-title">Entrega</h2>
          <strong>{order.address.recipient}</strong>
          <p>{order.address.street}</p>
          <p>
            {getPeruDistrictLabel(order.address.district)},{' '}
            {getPeruProvinceLabel(order.address.province)},{' '}
            {getPeruDepartmentLabel(order.address.department)}
          </p>
          <p>
            {order.deliveryMethod === 'courier' ? 'Courier' : 'Motorizado'} ·
            Perú
          </p>
        </section>
      </div>
    </section>
  )
}

export function AccountPaymentsPage() {
  const { orders } = useAccount()
  return (
    <section
      className="account-section"
      aria-labelledby="account-payments-title"
    >
      <header className="account-heading" data-scroll-reveal="copy">
        <p className="eyebrow">Información de pagos</p>
        <h1 id="account-payments-title">Pagos.</h1>
        <p>
          En la integración real, los medios de pago se gestionarán en Mercado
          Pago.
        </p>
      </header>
      <div className="account-payment-provider" data-scroll-reveal="copy">
        <div>
          <span>Proveedor previsto</span>
          <strong>Mercado Pago</strong>
        </div>
        <p>No guardamos números de tarjeta, CVV ni credenciales bancarias.</p>
      </div>
      <section
        className="account-transactions"
        aria-labelledby="transactions-title"
        data-scroll-reveal="copy"
      >
        <h2 id="transactions-title">Transacciones de prueba</h2>
        {orders.length ? (
          <ul>
            {orders.map((order) => (
              <li key={order.reference}>
                <div>
                  <strong>{order.reference}</strong>
                  <span>{dateFormatter.format(new Date(order.placedAt))}</span>
                </div>
                <span>Confirmación simulada</span>
                <strong>{formatPEN(order.totalCents)}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p>No hay transacciones de prueba.</p>
        )}
      </section>
    </section>
  )
}
