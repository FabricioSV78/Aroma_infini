import type { ReactNode } from 'react'
import { Spinner } from './Spinner'

interface InlineStatusProps {
  children: ReactNode
  busy?: boolean
  role?: 'status' | 'alert'
  className?: string
  id?: string
}

export function InlineStatus({
  children,
  busy = false,
  role = 'status',
  className = '',
  id,
}: InlineStatusProps) {
  return (
    <p className={`ui-inline-status ${className}`} role={role} id={id}>
      {busy && <Spinner />}
      <span>{children}</span>
    </p>
  )
}
