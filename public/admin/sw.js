/* Push-only administrative service worker. No fetch handler, caches or credentials. */
self.addEventListener('install', (event) => { event.waitUntil(self.skipWaiting()) })
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()) })

function adminPath(value) {
  // Links are server-generated, but validate again before opening a window.
  if (typeof value !== 'string') return '/admin/notificaciones'
  return /^\/admin\/pedidos\/[A-Za-z0-9-]{1,100}$/.test(value) ? value : '/admin/notificaciones'
}

// IDs and timestamps only. Never cache orders, customer data or credentials.
// Serialize this worker's push events; persisted IDs survive a worker restart.
// Storage failures fall back to the stable OS tag instead of losing an alert.
const shownRetentionMs = 24 * 60 * 60 * 1000
const maximumShownIds = 512
let pushQueue = Promise.resolve()
async function openShownIds() {
  if (!self.indexedDB) return null
  return new Promise((resolve, reject) => {
    const request = self.indexedDB.open('aroma-admin-push-events-v1', 1)
    let settled = false
    const timeout = setTimeout(() => {
      settled = true
      reject(new Error('Push event storage unavailable'))
    }, 2000)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('shown', { keyPath: 'id' })
      store.createIndex('shownAt', 'shownAt')
    }
    request.onsuccess = () => {
      clearTimeout(timeout)
      if (settled) request.result.close()
      else { settled = true; resolve(request.result) }
    }
    request.onerror = request.onblocked = () => {
      clearTimeout(timeout)
      if (!settled) { settled = true; reject(new Error('Push event storage unavailable')) }
    }
  })
}
function alreadyShown(database, id) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('shown', 'readonly')
    const request = transaction.objectStore('shown').get(id)
    transaction.oncomplete = () => resolve(Boolean(request.result && request.result.shownAt > Date.now() - shownRetentionMs))
    transaction.onerror = transaction.onabort = () => reject(new Error('Push event read unavailable'))
  })
}
function rememberShown(database, id) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('shown', 'readwrite')
    const store = transaction.objectStore('shown')
    store.put({ id, shownAt: Date.now() })
    const count = store.count()
    count.onsuccess = () => {
      let remaining = count.result
      const cursor = store.index('shownAt').openCursor()
      cursor.onsuccess = () => {
        const entry = cursor.result
        if (!entry) return
        if (entry.value.shownAt <= Date.now() - shownRetentionMs || remaining > maximumShownIds) {
          entry.delete()
          remaining--
          entry.continue()
        }
      }
    }
    transaction.oncomplete = () => resolve()
    transaction.onerror = transaction.onabort = () => reject(new Error('Push event write unavailable'))
  })
}
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    const value = event.data?.json()
    if (value && typeof value === 'object' && !Array.isArray(value)) payload = value
  } catch { /* Display a generic safe notice. */ }
  const test = payload.kind === 'test'
  const simulated = payload.kind === 'simulated_order'
  const order = payload.kind === 'new_order' || simulated
  const validId = typeof payload.id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(payload.id)
  const id = validId ? payload.id : 'general'
  const url = adminPath(payload.url)
  const reference = order && url.startsWith('/admin/pedidos/') ? url.slice('/admin/pedidos/'.length) : null
  const show = async () => {
    let database = null
    let duplicate = false
    if (validId && (order || test)) {
      try { database = await openShownIds(); duplicate = database ? await alreadyShown(database, id) : false } catch { /* OS tag is the fallback. */ }
    }
    try {
      if (!duplicate) {
        await self.registration.showNotification(
          test ? 'Aroma Infini — Prueba' : simulated ? 'Aroma Infini — Pedido de prueba' : order ? 'Aroma Infini — Nuevo pedido' : 'Aroma Infini Admin',
          {
            body: test ? 'Las notificaciones están habilitadas en este dispositivo.' : reference ? `${simulated ? 'Pedido de prueba' : 'Pedido'} ${reference} recibido. Toca para revisar.` : order ? 'Se ha recibido un nuevo pedido. Toca para revisar los detalles.' : 'Toca para revisar las notificaciones del panel.',
            icon: '/admin/icons/icon-192.png', badge: '/admin/icons/badge.png',
            tag: `aroma-admin-${id}`, renotify: false,
            silent: false, vibrate: [200, 100, 200], lang: 'es-PE',
            data: { url },
          },
        )
        if (database) try { await rememberShown(database, id) } catch { /* Show succeeded; OS tag remains stable. */ }
      }
    } finally { database?.close() }
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of windows) {
      const url = new URL(client.url)
      if (url.origin === self.location.origin && (url.pathname === '/admin' || url.pathname.startsWith('/admin/')))
        try { client.postMessage({ type: 'ADMIN_NOTIFICATION_RECEIVED' }) } catch { /* The window closed. */ }
    }
  }
  pushQueue = pushQueue.catch(() => {}).then(show)
  event.waitUntil(pushQueue)
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destination = new URL(adminPath(event.notification.data?.url), self.location.origin)
  destination.searchParams.set('adminLaunch', 'notification')
  const url = destination.href
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
