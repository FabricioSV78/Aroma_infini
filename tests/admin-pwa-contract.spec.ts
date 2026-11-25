import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import sharp from 'sharp'
import { classifyRoute } from '../worker/route-policy'
import { adminPwaEntryDestination } from '../src/domain/admin-pwa-entry'

const source = readFileSync('public/admin/sw.js', 'utf8')
type BrowserEvent = {
  waitUntil: (promise: Promise<unknown>) => void
  data?: { json: () => unknown }
  notification?: unknown
}
function runtime(
  windows: Array<{
    url: string
    navigate: (url: string) => Promise<void>
    focus: () => Promise<void>
    postMessage: (message: unknown) => void
  }> = [],
) {
  const handlers: Record<string, (event: BrowserEvent) => void> = {}
  const shown: Array<{ title: string; options: Record<string, unknown> }> = []
  const opened: string[] = []
  const self = {
    location: { origin: 'https://aroma.example' },
    addEventListener: (name: string, handler: (typeof handlers)[string]) => {
      handlers[name] = handler
    },
    skipWaiting: async () => {},
    registration: {
      showNotification: async (
        title: string,
        options: Record<string, unknown>,
      ) => {
        shown.push({ title, options })
      },
    },
    clients: {
      claim: async () => {},
      matchAll: async () => windows,
      openWindow: async (url: string) => {
        opened.push(url)
      },
    },
  }
  runInNewContext(source, { self, URL })
  return {
    handlers,
    shown,
    opened,
    async push(data: unknown) {
      let promise = Promise.resolve<unknown>(null)
      handlers.push({
        data: { json: () => data },
        waitUntil: (value) => {
          promise = value
        },
      })
      await promise
    },
    async click(url: string) {
      let promise = Promise.resolve<unknown>(null)
      handlers.notificationclick({
        notification: { close() {}, data: { url } },
        waitUntil: (value) => {
          promise = value
        },
      })
      await promise
    },
  }
}

test('push worker has no request interception, cache storage or authentication material', () => {
  const worker = runtime()
  expect(Object.keys(worker.handlers).sort()).toEqual([
    'activate',
    'install',
    'notificationclick',
    'push',
  ])
  expect(source).not.toMatch(
    /caches\.|localStorage|access_token|refresh_token|Authorization/,
  )
})
test('safe generic lockscreen payload, stable deduplication tag, explicit tests and closed-window path', async () => {
  const worker = runtime()
  await worker.push({
    kind: 'new_order',
    id: 'event-123',
    title: 'Customer PII',
    body: 'Secret address',
    url: '/admin/pedidos/AI-123',
  })
  await worker.push({
    kind: 'new_order',
    id: 'event-123',
    url: '/admin/pedidos/AI-123',
  })
  expect(worker.shown[0].title).toBe('Aroma Infini — Nuevo pedido')
  expect(JSON.stringify(worker.shown)).not.toContain('Secret address')
  expect(worker.shown[0].options.tag).toBe(worker.shown[1].options.tag)
  expect(worker.shown[0].options.body).toContain('AI-123')
  expect(worker.shown[0].options.vibrate).toEqual([200, 100, 200])
  expect(worker.shown[0].options.silent).toBe(false)
  await worker.push({
    kind: 'test',
    id: 'test-123',
    url: 'https://evil.example',
  })
  expect(worker.shown.at(-1)?.title).toBe('Aroma Infini — Prueba')
  await worker.push(null)
  expect(worker.shown.at(-1)?.title).toBe('Aroma Infini Admin')
  await worker.click('/admin/pedidos/AI-123')
  expect(worker.opened).toEqual([
    'https://aroma.example/admin/pedidos/AI-123?adminLaunch=notification',
  ])
})
test('staging operational orders are explicitly identified and cannot inject a title, body or foreign destination', async () => {
  const worker = runtime()
  await worker.push({
    kind: 'simulated_order',
    id: 'operation-123',
    title: 'PRIVATE CUSTOMER',
    body: 'PRIVATE ADDRESS',
    url: '/admin/pedidos/AI-STAGING-123',
  })
  expect(worker.shown[0].title).toBe('Aroma Infini — Pedido de prueba')
  expect(worker.shown[0].options.body).toBe(
    'Pedido de prueba AI-STAGING-123 recibido. Toca para revisar.',
  )
  expect(worker.shown[0].options.data).toEqual({
    url: '/admin/pedidos/AI-STAGING-123',
  })
  expect(JSON.stringify(worker.shown)).not.toContain('PRIVATE')
  await worker.push({
    kind: 'new_order',
    id: 'bad-url',
    url: '/admin/pedidos/../../logout?secret=PRIVATE',
  })
  expect(JSON.stringify(worker.shown)).not.toContain('secret=')
  expect(worker.shown[1].options.data).toEqual({ url: '/admin/notificaciones' })
})
test('click focuses/navigates existing admin window; malicious links remain inside protected admin', async () => {
  const visited: string[] = []
  let focused = false
  const messages: unknown[] = []
  const worker = runtime([
    {
      url: 'https://aroma.example/admin/',
      navigate: async (url) => {
        visited.push(url)
      },
      focus: async () => {
        focused = true
      },
      postMessage: (value) => {
        messages.push(value)
      },
    },
  ])
  await worker.click('https://evil.example/steal')
  expect(visited).toEqual([
    'https://aroma.example/admin/notificaciones?adminLaunch=notification',
  ])
  expect(focused).toBe(true)
  expect(worker.opened).toHaveLength(0)
  await worker.push({ url: '/admin/pedidos/../../../logout' })
  expect(worker.shown[0].options.data).toEqual({ url: '/admin/notificaciones' })
  expect(messages).toEqual([{ type: 'ADMIN_NOTIFICATION_RECEIVED' }])
})
test('an order notification retains its detail destination in an already open admin window', async () => {
  const visited: string[] = []
  let focused = false
  const worker = runtime([
    {
      url: 'https://aroma.example/admin/resumen',
      navigate: async (url) => {
        visited.push(url)
      },
      focus: async () => {
        focused = true
      },
      postMessage: () => {},
    },
  ])

  await worker.click('/admin/pedidos/AI-123')

  expect(visited).toEqual([
    'https://aroma.example/admin/pedidos/AI-123?adminLaunch=notification',
  ])
  expect(focused).toBe(true)
  expect(worker.opened).toHaveLength(0)
})

