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
  return (
    <article className="store-page institutional-page institutional-returns container">
      <InstitutionalBreadcrumb current="Cambios y devoluciones" />
      <InstitutionalIntro
        title="Cambios y devoluciones"
        description="Si necesitas ayuda con un producto o un pedido, cuéntanos qué ocurrió para revisar tu caso."
      />
      <div
        className="institutional-legal-sections"
        data-scroll-reveal="stagger"
      >
        <section>
          <span>01</span>
          <h2>Comparte tu consulta</h2>
          <p>Indícanos el producto y, si lo tienes, el código de pedido.</p>
        </section>
        <section>
          <span>02</span>
          <h2>Conversemos</h2>
          <p>
            Revisaremos la información que nos proporciones y te orientaremos.
          </p>
        </section>
      </div>
      <div className="institutional-legal-warning" data-scroll-reveal="copy">
        <ContactAction />
      </div>
    </article>
  )
}

function InformationPage({
  current,
  title,
  description,
  sections,
}: InstitutionalIntroProps & {
  current: string
  sections: { title: string; body: string }[]
}) {
  return (
    <article className="store-page institutional-page institutional-legal container">
      <InstitutionalBreadcrumb current={current} />
      <InstitutionalIntro title={title} description={description} />
      <div
        className="institutional-legal-sections"
        data-scroll-reveal="stagger"
      >
        {sections.map((section, index) => (
          <section key={section.title}>
            <span>0{index + 1}</span>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </section>
        ))}
        <section>
          <span>0{sections.length + 1}</span>
          <h2>Consultas</h2>
          <p>Si necesitas ayuda con esta información, puedes escribirnos.</p>
          <ContactAction />
        </section>
      </div>
    </article>
  )
}

export function PrivacyPage() {
  return (
    <InformationPage
      current="Privacidad"
      title="Privacidad"
      description="Conoce qué información compartes al usar la tienda."
      sections={[
        {
          title: 'Datos que proporcionas',
          body: 'Al realizar una compra, introduces tus datos de contacto y entrega. En la cuenta puedes editar tu perfil y dirección.',
        },
        {
          title: 'Información en este navegador',
          body: 'La cuenta se conserva durante la sesión; el carrito y los favoritos permanecen guardados en este navegador.',
        },
      ]}
    />
  )
}

export function TermsPage() {
  return (
    <InformationPage
      current="Términos y condiciones"
      title="Términos y condiciones"
      description="Revisa la información disponible antes de confirmar tu pedido."
      sections={[
        {
          title: 'Productos y precios',
          body: 'Cada ficha muestra las presentaciones disponibles, su precio y la descripción del perfume.',
        },
        {
          title: 'Pedido y entrega',
          body: 'En el proceso de compra puedes revisar los artículos, el destino, el costo de envío y el total antes de continuar.',
        },
      ]}
    />
  )
}

export function ComplaintsBookPage() {
  return (
    <InformationPage
      current="Libro de reclamaciones"
      title="Libro de reclamaciones"
      description="Comunícanos una incidencia o consulta relacionada con tu experiencia de compra."
      sections={[
        {
          title: 'Cuéntanos qué ocurrió',
          body: 'Describe tu consulta con claridad e indica el producto o servicio al que se refiere.',
        },
        {
          title: 'Incluye tu pedido',
          body: 'Si tu consulta está relacionada con una compra, agrega el código de pedido que aparece en la confirmación.',
        },
      ]}
    />
  )
}
