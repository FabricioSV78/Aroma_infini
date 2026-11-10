import { Link } from 'react-router'
import { useSyncExternalStore } from 'react'
import { Icon } from '../../components/ui/Icon'
import {
  getAreaBaseShipping,
  shippingService,
} from '../../services/shipping-service'
import { deliveryAreas } from '../../content/peru'
import { formatPEN } from '../../services/currency'
import type { ShippingSettings } from '../../types/shipping'
import { InstitutionalBreadcrumb } from './InstitutionalBreadcrumb'
import { useSiteSettings } from '../../services/site-settings-service'

interface InstitutionalIntroProps {
  title: string
  description: string
}

function InstitutionalIntro({ title, description }: InstitutionalIntroProps) {
  return (
    <header className="institutional-intro" data-scroll-reveal="copy">
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  )
}

function ContactAction({ label = 'Escríbenos' }: { label?: string }) {
  return (
    <Link className="button button--primary" to="/contacto">
      {label} <Icon name="arrow" />
    </Link>
  )
}

interface PublicShippingRate {
  label: string
  courierFeeCents: number
  motorizadoFeeCents: number | null
  estimate: string
}

function getPublicShippingRates(
  shipping: ShippingSettings,
): PublicShippingRate[] {
  if (shipping.configured === false) return []
  const localRates = deliveryAreas.map((area) => ({
    label: area.label,
    ...getAreaBaseShipping(shipping, area.department),
  }))
  const [lima, callao] = localRates
  const sameLocalRates =
    lima &&
    callao &&
    lima.courierFeeCents === callao.courierFeeCents &&
    lima.motorizadoFeeCents === callao.motorizadoFeeCents &&
    lima.estimate === callao.estimate
  const rates = sameLocalRates
    ? [{ ...lima, label: localRates.map((rate) => rate.label).join(' y ') }]
    : localRates

  return shipping.provinceShippingEnabled
    ? [
        ...rates,
        {
          label: 'Otras provincias',
          courierFeeCents: shipping.nationalCourierFeeCents,
          motorizadoFeeCents: null,
          estimate: shipping.nationalEstimate,
        },
      ]
    : rates
}

export function ShippingPage() {
  const shipping = useSyncExternalStore(
    shippingService.subscribe,
    shippingService.getSnapshot,
  )
  const rates = getPublicShippingRates(shipping)
  const coverage = shipping.provinceShippingEnabled
    ? 'Todo el Perú'
    : deliveryAreas.map((area) => area.label).join(' y ')

  return (
    <article className="store-page institutional-page institutional-shipping service-page container">
      <InstitutionalBreadcrumb current="Envíos y entregas" />
      <header
        className="delivery-heading service-intro"
        data-scroll-reveal="copy"
      >
        <h1>Envíos y entregas</h1>
        <p>
          Conoce dónde entregamos, cuánto cuesta y cuándo recibirás tu pedido.
        </p>
      </header>

      <div className="delivery-sheet">
        <section
          className="delivery-options"
          aria-labelledby="shipping-rates-title"
        >
          <div className="delivery-summary">
            <div className="delivery-coverage">
              <Icon name="truck" />
              <div>
                <p className="eyebrow">Entregamos en</p>
                <h2 id="shipping-rates-title">{coverage}</h2>
              </div>
            </div>
            {shipping.freeThresholdCents > 0 ? (
              <div className="delivery-free">
                <span>Envío gratis desde</span>
                <strong>{formatPEN(shipping.freeThresholdCents)}</strong>
                <p>Aplica al subtotal del pedido, dentro de la cobertura.</p>
              </div>
            ) : null}
          </div>
          <div className="delivery-rates">
            {shipping.configured === false ? (
              <p role="status">
                Consulta las tarifas y los plazos de entrega con nuestro equipo
                antes de completar tu compra.{' '}
                <Link className="text-link" to="/contacto">
                  Contactar
                </Link>
              </p>
            ) : null}
            {rates.map((rate) => (
              <section className="delivery-rate-group" key={rate.label}>
                <h3 className={rates.length === 1 ? 'sr-only' : undefined}>
                  {rate.label}
                </h3>
                <table className="delivery-table">
                  <caption className="sr-only">
                    Modalidades, tarifas y plazo de entrega para {rate.label}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Modalidad</th>
                      <th scope="col">Tarifa</th>
                      <th scope="col">Plazo estimado</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Courier</th>
                      <td className="delivery-price">
                        {formatPEN(rate.courierFeeCents)}
                      </td>
                      <td
                        className="delivery-estimate"
                        rowSpan={rate.motorizadoFeeCents === null ? 1 : 2}
                      >
                        <span>
                          <Icon name="clock" />
                          <strong>{rate.estimate}</strong>
                        </span>
                      </td>
                    </tr>
                    {rate.motorizadoFeeCents !== null ? (
                      <tr>
                        <th scope="row">Motorizado</th>
                        <td className="delivery-price">
                          {formatPEN(rate.motorizadoFeeCents)}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
          <p className="delivery-note">
            {shipping.provinceShippingEnabled
              ? 'El costo y el plazo para tu dirección se confirman antes de pagar.'
              : 'El costo y el plazo para tu distrito se confirman antes de pagar.'}
          </p>
        </section>

        <nav className="delivery-help" aria-label="Seguimiento y ayuda">
          <Link className="delivery-help-link" to="/seguir-pedido">
            <Icon name="package" />
            <span>
              <strong>Seguir pedido</strong>
              <span>Consulta el estado con tu código</span>
            </span>
            <Icon name="arrow" />
          </Link>
          <Link className="delivery-help-link" to="/contacto">
            <Icon name="chat" />
            <span>
              <strong>Consultar entrega</strong>
              <span>Escríbenos si tienes una duda</span>
            </span>
            <Icon name="arrow" />
          </Link>
        </nav>
      </div>
    </article>
  )
}

export function ReturnsPage() {
  return <PolicyPage title="Cambios y devoluciones" policy="returns" />
}

function PolicyPage({
  title,
  policy,
}: {
  title: string
  policy: 'privacy' | 'terms' | 'returns'
}) {
  const settings = useSiteSettings()
  return (
    <article className="store-page institutional-page institutional-legal container">
      <InstitutionalBreadcrumb current={title} />
      <InstitutionalIntro title={title} description={settings.business.name} />
      <div className="institutional-policy-copy">
        {settings.policies[policy].split(/\n\s*\n/).map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      <ContactAction label="Consultar con la tienda" />
    </article>
  )
}

export function PrivacyPage() {
  return <PolicyPage title="Privacidad" policy="privacy" />
}

export function TermsPage() {
  return <PolicyPage title="Términos y condiciones" policy="terms" />
}
