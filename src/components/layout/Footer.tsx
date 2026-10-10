import { Link } from 'react-router'
import { footerGroups } from '../../content/navigation'
import { footerSocialProfiles } from '../../content/social'
import { Icon } from '../ui/Icon'

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top" data-scroll-reveal="stagger">
          <div className="footer-brand">
            <Link to="/" className="wordmark" aria-label="Aroma Infini, inicio">
              <img
                className="brand-logo"
                src="/brand/logo-on-light.svg"
                alt=""
                width="774"
                height="374"
                loading="lazy"
              />
            </Link>
            <p>Perfumes. Identidad. Descubrimiento.</p>
            <span className="eyebrow">PERÚ</span>
            <div
              className="footer-social"
              aria-labelledby="footer-social-title"
            >
              <h2 id="footer-social-title">Síguenos</h2>
              <ul>
                {footerSocialProfiles.map((profile) => (
                  <li key={profile.label}>
                    {profile.url ? (
                      <a
                        href={profile.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${profile.label} de Aroma Infini, abre en una nueva pestaña`}
                      >
                        <Icon name={profile.icon} />
                      </a>
                    ) : (
                      <span
                        className="footer-social-placeholder"
                        title={`${profile.label}: perfil pendiente`}
                      >
                        <Icon name={profile.icon} />
                        <span className="sr-only">
                          {profile.label}: perfil pendiente
                        </span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {footerSocialProfiles.some((profile) => !profile.url) && (
                <p>Perfiles en preparación.</p>
              )}
            </div>
          </div>
          {footerGroups.map((group) => (
            <div
              key={group.title}
              className={`footer-group footer-group--${group.layout ?? 'standard'}`}
            >
              <h2
                className={
                  group.title === 'Aroma Infini' ? 'brand-label' : undefined
                }
              >
                {group.title}
              </h2>
              <ul>
                {group.links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="footer-bottom" data-scroll-reveal="copy">
          <span>© {new Date().getFullYear()} Aroma Infini</span>
          <div>
            <Link to="/privacidad">Privacidad</Link>
            <Link to="/terminos">Términos y condiciones</Link>
            <Link to="/libro-de-reclamaciones">Libro de reclamaciones</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
