import { Link } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { getShippingSettings } from '../../services/admin-service'
import { formatPEN } from '../../services/currency'

interface InstitutionalBreadcrumbProps {
  current: string
}

function InstitutionalBreadcrumb({ current }: InstitutionalBreadcrumbProps) {
  return (
    <nav
      className="institutional-breadcrumb"
      aria-label="Ruta de navegación"
      data-scroll-reveal="fade"
    >
      <Link to="/">Inicio</Link>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{current}</span>
    </nav>
  )
}

interface InstitutionalIntroProps {
  eyebrow: string
  title: string
  description: string
}

function InstitutionalIntro({
  eyebrow,
  title,
  description,
}: InstitutionalIntroProps) {
  return (
    <header className="institutional-intro" data-scroll-reveal="copy">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  )
}

export function AboutPage() {
  return (
    <article className="store-page institutional-page institutional-about">
      <div className="container">
        <InstitutionalBreadcrumb current="Nosotros" />
        <InstitutionalIntro
          eyebrow="Aroma Infini"
          title="Un espacio para descubrir lo que te representa."
          description="Una propuesta multimarca para explorar perfumes con claridad, atención y criterio."
        />
      </div>
      <figure className="institutional-about-visual" data-scroll-reveal="image">
        <img
          src="/images/editorial-essential-v3-1536.webp"
          srcSet="/images/editorial-essential-v3-480.webp 480w, /images/editorial-essential-v3-960.webp 960w, /images/editorial-essential-v3-1536.webp 1536w"
          sizes="100vw"
          width={1672}
          height={941}
          alt="Composición editorial temporal de un perfume sobre piedra y madera"
        />
        <figcaption>Imagen conceptual temporal</figcaption>
      </figure>
      <div
        className="container institutional-story-grid"
        data-scroll-reveal="stagger"
      >
        <section aria-labelledby="about-origin">
          <span>01</span>
          <p className="eyebrow">Descubrimiento</p>
          <h2 id="about-origin">Elegir desde lo que sientes.</h2>
          <p>
            Empieza por una familia olfativa, una firma o una forma de llevar el
            perfume.
          </p>
        </section>
        <section aria-labelledby="about-selection">
          <span>02</span>
          <p className="eyebrow">Criterio de selección</p>
          <h2 id="about-selection">Elegir con intención.</h2>
          <p>
            La propuesta parte de una selección multimarca clara y de una forma
            cercana de acompañar el descubrimiento de cada perfume.
          </p>
        </section>
        <section aria-labelledby="about-attention">
          <span>03</span>
          <p className="eyebrow">Claridad</p>
          <h2 id="about-attention">Entender antes de elegir.</h2>
          <p>
            Cada ficha prioriza presentación, precio, familia y disponibilidad
            para facilitar la comparación.
          </p>
        </section>
      </div>
      <div
        className="institutional-closing container"
        data-scroll-reveal="copy"
      >
        <p>Una selección breve, pensada para descubrir sin prisa.</p>
        <Link className="button button--primary" to="/catalogo">
          Explorar perfumes <Icon name="arrow" />
        </Link>
      </div>
    </article>
  )
}

export function ContactPage() {
  return (
    <article className="store-page institutional-page container">
      <InstitutionalBreadcrumb current="Contacto" />
      <InstitutionalIntro
        eyebrow="Conversemos"
        title="Tu elección puede empezar con una conversación."
        description="Publicaremos aquí el canal y el horario de atención cuando estén confirmados. Esta propuesta todavía no recibe mensajes."
      />
      <div className="institutional-contact-grid" data-scroll-reveal="stagger">
        <section aria-labelledby="contact-guidance">
          <p className="eyebrow">Mientras tanto</p>
          <h2 id="contact-guidance">Encuentra una primera orientación.</h2>
          <p>
            Revisa la selección por marca, familia y presentación para comparar
            cada propuesta con claridad.
          </p>
          <Link className="text-link" to="/catalogo">
            Ir al catálogo <Icon name="arrow" />
          </Link>
        </section>
        <aside className="institutional-contact-note" role="note">
          <p className="eyebrow">Canales en preparación</p>
          <p>El canal y el horario se mostrarán juntos cuando estén listos.</p>
        </aside>
      </div>
    </article>
  )
}

