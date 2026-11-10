import { Link } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { contactPageContent as content } from '../../content/institutional'
import { buildWhatsAppUrl } from '../../utils/whatsapp'
import { InstitutionalBreadcrumb } from './InstitutionalBreadcrumb'
import { useSiteSettings } from '../../services/site-settings-service'
import { socialProfileUrl } from '../../domain/site-settings'
import { ContactSocialIcon } from './ContactSocialIcon'

export function ContactPage() {
  const settings = useSiteSettings()
  const whatsappUrl = buildWhatsAppUrl(settings.contact.whatsapp)
  const contactDetails = {
    email: settings.contact.email,
    hours: settings.contact.hours,
    socialLinks: (
      [
        { key: 'instagram', label: 'Instagram' },
        { key: 'facebook', label: 'Facebook' },
        { key: 'tiktok', label: 'TikTok' },
      ] as const
    ).flatMap((social) => {
      const url = socialProfileUrl(social.key, settings.social[social.key])
      return url ? [{ ...social, url }] : []
    }),
  }

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
                {contactDetails.socialLinks.length > 0 && (
                  <nav
                    className="contact-social"
                    aria-labelledby="contact-social-title"
                  >
                    <h3 id="contact-social-title">Síguenos</h3>
                    <span id="contact-social-external" className="sr-only">
                      Abre en una nueva pestaña
                    </span>
                    <ul>
                      {contactDetails.socialLinks.map((social) => (
                        <li key={social.key}>
                          <a
                            className="contact-social-link"
                            href={social.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-describedby="contact-social-external"
                          >
                            <ContactSocialIcon name={social.key} />
                            <span>{social.label}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </nav>
                )}
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
