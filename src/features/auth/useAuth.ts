import { useEffect, useSyncExternalStore } from 'react'
import { authService, adminAuthService } from '../../services/auth-service'
import type { AuthAudience } from '../../domain/auth-navigation'

export function useAuth(audience: AuthAudience = 'customer') {
  const service = audience === 'admin' ? adminAuthService : authService
  useEffect(() => {
    if (service.getSnapshot().status === 'checking') void service.initialize()
  }, [service])
  return useSyncExternalStore(service.subscribe, service.getSnapshot)
}
