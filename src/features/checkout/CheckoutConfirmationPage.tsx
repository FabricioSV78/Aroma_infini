import { formatBrandName } from '../../utils/brand-name'
import { Link } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { getPeruDistrictLabel, getPeruProvinceLabel } from '../../content/peru'
import { formatPEN } from '../../services/currency'
import { trackingPath } from '../../services/order-tracking-service'
import { getDeliveryZoneLabel } from '../../services/checkout-service'
import { useCheckout } from './checkout-context'

const dateFormatter = new Intl.DateTimeFormat('es-PE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export function CheckoutConfirmationPage() {
  const { order } = useCheckout()

  if (!order)
    return (
      <section
        className="store-page checkout-page checkout-unavailable container"
        data-scroll-reveal="fade"
      >
        <p className="eyebrow">Confirmación</p>
        <h1>No hay una selección reciente.</h1>
        <p>Puedes volver a la tienda para explorar los perfumes.</p>
        <Link className="button button--primary" to="/tienda">
          Explorar perfumes <Icon name="arrow" />
        </Link>
      </section>
    )

  return (
    <article className="store-page checkout-confirmation container">
      <nav
        className="checkout-breadcrumb"
        aria-label="Ruta de navegación"
        data-scroll-reveal="fade"
      >
        <Link to="/">Inicio</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Confirmación</span>
      </nav>
      <header
        className="checkout-confirmation-heading"
        data-scroll-reveal="copy"
      >
        <p className="eyebrow">Selección · {order.reference}</p>
        <h1>Tu selección quedó guardada.</h1>
        <p>
          La información está disponible durante esta sesión. No se realizó
          ningún cobro.
        </p>
        <div className="checkout-confirmation-tracking">
          <span>Código de pedido</span>
          <strong>{order.reference}</strong>
          <Link
            className="button button--primary"
            to={
              order.mode === 'demo-account'
                ? '/cuenta/pedidos'
                : trackingPath(order.reference)
            }
          >
            {order.mode === 'demo-account'
              ? 'Ver en Mis pedidos'
              : 'Ver estado del pedido'}{' '}
            <Icon name="arrow" />
          </Link>
        </div>
        <Link className="text-link" to="/tienda">
          Seguir descubriendo <Icon name="arrow" />
        </Link>
      </header>

      <div className="checkout-confirmation-grid" data-scroll-reveal="stagger">
        <section aria-labelledby="confirmation-items-title">
          <h2 id="confirmation-items-title">Resumen</h2>
          <p className="checkout-confirmation-reference">
            {order.reference} · {dateFormatter.format(new Date(order.placedAt))}
          </p>
          <ul className="checkout-confirmation-lines">
            {order.lines.map((line) => (
              <li key={line.variantId}>
                <div>
                  <small>{formatBrandName(line.brand)}</small>
                  <strong>{line.name}</strong>
                  <span>
                    {line.ml} ml · Cant. {line.quantity}
                  </span>
                </div>
                <span>{formatPEN(line.unitPriceCents * line.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="checkout-totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatPEN(order.subtotalCents)}</dd>
            </div>
            {order.discountCents > 0 ? (
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
            <div className="checkout-total">
              <dt>Total</dt>
              <dd>{formatPEN(order.totalCents)}</dd>
            </div>
          </dl>
        </section>
        <section aria-labelledby="confirmation-delivery-title">
          <h2 id="confirmation-delivery-title">Entrega</h2>
          <div className="checkout-confirmation-detail">
            <h3>Contacto</h3>
            <p>
              {order.contact.firstName} {order.contact.lastName}
            </p>
            <p>{order.contact.email}</p>
          </div>
          <div className="checkout-confirmation-detail">
            <h3>Dirección</h3>
            <p>{order.address.street}</p>
            <p>
              {getPeruDistrictLabel(order.address.district)},{' '}
              {getPeruProvinceLabel(order.address.province)},{' '}
              {getDeliveryZoneLabel(order.address.department)}
            </p>
            {order.address.reference ? (
              <p>Ref.: {order.address.reference}</p>
            ) : null}
          </div>
          <div className="checkout-confirmation-detail">
            <h3>Modalidad</h3>
            <p>
              {order.deliveryMethod === 'courier' ? 'Courier' : 'Motorizado'} ·
              Perú
            </p>
          </div>
        </section>
      </div>
    </article>
  )
}
