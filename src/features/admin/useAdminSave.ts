import { useRef, useState } from 'react'
import {
  adminService,
  type AdminSaveResult,
} from '../../services/admin-service'
import { getAdminErrorMessage } from '../../services/admin-messages'
import { useAdminNotice } from './AdminNoticeProvider'

/** Keeps a committed local change separate from its pending browser write. */
export function useAdminSave() {
  const notice = useAdminNotice()
  const inFlight = useRef(false)
  const pendingSuccess = useRef<(() => void) | null>(null)
  const [saving, setSaving] = useState(false)
  const [persistenceFailed, setPersistenceFailed] = useState(false)

  function showPersistenceError(error: unknown) {
    const message = getAdminErrorMessage(error, 'storage')
    notice.show({
      ...message,
      description: `${message.description} El cambio sigue aplicado en esta sesión.`,
      primary: {
        label: 'Reintentar guardado',
        onClick: async () => {
          await retry()
          return !pendingSuccess.current
        },
      },
      secondary: { label: 'Revisar después' },
    })
  }

  function complete() {
    const onSaved = pendingSuccess.current
    pendingSuccess.current = null
    setPersistenceFailed(false)
    onSaved?.()
  }

  async function save(
    change: () => AdminSaveResult | void,
    onSaved: () => void,
  ): Promise<AdminSaveResult | undefined> {
    if (inFlight.current || pendingSuccess.current) return
    inFlight.current = true
    setSaving(true)
    try {
      const result = change()
      if (result?.kind === 'validation') return result
      pendingSuccess.current = onSaved
      await adminService.flush()
      complete()
      return { kind: 'saved' }
    } catch (error) {
      if (!pendingSuccess.current) {
        notice.show({
          ...getAdminErrorMessage(error, 'save'),
          primary: { label: 'Volver a editar' },
        })
        return undefined
      }
      setPersistenceFailed(true)
      showPersistenceError(error)
      return undefined
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  async function retry() {
    if (inFlight.current || !pendingSuccess.current) return
    inFlight.current = true
    setSaving(true)
    try {
      await adminService.retryPersistence()
      complete()
    } catch (error) {
      setPersistenceFailed(true)
      // Inline retries may reopen the dialog; an active dialog stays in place.
      showPersistenceError(error)
    } finally {
      inFlight.current = false
      setSaving(false)
    }
  }

  return { saving, persistenceFailed, save, retry }
}
