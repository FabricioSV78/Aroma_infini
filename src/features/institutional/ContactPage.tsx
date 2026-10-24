import { Link } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import {
  contactDetails,
  contactPageContent as content,
} from '../../content/institutional'
import { buildWhatsAppUrl } from '../../utils/whatsapp'
import { InstitutionalBreadcrumb } from './InstitutionalBreadcrumb'

export function ContactPage() {
  const whatsappUrl = buildWhatsAppUrl(contactDetails.whatsappNumber)

  return (
    <article className="store-page institutional-page institutional-contact service-page">
      <div className="container">
        <InstitutionalBreadcrumb current="Contacto" />
        <div className="contact-layout">
          <header
            className="contact-heading service-intro"
            data-scroll-reveal="copy"
          >
            <h1>{content.title}</h1>
            <p>{content.introduction}</p>
          </header>
          <div className="contact-services">
            <section
              className="contact-conversation"
              aria-labelledby="contact-direct-title"
              data-scroll-reveal="copy"
            >
              <div className="contact-message">
                <span className="contact-channel-icon">
                  <Icon name="chat" />
                </span>
                <div className="contact-copy">
                  <p className="eyebrow">{content.direct.eyebrow}</p>
                  <h2 id="contact-direct-title">
                    {whatsappUrl ? content.direct.title : 'Hablemos'}
                  </h2>
                  <p>
                    {whatsappUrl
                      ? content.direct.description
                      : 'Encuentra aquí la información para contactar con nosotros.'}
                  </p>
                  {contactDetails.hours && (
                    <p className="contact-hours">
                      Horario de atención: {contactDetails.hours}
                    </p>
                  )}
                </div>
              </div>
              <div className="contact-actions">
                {whatsappUrl && (
                  <a
                    className="button button--primary"
                    href={whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {content.direct.action} <Icon name="arrow" />
                  </a>
                )}
                {contactDetails.email && (
                  <a
                    className="text-link"
                    href={`mailto:${contactDetails.email}`}
                  >
                    {contactDetails.email} <Icon name="arrow" />
                  </a>
                )}
                {contactDetails.socialLinks.map((social) => (
                  <a
                    className="text-link"
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    key={social.url}
                  >
                    {social.label} <Icon name="arrow" />
                  </a>
                ))}
              </div>
            </section>
            <section
              className="contact-help"
              aria-labelledby="contact-guide-title"
              data-scroll-reveal="copy"
            >
              <h2 id="contact-guide-title">{content.guide.title}</h2>
              <ul>
                {content.topics.map((topic) => (
                  <li key={topic.to}>
                    <Link to={topic.to}>
                      <Icon
                        name={topic.to === '/envios' ? 'truck' : 'package'}
                      />
                      <span>{topic.title}</span>
                      <Icon name="arrow" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </article>
  )
}
