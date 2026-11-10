import { useSyncExternalStore } from 'react'
import { authService } from '../../services/auth-service'

export function useAuth() {
  return useSyncExternalStore(authService.subscribe, authService.getSnapshot)
}