export function ShippingPage() {
  const shipping = getShippingSettings()
  const activeZones = shipping.zones.filter((zone) => zone.active)
  return (
    <article className="store-page institutional-page container">
      <InstitutionalBreadcrumb current="Envíos y entregas" />
      <InstitutionalIntro
        eyebrow="Entrega en Perú"
        title="Lo esencial para recibir tu pedido."
        description={`Envíos en las zonas habilitadas, gratis desde ${formatPEN(shipping.freeThresholdCents)}.`}
      />
      <div
        className="institutional-facts"
        aria-label="Datos confirmados de entrega"
        data-scroll-reveal="stagger"
      >
        <section>
          <span>01</span>
          <h2>Cobertura</h2>
          <p>
            {activeZones.length
              ? activeZones.map((zone) => zone.name).join(', ')
              : 'Cobertura temporalmente no disponible.'}
          </p>
        </section>
        <section>
          <span>02</span>
          <h2>Envío gratis</h2>
          <p>Disponible desde {formatPEN(shipping.freeThresholdCents)}.</p>
        </section>
        {activeZones.map((zone, index) => (
          <section key={zone.id}>
            <span>{String(index + 3).padStart(2, '0')}</span>
            <h2>{zone.name}</h2>
            <p>{zone.estimate}.</p>
          </section>
        ))}
      </div>
      <aside className="institutional-pending-note" data-scroll-reveal="copy">
        <p className="eyebrow">Operación pendiente</p>
        <p>
          El courier, las tarifas por destino, los días hábiles o calendario y
          las posibles restricciones se publicarán después de su validación.
          Aroma Infini operará únicamente con delivery; no se ha confirmado
          recojo.
        </p>
      </aside>
    </article>
  )
}

export function ReturnsPage() {
  return (
    <article className="store-page institutional-page container">
      <InstitutionalBreadcrumb current="Cambios y devoluciones" />
      <InstitutionalIntro
        eyebrow="Política en revisión"
        title="Cambios y devoluciones."
        description="La política comercial todavía está en revisión. Publicaremos plazos, condiciones y canales antes de habilitar las ventas."
      />
      <p
        className="institutional-legal-warning"
        role="note"
        data-scroll-reveal="copy"
      >
        Aún no se reciben solicitudes desde esta propuesta. La versión comercial
        mostrará la política aprobada y su canal de atención.
      </p>
    </article>
  )
}

