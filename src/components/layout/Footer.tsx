import { Link } from 'react-router'
import { footerGroups } from '../../content/navigation'

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top" data-scroll-reveal="stagger">
          <div className="footer-brand">
            <Link to="/" className="wordmark">
              Aroma Infini.
            </Link>
            <p>Perfumes. Identidad. Descubrimiento.</p>
            <span className="eyebrow">PERÚ</span>
          </div>
          {footerGroups.map((group) => (
            <div
              key={group.title}
              className={`footer-group footer-group--${group.layout ?? 'standard'}`}
            >
              <h2 className={group.title === 'Aroma Infini' ? 'brand-label' : undefined}>{group.title}</h2>
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
