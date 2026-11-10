let registration: Promise<ServiceWorkerRegistration> | undefined

/** Push-only worker: it never intercepts requests or caches private pages. */
export function getAdminPushRegistration(): Promise<ServiceWorkerRegistration> {
  if (!window.isSecureContext || !('serviceWorker' in navigator))
    return Promise.reject(
      new Error('Este navegador no permite instalar las notificaciones.'),
    )
  registration ??= navigator.serviceWorker
    .register('/admin/sw.js', {
      scope: '/admin/',
      updateViaCache: 'none',
    })
    .then(async (worker) => {
      if (!worker.active) {
        await new Promise<void>((resolve, reject) => {
          const installing = worker.installing ?? worker.waiting
          if (!installing) {
            reject(new Error('No pudimos activar las notificaciones.'))
            return
          }
          const timeout = window.setTimeout(
            () =>
              reject(
                new Error('La instalación está tardando. Inténtalo de nuevo.'),
              ),
            15000,
          )
          const changed = () => {
            if (
              installing.state === 'activated' ||
              installing.state === 'redundant'
            ) {
              window.clearTimeout(timeout)
              installing.removeEventListener('statechange', changed)
              if (installing.state === 'activated') resolve()
              else reject(new Error('No pudimos activar las notificaciones.'))
            }
          }
          installing.addEventListener('statechange', changed)
          changed()
        })
      }
      return worker
    })
    .catch((error: unknown) => {
      registration = undefined
      throw error
    })
  return registration
}

/** Manifest exists only while visiting the protected administrative application. */
export function mountAdminPwa(): () => void {
  const manifest = document.createElement('link')
  manifest.rel = 'manifest'
  manifest.href = '/admin/manifest.webmanifest'
  const icon = document.createElement('link')
  icon.rel = 'apple-touch-icon'
  icon.href = '/admin/icons/apple-touch-icon.png'
  const title = document.createElement('meta')
  title.name = 'apple-mobile-web-app-title'
  title.content = 'Aroma Admin'
  document.head.append(manifest, icon, title)
  // Registration is safe without a notification prompt or subscription.
  if (window.isSecureContext && 'serviceWorker' in navigator)
    void getAdminPushRegistration().catch(() => {})
  return () => {
    manifest.remove()
    icon.remove()
    title.remove()
  }
}
