import { Link } from 'react-router'
import { ManagedSiteImage } from '../ManagedSiteImage'
import { footerGroups } from '../../content/navigation'
import { useSiteSettings } from '../../services/site-settings-service'
import { Icon } from '../ui/Icon'

export function Footer() {
  const settings = useSiteSettings()
  const socialProfiles = (
    [
      { key: 'instagram', label: 'Instagram', icon: 'instagram' },
      { key: 'facebook', label: 'Facebook', icon: 'facebook' },
      { key: 'tiktok', label: 'TikTok', icon: 'tiktok' },
    ] as const
  ).flatMap((profile) =>
    settings.social[profile.key]
      ? [{ ...profile, url: settings.social[profile.key] }]
      : [],
  )
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top" data-scroll-reveal="stagger">
          <div className="footer-brand">
            <Link to="/" className="wordmark" aria-label="Aroma Infini, inicio">
              <ManagedSiteImage
                slot="identity.logo"
                className="brand-logo"
                alt=""
                width="774"
                height="374"
                loading="lazy"
              />
            </Link>
            <p>Encuentra tu perfume, nota a nota.</p>
            <span className="eyebrow">PERÚ</span>
            {socialProfiles.length > 0 && (
              <div
                className="footer-social"
                aria-labelledby="footer-social-title"
              >
                <h2 id="footer-social-title">Síguenos</h2>
                <ul>
                  {socialProfiles.map((profile) => (
                    <li key={profile.label}>
                      <a
                        href={profile.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${profile.label} de Aroma Infini, abre en una nueva pestaña`}
                      >
                        <Icon name={profile.icon} />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {footerGroups.map((group) => (
            <div
              key={group.title}
              className={`footer-group footer-group--${group.layout ?? 'standard'}`}
            >
              <h2>{group.title}</h2>
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
