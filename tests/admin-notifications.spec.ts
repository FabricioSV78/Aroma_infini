import { mkdir } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import {
  expect,
  signIn,
  test as authTest,
  type SupabaseAuthNetwork,
} from './supabase-auth-fixture'
import type { AdminNotification } from '../src/services/admin-notifications'

const publicKey = Buffer.from([
  4,
  ...Array.from({ length: 64 }, (_, index) => index + 1),
]).toString('base64url')
const firstEvent = '0a000000-0000-4000-8000-000000000001'
interface PushNetwork {
  enabled: boolean
  configured: boolean
  failure: string
  requests: Array<{ path: string; body: Record<string, unknown> | null }>
  items: AdminNotification[]
}

const test = authTest.extend<{ pushNetwork: PushNetwork }>({
  pushNetwork: async ({ context, supabaseNetwork }, provide) => {
    void supabaseNetwork
    const network: PushNetwork = {
      enabled: false,
      configured: true,
      failure: '',
      requests: [],
      items: [
        {
          id: firstEvent,
          kind: 'new_order',
          orderReference: 'AI-TEST-0001',
          createdAt: '2026-11-04T14:30:00Z',
          read: false,
        },
      ],
    }
    await context.addInitScript(
      ({ key }) => {
        const state = {
          permission: 'default',
          permissionRequests: 0,
          subscriptions: 0,
          removals: 0,
          hasSubscription: false,
          staleKey: false,
        }
        Reflect.set(window, '__pushFixture', state)
        const keyBuffer = (value: string) =>
          Uint8Array.from(
            atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='),
            (character) => character.charCodeAt(0),
          ).buffer
        function subscription() {
          return {
            options: {
              applicationServerKey: state.staleKey
                ? new Uint8Array(65).buffer
                : keyBuffer(key),
            },
            toJSON: () => ({
              endpoint: 'https://fcm.googleapis.com/fcm/send/isolated-fixture',
              keys: { p256dh: key, auth: 'AQEBAQEBAQEBAQEBAQEBAQ' },
            }),
            unsubscribe: async () => {
              state.hasSubscription = false
              state.removals++
              return true
            },
          }
        }
        const registration = {
          active: { state: 'activated' },
          pushManager: {
            getSubscription: async () =>
              state.hasSubscription ? subscription() : null,
            subscribe: async () => {
              state.hasSubscription = true
              state.staleKey = false
              state.subscriptions++
              return subscription()
            },
          },
        }
        const worker = new EventTarget()
        Object.assign(worker, {
          register: async () => registration,
          getRegistration: async () => registration,
        })
        Object.defineProperty(navigator, 'serviceWorker', {
          configurable: true,
          value: worker,
        })
        Object.defineProperty(window, 'PushManager', {
          configurable: true,
          value: class {},
        })
        Object.defineProperty(window, 'Notification', {
          configurable: true,
          value: {
            get permission() {
              return state.permission
            },
            requestPermission: async () => {
              state.permissionRequests++
              if (state.permission !== 'denied') state.permission = 'granted'
              return state.permission
            },
          },
        })
      },
      { key: publicKey },
    )
    await context.route('**/api/admin/**', async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const body =
        request.method() === 'POST'
          ? (request.postDataJSON() as Record<string, unknown>)
          : null
      network.requests.push({ path, body })
      expect(request.headers().authorization).toMatch(/^Bearer /)
      if (network.failure === 'permission' && path.endsWith('/notifications')) {
        await route.fulfill({ status: 403, json: {} })
        return
      }
      if (network.failure === path) {
        await route.fulfill({ status: 503, json: {} })
        return
      }
      if (path.endsWith('/push/status'))
        await route.fulfill({
          json: {
            configured: network.configured,
            publicKey: network.configured ? publicKey : null,
            currentDevice: network.enabled
              ? { enabled: true, label: 'Navegador de escritorio' }
              : null,
          },
        })
      else if (path.endsWith('/push/subscriptions')) {
        network.enabled = true
        await route.fulfill({ json: { saved: true } })
      } else if (path.endsWith('/push/unsubscribe')) {
        network.enabled = false
        await route.fulfill({ status: 204 })
      } else if (path.endsWith('/push/test'))
        await route.fulfill({
          status: 202,
          json: { queued: true, accepted: false },
        })
      else if (path.endsWith('/notifications/read')) {
        network.items = network.items.map((item) =>
          body?.all === true ||
          (Array.isArray(body?.ids) && body.ids.includes(item.id))
            ? { ...item, read: true }
            : item,
        )
        await route.fulfill({
          json: {
            updated: 1,
            unreadCount: network.items.filter((item) => !item.read).length,
          },
        })
      } else if (path.endsWith('/notifications'))
        await route.fulfill({
          json: {
            items: network.items,
            unreadCount: network.items.filter((item) => !item.read).length,
          },
        })
      else {
        await route.fulfill({ status: 404, json: {} })
        throw new Error(`Unexpected notification route ${path}`)
      }
    })
    await provide(network)
  },
})

