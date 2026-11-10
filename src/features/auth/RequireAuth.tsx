import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { authPath, type AuthAudience } from '../../domain/auth-navigation'
import { InlineStatus } from '../../components/ui/InlineStatus'
import { useAuth } from './useAuth'

export function RequireAuth({
  audience,
  children,
}: {
  audience: AuthAudience
  children: ReactNode
}) {
  const auth = useAuth()
  const location = useLocation()
  if (auth.status === 'checking')
    return <InlineStatus busy>Verificando acceso…</InlineStatus>
  if (
    auth.status !== 'authenticated' ||
    auth.session?.intent !== 'account' ||
    (audience === 'admin' &&
      (auth.session.user.role !== 'admin' || auth.session.mfaRequired === true))
  )
    return (
      <Navigate
        replace
        to={authPath(
          audience,
          'login',
          `${location.pathname}${location.search}${location.hash}`,
        )}
      />
    )
  return children
}
