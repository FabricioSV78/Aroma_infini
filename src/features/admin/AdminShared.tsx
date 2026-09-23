import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Icon } from '../../components/ui/Icon'
import type { AdminTone } from './admin-utils'

interface AdminPageHeaderProps {
  eyebrow: string
  title: string
  description: string
  action?: { label: string; to: string }
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  action,
}: AdminPageHeaderProps) {
  return (
    <header className="admin-page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? (
        <Link className="button button--primary" to={action.to}>
          {action.label} <Icon name="arrow" />
        </Link>
      ) : null}
    </header>
  )
}

interface AdminStatusProps {
  active: boolean
  label?: string
}

export function AdminStatus({ active, label }: AdminStatusProps) {
  return (
    <span
      className={`admin-badge admin-status admin-badge--${active ? 'success' : 'neutral'}`}
    >
      {label ?? (active ? 'Activo' : 'Inactivo')}
    </span>
  )
}

export function AdminBadge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: AdminTone
  className?: string
}) {
  return (
    <span
      className={`admin-badge admin-badge--${tone}${className ? ` ${className}` : ''}`}
    >
      {children}
    </span>
  )
}

export function AdminNotice({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p className="admin-form-notice" role="status" aria-live="polite">
      {children}
    </p>
  )
}
