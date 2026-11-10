import { authService } from './auth-service'
import { requireSupabaseClient } from './supabase-client'
import { mediaApiBaseUrl } from './asset-source'
import { runtimeEnvironment } from './runtime-environment'
import { getAdminPushRegistration } from './admin-pwa'
import { UserFacingError } from './admin-messages'

export interface AdminNotification {
  id: string
  kind: 'new_order'
  orderReference: string
  createdAt: string
  read: boolean
}

export interface AdminNotificationSnapshot {
  items: AdminNotification[]
  unreadCount: number
  loading: boolean
  loaded: boolean
  error: string
}

export interface AdminPushStatus {
  configured: boolean
  publicKey: string | null
  currentDevice: { enabled: boolean; label: string } | null
}

const emptySnapshot: AdminNotificationSnapshot = {
  items: [],
  unreadCount: 0,
  loading: false,
  loaded: false,
  error: '',
}
let snapshot = emptySnapshot
let owner = ''
let generation = 0
let lastRefresh = 0
let inFlight: Promise<void> | null = null
const pendingStatus = new Map<string, Promise<unknown>>()
let statusRevision = 0
function invalidateStatus() {
  statusRevision++
  pendingStatus.clear()
}
const listeners = new Set<() => void>()
let detach: (() => void) | undefined
const deviceKey = `aroma-infini:${runtimeEnvironment}:admin-push-device`

function currentOwner() {
  const state = authService.getSnapshot()
  return state.status === 'authenticated' &&
    state.session?.user.role === 'admin' &&
    !state.session.mfaRequired &&
    state.session.intent === 'account'
    ? state.session.user.id
    : ''
}

function publish(next: AdminNotificationSnapshot) {
  snapshot = next
  listeners.forEach((listener) => listener())
}

function synchronizeOwner() {
  const next = currentOwner()
  if (next === owner) return
  owner = next
  generation++
  inFlight = null
  invalidateStatus()
  lastRefresh = 0
  publish(emptySnapshot)
}

function failure(code: string, message: string): never {
  throw new UserFacingError(code, message)
}

export function adminNotificationError(error: unknown) {
  return error instanceof UserFacingError
    ? error.message
    : 'No pudimos completar la operación. Revisa tu conexión e inténtalo de nuevo.'
}