export function FaqPage() {
  const shipping = getShippingSettings()
  const activeZones = shipping.zones.filter((zone) => zone.active)
  const faqItems = [
    {
      question: '¿Realizan envíos en Perú?',
      answer: activeZones.length
        ? `La demostración tiene cobertura configurada para ${activeZones.map((zone) => zone.name).join(', ')}.`
        : 'La cobertura todavía no está configurada.',
    },
    {
      question: '¿Cuándo aplica el envío gratis?',
      answer: `La referencia configurada es desde ${formatPEN(shipping.freeThresholdCents)}. Sus condiciones finales se definirán antes de habilitar ventas.`,
    },
    {
      question: '¿Cuánto demora una entrega?',
      answer: activeZones.length
        ? activeZones
            .map((zone) => `${zone.name}: ${zone.estimate.toLowerCase()}`)
            .join(' · ')
        : 'Los tiempos todavía no están configurados.',
    },
    {
      question: '¿Puedo comprar desde esta propuesta?',
      answer:
        'No. El catálogo, carrito, checkout y seguimiento actuales son una demostración frontend sin cobros ni pedidos reales.',
    },
  ]
  return (
    <article className="store-page institutional-page container">
      <InstitutionalBreadcrumb current="Preguntas frecuentes" />
      <InstitutionalIntro
        eyebrow="Información esencial"
        title="Respuestas breves para avanzar con claridad."
        description="Consulta envíos, tiempos y alcance de esta propuesta."
      />
      <div className="institutional-faq" data-scroll-reveal="stagger">
        {faqItems.map((item) => (
          <details key={item.question}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </article>
  )
}

interface LegalSection {
  title: string
  copy: string
}

interface LegalPageProps {
  current: string
  eyebrow: string
  title: string
  description: string
  sections: LegalSection[]
}

function LegalPage({
  current,
  eyebrow,
  title,
  description,
  sections,
}: LegalPageProps) {
  return (
    <article className="store-page institutional-page institutional-legal container">
      <InstitutionalBreadcrumb current={current} />
      <InstitutionalIntro
        eyebrow={eyebrow}
        title={title}
        description={description}
      />
      <p
        className="institutional-legal-warning"
        role="note"
        data-scroll-reveal="copy"
      >
        Borrador estructural · Requiere contenido y validación legal antes de su
        publicación.
      </p>
      <div
        className="institutional-legal-sections"
        data-scroll-reveal="stagger"
      >
        {sections.map((section, index) => (
          <section key={section.title} aria-labelledby={`legal-${index}`}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h2 id={`legal-${index}`}>{section.title}</h2>
            <p>{section.copy}</p>
          </section>
        ))}
      </div>
    </article>
  )
}

export function PrivacyPage() {
  return (
    <LegalPage
      current="Privacidad"
      eyebrow="Documento pendiente"
      title="Privacidad."
      description="La política definitiva deberá identificar al responsable, los datos tratados, sus finalidades, bases aplicables, conservación y canales para ejercer derechos."
      sections={[
        {
          title: 'Responsable y contacto',
          copy: 'Razón social, identificación y canal de privacidad pendientes.',
        },
        {
          title: 'Datos y finalidades',
          copy: 'Alcance sujeto a la arquitectura final de cuenta, pedidos, pagos y atención.',
        },
        {
          title: 'Proveedores y conservación',
          copy: 'Plazos, encargados y transferencias pendientes de definición técnica y legal.',
        },
        {
          title: 'Derechos',
          copy: 'Procedimiento y canal de ejercicio pendientes de validación.',
        },
      ]}
    />
  )
}

export function TermsPage() {
  return (
    <LegalPage
      current="Términos y condiciones"
      eyebrow="Documento pendiente"
      title="Términos y condiciones."
      description="La estructura está preparada para las condiciones comerciales reales. Ningún texto de esta vista constituye todavía una condición de venta."
      sections={[
        {
          title: 'Identificación del proveedor',
          copy: 'Razón social, RUC, domicilio y canales pendientes.',
        },
        {
          title: 'Catálogo y precios',
          copy: 'Disponibilidad, moneda, vigencia y corrección de información pendientes.',
        },
        {
          title: 'Pago y confirmación',
          copy: 'Condiciones sujetas a la integración final con Mercado Pago y el backend.',
        },
        {
          title: 'Entrega y posventa',
          copy: 'Cobertura, plazos, cambios, devoluciones y reclamos pendientes.',
        },
      ]}
    />
  )
}

export function ComplaintsBookPage() {
  return (
    <article className="store-page institutional-page container">
      <InstitutionalBreadcrumb current="Libro de reclamaciones" />
      <InstitutionalIntro
        eyebrow="Implementación pendiente"
        title="Libro de reclamaciones."
        description="El formulario oficial no está habilitado en esta propuesta. Requiere la identificación legal del proveedor, numeración, tratamiento seguro y un canal real de recepción."
      />
      <div
        className="institutional-complaints-state"
        role="note"
        data-scroll-reveal="copy"
      >
        <p className="eyebrow">Sin envío de datos</p>
        <h2>Esta vista no registra reclamos.</h2>
        <p>
          La versión comercial deberá implementarse con respaldo de servidor,
          constancia y contenido legal aprobado. No añadimos un formulario que
          pueda hacer creer que una solicitud fue recibida.
        </p>
      </div>
    </article>
  )
}
