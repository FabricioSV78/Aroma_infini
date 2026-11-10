import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import { assetSource } from '../../services/asset-source'

export function AdminAuthShell({
  children,
  feedback,
}: {
  children: ReactNode
  feedback?: ReactNode
}) {
  return (
    <div className="admin-auth">
      <a className="skip-link" href="#auth-title">
        Saltar al acceso
      </a>
      <header className="admin-auth-header">
        <Link to="/" aria-label="Aroma Infini, inicio">
          <img
            src={assetSource('/brand/logo-on-light.svg')}
            width="142"
            height="64"
            alt="Aroma Infini"
          />
        </Link>
        <Link to="/">
          Volver a la tienda <Icon name="arrow" />
        </Link>
      </header>
      <main className="admin-auth-main">{children}</main>
      <footer className="admin-auth-footer">
        Aroma Infini · Panel administrativo
      </footer>
      {feedback}
    </div>
  )
}