async function administrator(page: Page, network: SupabaseAuthNetwork) {
  network.adminMembership = true
  await signIn(page, 'admin')
  await page
    .getByLabel('Código de verificación', { exact: true })
    .fill('123456')
  await page
    .getByRole('button', { name: 'Verificar y continuar', exact: true })
    .click()
  await expect(page).toHaveURL('/admin', { timeout: 15000 })
  await page.goto('/admin/notificaciones')
  await expect(
    page.getByRole('heading', { name: 'Notificaciones', exact: true }),
  ).toBeVisible()
}

async function browserState(page: Page, changes?: Record<string, unknown>) {
  return page.evaluate((next) => {
    const state = Reflect.get(window, '__pushFixture') as Record<
      string,
      unknown
    >
    if (next) Object.assign(state, next)
    return state
  }, changes)
}

test('el estado de dispositivo comparte solo lecturas en vuelo, permite reintentos y descarta un estado anterior a desactivar', async ({
  page,
  context,
  supabaseNetwork,
  pushNetwork,
}) => {
  await administrator(page, supabaseNetwork)
  await expect(page.locator('.admin-notification-device')).toHaveAttribute(
    'aria-busy',
    'false',
  )
  let release!: () => void
  let gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let requests = 0
  await context.route('**/api/admin/push/status?*', async (route) => {
    requests++
    await gate
    await route.fallback()
  })
  const read = (twice = false) =>
    page.evaluate(async (multiple) => {
      const source = '/src/services/admin-notifications.ts'
      const { getAdminPushStatus } = await import(source)
      try {
        await Promise.all(
          multiple
            ? [getAdminPushStatus(), getAdminPushStatus()]
            : [getAdminPushStatus()],
        )
        return 'confirmed'
      } catch {
        return 'rejected'
      }
    }, twice)
  const loading = read(true)
  try {
    await expect.poll(() => requests).toBe(1)
    release()
    expect(await loading).toBe('confirmed')
    expect(await read()).toBe('confirmed')
    expect(requests).toBe(2)
    pushNetwork.failure = '/api/admin/push/status'
    expect(await read()).toBe('rejected')
    pushNetwork.failure = ''
    expect(await read()).toBe('confirmed')
    expect(requests).toBe(4)
    gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const outdated = read()
    await expect.poll(() => requests).toBe(5)
    await page.evaluate(async () => {
      const source = '/src/services/admin-notifications.ts'
      await (await import(source)).disableAdminPush()
    })
    release()
    expect(await outdated).toBe('rejected')
    expect(await read()).toBe('confirmed')
    expect(requests).toBe(6)
  } finally {
    release()
    await loading
  }
})

test('cerrar sesión mientras carga el dispositivo impide devolver su estado', async ({
  page,
  context,
  supabaseNetwork,
  pushNetwork,
}) => {
  void pushNetwork
  await administrator(page, supabaseNetwork)
  await expect(page.locator('.admin-notification-device')).toHaveAttribute(
    'aria-busy',
    'false',
  )
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let started = false
  await context.route('**/api/admin/push/status?*', async (route) => {
    started = true
    await gate
    await route.fallback()
  })
  const loading = page.evaluate(async () => {
    const source = '/src/services/admin-notifications.ts'
    try {
      await (await import(source)).getAdminPushStatus()
      return true
    } catch {
      return false
    }
  })
  try {
    await expect.poll(() => started).toBe(true)
    await page.evaluate(async () => {
      const source = '/src/services/auth-service.ts'
      await (await import(source)).authService.signOut()
    })
    release()
    expect(await loading).toBe(false)
  } finally {
    release()
    await loading
  }
})

