import { useLoaderData } from 'react-router'
import { useAuth } from '../auth/useAuth'
import { isRemoteCatalog } from '../../services/catalog-source'
import { useSyncExternalStore } from 'react'
import { adminListAccess } from '../../services/admin-list-access'
import { UserFacingError } from '../../services/admin-messages'

/** Router data belongs to the verified owner that obtained it. Never render an
 * old owner's page during logout, account switching or MFA loss. No data cache. */
export function useAdminListData<T extends { ownerId: string; accessRevision: number }>(): T | null {
  // These private loaders return JSON-only DTOs already validated by services.
  const data = useLoaderData() as T | null
  const auth = useAuth('admin')
  const revision = useSyncExternalStore(adminListAccess.subscribe, adminListAccess.getSnapshot)
  if (isRemoteCatalog && data && data.accessRevision !== revision)
    throw new UserFacingError('session', 'Tu acceso administrativo cambió. Vuelve a iniciar sesión antes de continuar.')
  return isRemoteCatalog && data && auth.status === 'authenticated' &&
    auth.session?.user.id === data.ownerId && auth.session.user.role === 'admin' &&
    auth.session.intent === 'account' && !auth.session.mfaRequired
    ? data : null
}