test('manifest scope/start and platform icons have correct actual dimensions', async () => {
  const manifest = JSON.parse(
    readFileSync('public/admin/manifest.webmanifest', 'utf8'),
  )
  expect(manifest.id).toBe('/admin/')
  expect(manifest.scope).toBe('/admin/')
  expect(manifest.start_url).toBe('/admin/resumen')
  expect(manifest.launch_handler).toEqual({ client_mode: 'navigate-existing' })
  expect(manifest.start_url.startsWith(manifest.scope)).toBe(true)
  expect(manifest.display).toBe('standalone')
  expect(classifyRoute(manifest.start_url)).toBe('app')
  expect(classifyRoute('/admin/pedidos/AI-123')).toBe('app')
  for (const [name, size] of [
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['icon-maskable.png', 512],
    ['apple-touch-icon.png', 180],
  ] as const) {
    const image = await sharp(`public/admin/icons/${name}`).metadata()
    expect([image.width, image.height, image.format]).toEqual([
      size,
      size,
      'png',
    ])
  }
})

test('standalone reopening resets restored routes but consumes notification intent once without bypassing protected routes', () => {
  const url = (path: string) => new URL(path, 'https://aroma.example')
  for (const path of [
    '/admin/productos',
    '/admin/pedidos/AI-123',
    '/admin/promociones?vista=ofertas',
  ]) {
    expect(adminPwaEntryDestination(url(path), true, false)).toBe(
      '/admin/resumen',
    )
    expect(adminPwaEntryDestination(url(path), true, true)).toBeNull()
    expect(adminPwaEntryDestination(url(path), false, false)).toBeNull()
  }
  const notification = url('/admin/pedidos/AI-123?adminLaunch=notification')
  expect(adminPwaEntryDestination(notification, true, false)).toBe(
    '/admin/pedidos/AI-123',
  )
  expect(adminPwaEntryDestination(notification, true, false)).toBe(
    '/admin/resumen',
  )
  expect(
    adminPwaEntryDestination(
      url('/admin/notificaciones?adminLaunch=notification'),
      true,
      false,
    ),
  ).toBe('/admin/notificaciones')
  expect(
    adminPwaEntryDestination(
      url('/admin/productos?adminLaunch=notification'),
      true,
      false,
    ),
  ).toBe('/admin/resumen')
  for (const path of [
    '/admin/login?returnTo=%2Fadmin%2Fpedidos%2FAI-123',
    '/admin/recuperar',
    '/mi-cuenta',
    '/tienda',
    '/administrator',
  ]) {
    expect(adminPwaEntryDestination(url(path), true, false)).toBeNull()
  }
})
