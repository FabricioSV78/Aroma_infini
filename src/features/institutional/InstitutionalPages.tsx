import { Link } from 'react-router'
import { useSyncExternalStore } from 'react'
import { Icon } from '../../components/ui/Icon'
import { adminService } from '../../services/admin-service'
import { formatPEN } from '../../services/currency'
import { InstitutionalBreadcrumb } from './InstitutionalBreadcrumb'

interface InstitutionalIntroProps {
  title: string
  description: string
}

function InstitutionalIntro({
  title,
  description,
}: InstitutionalIntroProps) {
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

export function ShippingPage() {
  const shipping = useSyncExternalStore(
    adminService.subscribe,
    adminService.getSnapshot,
  ).shipping
  return (
    <article className="store-page institutional-page institutional-shipping container">
      <InstitutionalBreadcrumb current="Envíos y entregas" />
      <InstitutionalIntro
        title="Tu pedido, de principio a fin."
        description="Enviamos a todo el Perú."
      />
      <div className="shipping-editorial-layout">
        <section
          className="shipping-rate-card"
          aria-labelledby="shipping-rates-title"
          data-scroll-reveal="copy"
        >
          <div className="shipping-card-heading">
            <Icon name="truck" />
            <h2 id="shipping-rates-title">Tarifas y plazos</h2>
          </div>
          <dl className="institutional-shipping-summary">
            <div>
              <dt>Tarifa base</dt>
              <dd>{formatPEN(shipping.nationalCourierFeeCents)}</dd>
            </div>
            {shipping.freeThresholdCents > 0 ? (
              <div>
                <dt>Envío gratis desde</dt>
                <dd>{formatPEN(shipping.freeThresholdCents)}</dd>
              </div>
            ) : null}
            <div>
              <dt>Plazo estimado</dt>
              <dd>{shipping.nationalEstimate}</dd>
            </div>
          </dl>
          <p className="shipping-rate-note">
            Confirma el costo y el plazo para tu dirección antes de pagar.
          </p>
        </section>
        <section
          className="shipping-journey"
          aria-labelledby="shipping-journey-title"
          data-scroll-reveal="copy"
        >
          <h2 id="shipping-journey-title">Así llega tu pedido</h2>
          <ol>
            <li>
              <span aria-hidden="true">01</span>
              <div>
                <h3>Indica tu destino</h3>
                <p>Elige dónde recibirlo.</p>
              </div>
            </li>
            <li>
              <span aria-hidden="true">02</span>
              <div>
                <h3>Revisa tu entrega</h3>
                <p>Consulta el costo y el plazo.</p>
              </div>
            </li>
            <li>
              <span aria-hidden="true">03</span>
              <div>
                <h3>Sigue tu pedido</h3>
                <p>Revisa su estado con tu código.</p>
                <Link className="text-link" to="/seguir-pedido">
                  Seguir mi pedido <Icon name="arrow" />
                </Link>
              </div>
            </li>
          </ol>
        </section>
      </div>
      <aside className="shipping-help" data-scroll-reveal="copy">
        <div>
          <Icon name="chat" />
          <p>¿Dudas sobre tu entrega?</p>
        </div>
        <Link className="text-link" to="/contacto">
          Consultar entrega <Icon name="arrow" />
        </Link>
      </aside>
    </article>
  )
}

export function ReturnsPage() {
  return (
    <article className="store-page institutional-page container">
      <InstitutionalBreadcrumb current="Cambios y devoluciones" />
      <InstitutionalIntro
        title="Cambios y devoluciones."
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
      <InstitutionalIntro
        title={title}
        description={description}
      />
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
      title="Privacidad."
      description="Conoce qué información compartes al usar la tienda."
      sections={[
        {
          title: 'Datos que proporcionas',
          body: 'Al realizar una compra, introduces tus datos de contacto y entrega. En la cuenta puedes editar tu perfil y dirección.',
        },
        {
          title: 'Información en este navegador',
          body: 'La cuenta y las preferencias de compra se conservan durante la sesión en este navegador para que puedas continuar donde quedaste.',
        },
      ]}
    />
  )
}

export function TermsPage() {
  return (
    <InformationPage
      current="Términos y condiciones"
      title="Términos y condiciones."
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
      title="Libro de reclamaciones."
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
