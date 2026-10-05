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
    <article className="store-page institutional-page institutional-contact">
      <div className="container">
        <InstitutionalBreadcrumb current="Contacto" />
        <header
          className="institutional-contact-opening"
          data-scroll-reveal="copy"
        >
          <div className="institutional-contact-opening-copy">
            <h1>{content.title}</h1>
            <p>{content.introduction}</p>
          </div>
        </header>

        <div className="institutional-contact-options">
          <section
            className="institutional-contact-direct"
            aria-labelledby="contact-direct-title"
            data-scroll-reveal="copy"
          >
            <p className="eyebrow">{content.direct.eyebrow}</p>
            <h2 id="contact-direct-title">
              {whatsappUrl
                ? content.direct.title
                : 'Hablemos.'}
            </h2>
            <p>
              {whatsappUrl
                ? content.direct.description
                : 'Encuentra aquí la información para contactar con nosotros.'}
            </p>
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
              <a className="text-link" href={`mailto:${contactDetails.email}`}>
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
            {contactDetails.hours && (
              <p className="institutional-contact-hours">
                Horario de atención: {contactDetails.hours}
              </p>
            )}
          </section>

          <section
            className="institutional-contact-guide"
            aria-labelledby="contact-guide-title"
            data-scroll-reveal="copy"
          >
            <p className="eyebrow">{content.guide.eyebrow}</p>
            <h2 id="contact-guide-title">{content.guide.title}</h2>
            <ul>
              {content.topics.map((topic) => (
                <li key={topic.to}>
                  <Link to={topic.to}>
                    <span>{topic.title}</span>
                    <Icon name="arrow" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </article>
  )
}
