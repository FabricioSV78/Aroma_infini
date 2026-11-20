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
  const auth = useAuth(audience)
  const location = useLocation()
  if (auth.status === 'checking')
    return <InlineStatus busy>Verificando acceso…</InlineStatus>
  if (auth.status === 'error')
    return (
      <section role="alert">
        <p>{auth.message}</p>
        <button
          type="button"
          className="button button--secondary"
          onClick={() => {
            void (audience === 'admin'
              ? import('../../services/auth-service').then((m) =>
                  m.adminAuthService.refresh(),
                )
              : import('../../services/auth-service').then((m) =>
                  m.authService.refresh(),
                ))
          }}
        >
          Volver a intentar
        </button>
      </section>
    )
  if (
    auth.status !== 'authenticated' ||
    auth.session?.intent !== 'account' ||
    (audience === 'customer' && auth.session.user.role !== 'customer') ||
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