test('el permiso es voluntario; activa, programa prueba y desactiva únicamente este dispositivo', async ({
  page,
  supabaseNetwork,
  pushNetwork,
}) => {
  await administrator(page, supabaseNetwork)
  await expect(
    page.getByRole('button', { name: 'Activar notificaciones', exact: true }),
  ).toBeEnabled()
  expect((await browserState(page)).permissionRequests).toBe(0)
  await page
    .getByRole('button', { name: 'Activar notificaciones', exact: true })
    .click()
  await expect(
    page.locator('.admin-notifications-page').getByRole('status'),
  ).toHaveText('Notificaciones activadas en este dispositivo.')
  expect((await browserState(page)).permissionRequests).toBe(1)
  const subscribe = pushNetwork.requests.find((item) =>
    item.path.endsWith('/subscriptions'),
  )!
  expect(subscribe.body).toHaveProperty('deviceId')
  expect(subscribe.body).not.toHaveProperty('userId')
  expect(subscribe.body).not.toHaveProperty('token')
  await page.getByRole('button', { name: 'Enviar prueba', exact: true }).click()
  await expect(
    page.locator('.admin-notifications-page').getByRole('status'),
  ).toContainText('Prueba programada')
  expect(
    pushNetwork.requests.find((item) => item.path.endsWith('/test'))?.body,
  ).toEqual({ deviceId: subscribe.body?.deviceId })
  await page
    .getByRole('button', {
      name: 'Desactivar en este dispositivo',
      exact: true,
    })
    .click()
  await expect(
    page.locator('.admin-notifications-page').getByRole('status'),
  ).toContainText('Notificaciones desactivadas')
  expect(pushNetwork.enabled).toBe(false)
  expect((await browserState(page)).hasSubscription).toBe(false)
})

test('un error de registro conserva el permiso y permite reintentar sin suscripciones huérfanas', async ({
  page,
  supabaseNetwork,
  pushNetwork,
}) => {
  pushNetwork.failure = '/api/admin/push/subscriptions'
  await administrator(page, supabaseNetwork)
  await page
    .getByRole('button', { name: 'Activar notificaciones', exact: true })
    .click()
  await expect(page.getByRole('alert')).toContainText(
    'todavía no están habilitadas',
  )
  expect((await browserState(page)).hasSubscription).toBe(false)
  expect(pushNetwork.enabled).toBe(false)
  pushNetwork.failure = ''
  await page
    .getByRole('button', { name: 'Activar notificaciones', exact: true })
    .click()
  await expect(
    page.locator('.admin-notifications-page').getByRole('status'),
  ).toContainText('activadas')
})

