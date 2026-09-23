import { useSyncExternalStore } from 'react'
import { adminService } from '../../services/admin-service'

export function useAdminStore() {
  return useSyncExternalStore(
    adminService.subscribe,
    adminService.getSnapshot,
    adminService.getSnapshot,
  )
}