async function api(
  path: string,
  body?: unknown,
  timeout = 15000,
): Promise<unknown> {
  synchronizeOwner()
  const expected = currentOwner()
  const expectedGeneration = generation
  const expectedStatusRevision = statusRevision
  if (!expected)
    failure(
      'push-session',
      'Inicia sesión con tu cuenta administradora y completa la verificación en dos pasos.',
    )
  const origin = mediaApiBaseUrl()
  if (origin === null)
    failure(
      'push-config',
      'El servicio de notificaciones no está disponible en este entorno.',
    )
  const { data, error } = await requireSupabaseClient().auth.getSession()
  if (
    error ||
    !data.session ||
    data.session.user.id !== expected ||
    currentOwner() !== expected
  )
    failure(
      'push-session',
      'Tu sesión cambió. Vuelve a iniciar sesión para continuar.',
    )
  const token = data.session.access_token
  const isStatus =
    body === undefined && path.startsWith('/api/admin/push/status?')
  const statusKey = JSON.stringify([
    token,
    expectedGeneration,
    expectedStatusRevision,
    path,
  ])
  async function checkSession() {
    const latest = await requireSupabaseClient().auth.getSession()
    if (
      generation !== expectedGeneration ||
      currentOwner() !== expected ||
      latest.error ||
      latest.data.session?.user.id !== expected ||
      latest.data.session.access_token !== token
    )
      failure(
        'push-session',
        'Tu sesión cambió. Vuelve a iniciar sesión para continuar.',
      )
    if (isStatus && expectedStatusRevision !== statusRevision)
      failure('push-changed', 'El dispositivo cambió. Actualiza su estado.')
  }
  const pending = isStatus ? pendingStatus.get(statusKey) : undefined
  if (pending) {
    const result = await pending
    await checkSession()
    return result
  }
  const task = (async () => {
    const response = await fetch(`${origin}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(timeout),
    })
    await checkSession()
    if (!response.ok) {
      if (response.status === 401 || response.status === 403)
        failure(
          'push-session',
          'Tu sesión administrativa debe verificarse de nuevo. Inicia sesión y completa la verificación en dos pasos.',
        )
      if (response.status === 429)
        failure('push-rate', 'Espera un minuto antes de volver a intentarlo.')
      if (response.status === 503)
        failure(
          'push-unavailable',
          'Las notificaciones de este entorno todavía no están habilitadas. El centro de pedidos sigue disponible.',
        )
      if (response.status === 409)
        failure(
          'push-conflict',
          'Este navegador tiene una suscripción anterior. Desactívala y vuelve a activarla con tu cuenta actual.',
        )
      failure(
        'push-request',
        'No pudimos completar la operación. Actualiza el estado e inténtalo de nuevo.',
      )
    }
    const result = response.status === 204 ? null : await response.json()
    await checkSession()
    if (
      body !== undefined &&
      (path.endsWith('/subscriptions') || path.endsWith('/unsubscribe'))
    )
      invalidateStatus()
    return result
  })().finally(() => {
    if (pendingStatus.get(statusKey) === task) pendingStatus.delete(statusKey)
  })
  if (isStatus) pendingStatus.set(statusKey, task)
  return task
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function parseCenter(
  value: unknown,
): Pick<AdminNotificationSnapshot, 'items' | 'unreadCount'> {
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    value.items.length > 20 ||
    !Number.isSafeInteger(value.unreadCount) ||
    Number(value.unreadCount) < 0
  )
    failure(
      'push-response',
      'No pudimos leer las notificaciones. Inténtalo de nuevo.',
    )
  const items = value.items.map((item: unknown): AdminNotification => {
    if (
      !record(item) ||
      typeof item.id !== 'string' ||
      item.kind !== 'new_order' ||
      typeof item.orderReference !== 'string' ||
      !item.orderReference ||
      item.orderReference.length > 120 ||
      typeof item.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(item.createdAt)) ||
      typeof item.read !== 'boolean'
    )
      failure(
        'push-response',
        'No pudimos leer las notificaciones. Inténtalo de nuevo.',
      )
    return {
      id: item.id,
      kind: item.kind,
      orderReference: item.orderReference,
      createdAt: item.createdAt,
      read: item.read,
    }
  })
  return { items, unreadCount: Number(value.unreadCount) }
}

async function refresh(force = false) {
  synchronizeOwner()
  if (
    !owner ||
    inFlight ||
    (!force && lastRefresh && Date.now() - lastRefresh < 60000)
  )
    return inFlight
  const expectedGeneration = generation
  lastRefresh = Date.now()
  publish({ ...snapshot, loading: true, error: '' })
  inFlight = (async () => {
    try {
      const result = parseCenter(await api('/api/admin/notifications?limit=20'))
      if (generation === expectedGeneration)
        publish({ ...result, loaded: true, loading: false, error: '' })
    } catch (error) {
      if (generation === expectedGeneration)
        publish({
          ...(error instanceof UserFacingError && error.code === 'push-session'
            ? emptySnapshot
            : snapshot),
          loading: false,
          error: adminNotificationError(error),
        })
    } finally {
      if (generation === expectedGeneration) inFlight = null
    }
  })()
  return inFlight
}

export const adminNotifications = {
  getSnapshot: () => snapshot,
  subscribe(listener: () => void) {
    listeners.add(listener)
    if (!detach) {
      synchronizeOwner()
      const unsubscribeAuth = authService.subscribe(synchronizeOwner)
      const onFocus = () => {
        if (document.visibilityState === 'visible') void refresh()
      }
      const onPush = (event: MessageEvent<unknown>) => {
        if (
          record(event.data) &&
          event.data.type === 'ADMIN_NOTIFICATION_RECEIVED'
        )
          void refresh(true)
      }
      window.addEventListener('focus', onFocus)
      document.addEventListener('visibilitychange', onFocus)
      navigator.serviceWorker?.addEventListener('message', onPush)
      detach = () => {
        unsubscribeAuth()
        window.removeEventListener('focus', onFocus)
        document.removeEventListener('visibilitychange', onFocus)
        navigator.serviceWorker?.removeEventListener('message', onPush)
      }
    }
    return () => {
      listeners.delete(listener)
      if (!listeners.size) {
        detach?.()
        detach = undefined
      }
    }
  },
  refresh,
  async markRead(ids: string[] | 'all') {
    await api(
      '/api/admin/notifications/read',
      ids === 'all' ? { all: true } : { ids },
    )
    await refresh(true)
  },
}

export function getAdminPushDeviceId() {
  try {
    const saved = localStorage.getItem(deviceKey)
    if (
      saved &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        saved,
      )
    )
      return saved
    const id = crypto.randomUUID()
    localStorage.setItem(deviceKey, id)
    return id
  } catch {
    return failure(
      'push-storage',
      'Permite el almacenamiento de este sitio para activar las notificaciones en este dispositivo.',
    )
  }
}

export function adminPushCapabilities() {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return {
    ios,
    standalone,
    secure: window.isSecureContext,
    supported:
      window.isSecureContext &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window,
    permission:
      'Notification' in window
        ? Notification.permission
        : ('unsupported' as const),
  }
}

export async function getAdminPushStatus(): Promise<AdminPushStatus> {
  const result = await api(
    `/api/admin/push/status?deviceId=${getAdminPushDeviceId()}`,
  )
  if (
    !record(result) ||
    typeof result.configured !== 'boolean' ||
    !(result.publicKey === null || typeof result.publicKey === 'string') ||
    !(
      result.currentDevice === null ||
      (record(result.currentDevice) &&
        typeof result.currentDevice.enabled === 'boolean' &&
        typeof result.currentDevice.label === 'string')
    )
  )
    failure(
      'push-response',
      'No pudimos consultar este dispositivo. Inténtalo de nuevo.',
    )
  const value = result.currentDevice
  let currentDevice: AdminPushStatus['currentDevice'] = null
  if (value !== null) {
    if (
      !record(value) ||
      typeof value.enabled !== 'boolean' ||
      typeof value.label !== 'string'
    )
      failure(
        'push-response',
        'No pudimos consultar este dispositivo. Inténtalo de nuevo.',
      )
    currentDevice = { enabled: value.enabled, label: value.label }
  }
  return {
    configured: result.configured,
    publicKey: result.publicKey,
    currentDevice,
  }
}

function publicKeyBytes(key: string) {
  if (!/^[A-Za-z0-9_-]{87}$/.test(key))
    failure(
      'push-key',
      'La configuración de notificaciones no está disponible.',
    )
  const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '=')
  return Uint8Array.from(raw, (character) => character.charCodeAt(0)).buffer
}

function samePublicKey(subscription: PushSubscription, publicKey: string) {
  const existing = subscription.options.applicationServerKey
  if (!existing) return false
  const expected = new Uint8Array(publicKeyBytes(publicKey))
  const actual = new Uint8Array(existing)
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  )
}

/** Reads browser state only; it never registers or requests permission. */
export async function inspectAdminPushSubscription(
  publicKey: string | null,
): Promise<'missing' | 'current' | 'outdated'> {
  if (!publicKey || !('serviceWorker' in navigator)) return 'missing'
  const registration = await navigator.serviceWorker.getRegistration('/admin/')
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return 'missing'
  return samePublicKey(subscription, publicKey) ? 'current' : 'outdated'
}

export async function enableAdminPush(status: AdminPushStatus) {
  const capability = adminPushCapabilities()
  if (!capability.supported || (capability.ios && !capability.standalone))
    failure(
      'push-browser',
      'Abre el panel desde una app instalada o un navegador compatible para activar las notificaciones.',
    )
  if (!status.configured || !status.publicKey)
    failure(
      'push-config',
      'Las notificaciones de este entorno todavía no están habilitadas.',
    )
  // Called directly by the activation button: no automatic permission prompts.
  const permission = await Notification.requestPermission()
  if (permission !== 'granted')
    failure(
      'push-permission',
      permission === 'denied'
        ? 'Las notificaciones están bloqueadas. Permítelas en los ajustes del navegador y vuelve a intentarlo.'
        : 'No se activaron las notificaciones. Puedes volver a intentarlo cuando quieras.',
    )
  const registration = await getAdminPushRegistration()
  let previous = await registration.pushManager.getSubscription()
  if (previous && !samePublicKey(previous, status.publicKey)) {
    await api('/api/admin/push/unsubscribe', {
      deviceId: getAdminPushDeviceId(),
    })
    await previous.unsubscribe()
    previous = null
  }
  const subscription =
    previous ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: publicKeyBytes(status.publicKey),
    }))
  const serialized = subscription.toJSON()
  try {
    if (
      !serialized.endpoint ||
      !serialized.keys?.p256dh ||
      !serialized.keys.auth
    )
      failure(
        'push-subscription',
        'El navegador no pudo registrar este dispositivo. Inténtalo de nuevo.',
      )
    await api('/api/admin/push/subscriptions', {
      deviceId: getAdminPushDeviceId(),
      deviceLabel: capability.ios
        ? 'iPhone / iPad'
        : /Android/.test(navigator.userAgent)
          ? 'Android'
          : 'Navegador de escritorio',
      subscription: {
        endpoint: serialized.endpoint,
        keys: { p256dh: serialized.keys.p256dh, auth: serialized.keys.auth },
      },
    })
  } catch (error) {
    if (!previous) await subscription.unsubscribe().catch(() => undefined)
    throw error
  }
}

async function localUnsubscribe() {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration('/admin/')
  const subscription = await registration?.pushManager.getSubscription()
  await subscription?.unsubscribe()
}

export async function disableAdminPush() {
  await api('/api/admin/push/unsubscribe', { deviceId: getAdminPushDeviceId() })
  await localUnsubscribe()
}

export async function testAdminPush() {
  await api('/api/admin/push/test', { deviceId: getAdminPushDeviceId() })
}

/** Called before the authenticated session is removed; failure never retains it. */
export async function disableAdminPushOnSignOut() {
  const expectedOwner = currentOwner()
  // Capture the session request before authService clears its UI state. This
  // narrow opt-out may finish after logout; reads and other mutations may not.
  const sessionRequest = expectedOwner
    ? requireSupabaseClient().auth.getSession()
    : null
  const browserRemoval = localUnsubscribe().catch(() => undefined)
  try {
    const deviceId = localStorage.getItem(deviceKey)
    const result = await sessionRequest
    const origin = mediaApiBaseUrl()
    if (
      deviceId &&
      expectedOwner &&
      origin !== null &&
      result?.data.session?.user.id === expectedOwner
    ) {
      await fetch(`${origin}/api/admin/push/unsubscribe`, {
        method: 'POST',
        cache: 'no-store',
        keepalive: true,
        headers: {
          Authorization: `Bearer ${result.data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ deviceId }),
        signal: AbortSignal.timeout(2500),
      })
    }
  } finally {
    await browserRemoval
    generation++
    inFlight = null
    invalidateStatus()
    lastRefresh = 0
    publish(emptySnapshot)
  }
}