test('muestra permisos bloqueados sin volver a solicitar consentimiento', async ({
  page,
  supabaseNetwork,
  pushNetwork,
}) => {
  void pushNetwork
  await administrator(page, supabaseNetwork)
  await browserState(page, { permission: 'denied' })
  await page
    .getByRole('button', { name: 'Actualizar estado', exact: true })
    .click()
  await expect(
    page.getByText('Las notificaciones están bloqueadas.', { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Activar notificaciones', exact: true }),
  ).toBeDisabled()
  expect((await browserState(page)).permissionRequests).toBe(0)
})

test('guía a iPhone a instalar en pantalla de inicio antes de activar', async ({
  page,
  supabaseNetwork,
  pushNetwork,
}) => {
  void pushNetwork
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Safari',
    }),
  )
  await administrator(page, supabaseNetwork)
  await expect(
    page.getByText('En iPhone o iPad, añade el panel', { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Activar notificaciones', exact: true }),
  ).toBeDisabled()
  expect((await browserState(page)).permissionRequests).toBe(0)
})

test('una configuración ausente no finge disponibilidad y mantiene el centro de pedidos', async ({
  page,
  supabaseNetwork,
  pushNetwork,
}) => {
  pushNetwork.configured = false
  await administrator(page, supabaseNetwork)
  await expect(
    page.getByText('El envío push todavía no está configurado', {
      exact: false,
    }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Activar notificaciones', exact: true }),
  ).toBeDisabled()
  await page
    .getByRole('button', { name: 'Notificaciones: 1 sin leer', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toContainText('AI-TEST-0001')
})

test('la campana usa datos reales del contrato, marca leídas y restaura foco sin consultas constantes', async ({
  page,
  supabaseNetwork,
  pushNetwork,
}) => {
  await administrator(page, supabaseNetwork)
  const bell = page.getByRole('button', {
    name: 'Notificaciones: 1 sin leer',
    exact: true,
  })
  await expect(bell).toBeVisible()
  const before = pushNetwork.requests.filter(
    (request) => request.path === '/api/admin/notifications',
  ).length
  await bell.click()
  const dialog = page.getByRole('dialog')
  await expect(
    dialog.getByRole('link', { name: /Nuevo pedido confirmado/ }),
  ).toHaveAttribute('href', '/admin/pedidos/AI-TEST-0001')
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(
    pushNetwork.requests.filter(
      (request) => request.path === '/api/admin/notifications',
    ).length,
  ).toBe(before)
  await dialog
    .getByRole('button', { name: 'Marcar todas como leídas', exact: true })
    .click()
  await expect(dialog).toContainText('0 sin leer')
  await page.keyboard.press('Escape')
  await expect(
    page.getByRole('button', {
      name: 'Notificaciones: 0 sin leer',
      exact: true,
    }),
  ).toBeFocused()
})

test('la clave pública rotada permite reactivar sin acumular suscripciones', async ({
  page,
  supabaseNetwork,
  pushNetwork,
}) => {
  pushNetwork.enabled = true
  await administrator(page, supabaseNetwork)
  await browserState(page, {
    permission: 'granted',
    hasSubscription: true,
    staleKey: true,
  })
  await page
    .getByRole('button', { name: 'Actualizar estado', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Reactivar notificaciones', exact: true })
    .click()
  await expect(
    page.locator('.admin-notifications-page').getByRole('status'),
  ).toContainText('activadas')
  expect((await browserState(page)).removals).toBe(1)
  expect((await browserState(page)).subscriptions).toBe(1)
  expect(
    pushNetwork.requests.filter((request) =>
      request.path.endsWith('/unsubscribe'),
    ),
  ).toHaveLength(1)
})

test('la suscripción del navegador se retira al cerrar sesión y el centro no conserva pedidos', async ({
  page,
  supabaseNetwork,
  pushNetwork,
}) => {
  await administrator(page, supabaseNetwork)
  await page
    .getByRole('button', { name: 'Activar notificaciones', exact: true })
    .click()
  await expect(
    page.locator('.admin-notifications-page').getByRole('status'),
  ).toContainText('activadas')
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click()
  await expect(page).toHaveURL(
    '/admin/login?returnTo=%2Fadmin%2Fnotificaciones',
  )
  await expect
    .poll(async () => (await browserState(page)).hasSubscription)
    .toBe(false)
  await expect
    .poll(
      () =>
        pushNetwork.requests.filter((item) =>
          item.path.endsWith('/push/unsubscribe'),
        ).length,
    )
    .toBe(1)
  expect(
    await page.evaluate(async () => {
      const path = '/src/services/admin-notifications.ts'
      const { adminNotifications } = await import(path)
      return adminNotifications.getSnapshot().items.length as number
    }),
  ).toBe(0)
  expect(
    pushNetwork.requests.filter((item) => item.path.endsWith('/subscriptions')),
  ).toHaveLength(1)
})

test('una denegación del servidor retira inmediatamente los avisos privados ya cargados', async ({
  page,
  supabaseNetwork,
  pushNetwork,
}) => {
  await administrator(page, supabaseNetwork)
  await page
    .getByRole('button', { name: 'Notificaciones: 1 sin leer', exact: true })
    .click()
  await expect(
    page.getByRole('dialog').getByText('AI-TEST-0001', { exact: true }),
  ).toBeVisible()
  pushNetwork.failure = 'permission'
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Actualizar', exact: true })
    .click()
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'debe verificarse',
  )
  await expect(page.getByRole('dialog').getByText('AI-TEST-0001')).toHaveCount(
    0,
  )
})

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`captura y teclado en ${viewport.width}×${viewport.height}`, async ({
    page,
    supabaseNetwork,
    pushNetwork,
  }) => {
    void pushNetwork
    await page.setViewportSize(viewport)
    await administrator(page, supabaseNetwork)
    await expect(
      page.getByRole('button', { name: 'Activar notificaciones', exact: true }),
    ).toBeEnabled()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    const screenshotPath = 'artifacts/admin-notifications/screenshots'
    await mkdir(screenshotPath, { recursive: true })
    await page.screenshot({
      path: `${screenshotPath}/settings-${viewport.width}.png`,
      fullPage: true,
    })
    await page
      .getByRole('button', { name: 'Notificaciones: 1 sin leer', exact: true })
      .click()
    await expect(page.getByRole('dialog')).toBeVisible()
    expect(
      await page
        .getByRole('dialog')
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true)
    await page.screenshot({
      path: `${screenshotPath}/center-${viewport.width}.png`,
      fullPage: true,
    })
    await page.keyboard.press('Escape')
    await expect(
      page.getByRole('button', {
        name: 'Notificaciones: 1 sin leer',
        exact: true,
      }),
    ).toBeFocused()
  })
}
