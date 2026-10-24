import { useEffect, useRef } from 'react'
import { useBlocker } from 'react-router'
import { useAdminNotice } from './AdminNoticeProvider'

export function useUnsavedChanges(dirty: boolean) {
  const blocker = useBlocker(dirty)
  const notice = useAdminNotice()
  const confirming = useRef(false)

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  useEffect(() => {
    if (blocker.state !== 'blocked' || confirming.current) return
    confirming.current = true
    void notice
      .confirm({
        title: '¿Salir sin guardar?',
        description:
          'Tienes cambios pendientes. Si sales, perderás los cambios que todavía no se hayan guardado.',
        confirmLabel: 'Salir sin guardar',
        cancelLabel: 'Seguir editando',
        destructive: true,
      })
      .then((confirmed) => {
        confirming.current = false
        if (confirmed) blocker.proceed()
        else blocker.reset()
      })
  }, [blocker, notice])
}
