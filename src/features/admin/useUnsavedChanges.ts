import { useEffect } from 'react'
import { useBlocker } from 'react-router'

export function useUnsavedChanges(dirty: boolean) {
  const blocker = useBlocker(dirty)

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
    if (blocker.state !== 'blocked') return
    if (window.confirm('Hay cambios sin guardar. ¿Quieres salir y descartarlos?'))
      blocker.proceed()
    else blocker.reset()
  }, [blocker])
}
