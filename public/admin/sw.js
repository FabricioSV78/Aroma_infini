/* Push-only administrative service worker. No fetch handler, caches or credentials. */
self.addEventListener('install', (event) => { event.waitUntil(self.skipWaiting()) })
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()) })

function adminPath(value) {
  // Links are server-generated, but validate again before opening a window.
  if (typeof value !== 'string') return '/admin/notificaciones'
  return /^\/admin\/pedidos\/[A-Za-z0-9-]{1,100}$/.test(value) ? value : '/admin/notificaciones'
}
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    const value = event.data?.json()
    if (value && typeof value === 'object' && !Array.isArray(value)) payload = value
  } catch { /* Display a generic safe notice. */ }
  const test = payload.kind === 'test'
  const order = payload.kind === 'new_order'
  const id = typeof payload.id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(payload.id) ? payload.id : 'general'
  event.waitUntil((async () => { await self.registration.showNotification(
    test ? 'Aroma Infini — Prueba' : order ? 'Aroma Infini — Nuevo pedido' : 'Aroma Infini Admin',
    {
      body: test ? 'Las notificaciones están habilitadas en este dispositivo.' : order ? 'Se ha recibido un nuevo pedido. Toca para revisar los detalles.' : 'Toca para revisar las notificaciones del panel.',
      icon: '/admin/icons/icon-192.png', badge: '/admin/icons/badge.png',
      tag: `aroma-admin-${id}`, renotify: false,
      data: { url: adminPath(payload.url) },
    },
  )
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      const url = new URL(client.url)
      if (url.origin === self.location.origin && (url.pathname === '/admin' || url.pathname.startsWith('/admin/')))
        try { client.postMessage({ type: 'ADMIN_NOTIFICATION_RECEIVED' }) } catch { /* The window closed. */ }
    }
  })())
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(adminPath(event.notification.data?.url), self.location.origin).href
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const admin = windows.find((client) => {
      const current = new URL(client.url)
      return current.origin === self.location.origin && (current.pathname === '/admin' || current.pathname.startsWith('/admin/'))
    })
    if (admin && 'navigate' in admin) { await admin.navigate(url); await admin.focus() }
    else await self.clients.openWindow(url)
  })())
})
