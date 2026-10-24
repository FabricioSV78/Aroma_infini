import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

interface EmptyStateProps {
  title: string
  description?: string
  icon?: IconName
  children?: ReactNode
  className?: string
  headingLevel?: 'h2' | 'h3'
  role?: 'status' | 'alert'
}

export function EmptyState({
  title,
  description,
  icon,
  children,
  className = '',
  headingLevel: Heading = 'h2',
  role,
}: EmptyStateProps) {
  return (
    <div className={`ui-empty-state ${className}`} role={role}>
      {icon && <Icon name={icon} className="ui-empty-state__icon" />}
      <Heading>{title}</Heading>
      {description && <p>{description}</p>}
      {children && <div className="ui-empty-state__actions">{children}</div>}
    </div>
  )
}
